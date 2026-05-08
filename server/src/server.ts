/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
//// <reference path="../src/sbs.pyi" />
import {
	createConnection,
	TextDocuments,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	DocumentDiagnosticReportKind,
	type DocumentDiagnosticReport,
	SignatureHelp,
	SignatureHelpParams,
	Hover,
	TextDocumentChangeEvent,
	Definition,
	Location,
	DefinitionParams,
	ReferenceParams,
	Diagnostic,
	RenameParams,
	WorkspaceEdit,
	HandlerResult,
	PrepareRenameParams,
	TextDocumentEdit,
	CodeAction,
	Command,
	CodeActionKind,
	TextEdit,
	Position,
	SemanticTokensParams

} from 'vscode-languageserver/node';
import { Range, TextDocument } from 'vscode-languageserver-textdocument';
import { LabelInfo } from './tokens/labels';
import { onCompletion } from './requests/autocompletion';
import { debug} from 'console';
import { getCurrentLineFromTextDocument, getHoveredSymbol, onHover } from './requests/hover';
import { onSignatureHelp } from './requests/signatureHelp';
import fs = require("fs");
import { getArtemisGlobals, initializeArtemisGlobals } from './artemisGlobals';
import { compileMastFile, getCurrentDiagnostics, validateTextDocument } from './requests/validate';
import { onDefinition } from './requests/goToDefinition';
import { getCache } from './cache';
import { onReferences } from './requests/references';
import { onPrepareRename, onRenameRequest } from './requests/renameSymbol';
import { getWordRangeAtPosition } from './tokens/words';
import { getSemanticTokens, TOKEN_TYPES, TOKEN_MODIFIERS, getEmptySemanticTokens, tokenizeDocument, buildSemanticTokens } from './requests/semanticTokens';
import { getSemanticTokensCache } from './requests/semanticTokensCache';

function createNoopConnection(): any {
	const noop = () => undefined;
	const asyncNoop = async () => undefined;

	return new Proxy({}, {
		get: (_target, prop: string | symbol) => {
			if (prop === 'window') {
				return {
					showErrorMessage: asyncNoop,
					showWarningMessage: asyncNoop,
					showInformationMessage: asyncNoop,
				};
			}

			if (prop === 'workspace') {
				return {
					getConfiguration: asyncNoop,
					onDidChangeWorkspaceFolders: noop,
				};
			}

			if (prop === 'languages') {
				return {
					diagnostics: {
						refresh: noop,
						on: noop,
					},
					semanticTokens: {
						on: noop,
					},
				};
			}

			if (prop === 'client') {
				return {
					register: noop,
				};
			}

			if (prop === 'console') {
				return {
					log: debug,
					error: debug,
				};
			}

			return noop;
		}
	});
}

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
type LspConnection = ReturnType<typeof createConnection>;
let connectionImpl: LspConnection;
try {
	connectionImpl = createConnection(ProposedFeatures.all);
} catch (err) {
	const isMochaProcess = process.argv.some((arg) => arg.toLowerCase().includes('mocha')) || !!process.env.MOCHA_WORKER_ID;
	if (!isMochaProcess) {
		debug('No LSP transport detected; using noop server connection (test/import mode).');
		debug(String(err));
	}
	connectionImpl = createNoopConnection() as LspConnection;
}
export const connection: LspConnection = connectionImpl;

// Create a simple text document manager.
export const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = true;
export let hasDiagnosticRelatedInformationCapability = false;
let allowMultipleCaches = true;
let cacheTimeout = 0;
let enablePythonCompletions = true;
export let labelNames : LabelInfo[] = [];

async function refreshRuntimeSettings(): Promise<void> {
	const mastLanguageServerConfig = await connection.workspace.getConfiguration("mastLanguageServer");
	allowMultipleCaches = mastLanguageServerConfig?.allowMultipleCaches ?? true;
	cacheTimeout = mastLanguageServerConfig?.cacheTimeout ?? 0;
	enablePythonCompletions = mastLanguageServerConfig?.enablePythonCompletions ?? true;
}

// let functionData : SignatureInformation[] = [];
// export function appendFunctionData(si: SignatureInformation) {functionData.push(si);}
// export function getFunctionData(): SignatureInformation[] { return functionData; }


// const supportedRoutes: string[][] = [];
// export function getSupportedRoutes(): string[][] { return supportedRoutes; }


/**
 * Semantic tokens are now implemented via getSemanticTokens()
 * See requests/semanticTokens.ts for implementation
 */
connection.onInitialize((params: InitializeParams) => {
	// These are only executed on startup
	
	
	//const zip : Promise<void> = extractZip("","./sbs");

	//pyTypings = pyTypings.concat(parseTyping(fs.readFileSync("sbs.pyi","utf-8")));
	//debug(JSON.stringify(pyTypings));
	const capabilities = params.capabilities;
	
	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);
	if (capabilities.workspace && capabilities.workspace.configuration) {
		debug("Config true!!!");
		capabilities.workspace.configuration;
	}
	//debugStrs += capabilities.textDocument?.documentLink + "\n";

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			inlineCompletionProvider: true,
			completionProvider: {
				resolveProvider: true,
				// TODO: The /, >, and especially the space are hopefully temporary workarounds.
				triggerCharacters: [".","/",">","<"," ","\"","\'","@","=","(",")","{",","]
			},
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false
			},
			definitionProvider: true,
			// TODO: Implement code actions and command providers
			codeActionProvider: true,
			executeCommandProvider: {
				commands: [
					// TODO: Here we add the command names - for QuickFix
					//'labels.fix'
					// 'labels.route.enable',
					'fix_fstring',
					"fix_all_fstrings"
				]
			},
			signatureHelpProvider: {
				triggerCharacters: ['(',',']
			},
			hoverProvider: true,
			semanticTokensProvider: {
				legend: {
					tokenTypes: [...TOKEN_TYPES],
					tokenModifiers: [...TOKEN_MODIFIERS]
				},
				full: true,
				range: false
			},
			referencesProvider: true,
			renameProvider: true
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	// showProgressBar(true);
	if (params.workspaceFolders) {
		
		// debug("Loading cache");
		// for (const workspaceFolder of params.workspaceFolders) {
		// 	// const workspaceFolder = params.workspaceFolders[0];
		// 	debug("Loading cache for " + workspaceFolder.name);
		// 	const uri = URI.parse(workspaceFolder.uri);
		// 	// loadCache(uri.fsPath);
		// 	try {
		// 		if (fs.existsSync(uri.fsPath)) {
		// 			let cache = getCache(uri.fsPath);
		// 		}
		// 	} catch (e) {
		// 		debug(e);
		// 	}
		// }
		// debug("Cache loaded")
		
		// initializeGlobals().then(()=>{
		// 	debug("Global data compiled");
		// })
	} else {
		debug("No Workspace folders");
	}
	return result;
});

connection.onInitialized(async () => {

	debug("Initialized");
	
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			console.log('Workspace folder change event received.');
		});

	}
	
	// Get config information
	await refreshRuntimeSettings();

	// let p = new PyFile("G:\\Artemis Installs\\Cosmos-1-1-7\\data\\missions\\sbs_utils\\sbs_utils\\agent.py");
	// debug(p);
	
	// connection.workspace.getWorkspaceFolders().then((folders)=>{
	// 	debug(folders);
	// 	// progressUpdate(100);
	// })
	
});
connection.onCodeAction((params) => {
	const textDocument = documents.get(params.textDocument.uri);
	if (textDocument === undefined) {
		return undefined;
	}
	let ret = [];
	// debug(params);
	for (const diagnostic of params.context.diagnostics) {
		
		if (diagnostic.data === "fstring_err") {
			let title = "Fix this f-strings";
			// let ca = CodeAction.create(title, Command.create(title, 'fix_fstring', textDocument.uri, diagnostic), CodeActionKind.QuickFix)
			let ca = CodeAction.create(title, CodeActionKind.QuickFix);

			let tde:TextEdit = {
				range: {start:diagnostic.range.start,end:diagnostic.range.start},
				newText: "f"
			}
			let tEdits:TextEdit[] = [];
			tEdits.push(tde);

			let edit:WorkspaceEdit = {
				changes:{
					[textDocument.uri]: tEdits
				}
			}
			ca.edit = edit
			ret.push(ca);
			///////
			
			// All this is irrelevant here; the params.context.diagnostics parameter doesn't include ALL diagnostics.
			// It only includes them at a particular point. So we need to have another way to get all the available diagnostics.

			title = "Fix all f-strings in file";
			ca = CodeAction.create(title, CodeActionKind.QuickFix)

			tEdits = [];
			// Get ALL the fstring_err diagnostics
			for (const d of getCurrentDiagnostics()) {
				if (d.data === "fstring_err") {
					tde = {
						range: {start: d.range.start, end: d.range.start},
						newText: "f"
					}
					tEdits.push(tde)
				}
			}
			edit = {
				changes:{
					[textDocument.uri]: tEdits
				}
			}
			ca.edit = edit
			ret.push(ca);
		}
	}
	return ret; 
	// [
	// 	// TODO: Here we add CodeActions (i.e. commands) for QuickFixes
	// 	//CodeAction.create(title, Command.create(title, 'sample.fixMe', textDocument.uri), CodeActionKind.QuickFix)
	// 	// CodeAction.create("Add enable line",CodeActionKind.QuickFix),
		
	// ];
});
// connection.onExecuteCommand(async (params) => {
// 	//TODO: Here we execute the commands
// 	if (params.arguments === undefined) {
// 		return;
// 	}
// 	const textDocument = documents.get(params.arguments[0]);
// 	const diagnostic = params.arguments[1];
// 	if (textDocument === undefined) return;
// 	if (diagnostic === undefined) return;

// 	// const textDocument = documents.get(params.arguments[0]);
// 	// if (textDocument === undefined) {
// 	// 	return;
// 	// }
// 	// const newText = typeof params.arguments[1] === 'string' ? params.arguments[1] : 'Eclipse';
	
// 	const edits: TextDocumentEdit[] = [];

// 	if (params.command === "fix_fstring") {
// 		debug("Fixing fstring...")

// 		let tde = TextDocumentEdit.create({ uri: textDocument.uri, version: textDocument.version }, [
// 			// TextEdit.insert(Position.create(0, 0), "f")
// 			TextEdit.insert(diagnostic.range.start, "f")
// 		])

// 		edits.push(tde);
// 	}

// 	connection.workspace.applyEdit({
// 		documentChanges: edits
// 	});

// });

// The example settings
interface MAST_Settings {
	maxNumberOfProblems: number;
	allowMultipleCaches: boolean;
	cacheTimout: number;
	autoCompile: boolean;
	compileDiagnosticsDelayMs: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: MAST_Settings = { 
	maxNumberOfProblems: 1000,
	allowMultipleCaches: true,
	cacheTimout: 0,
	autoCompile: true,
	compileDiagnosticsDelayMs: 250
};
let globalSettings: MAST_Settings = defaultSettings;

// Cache the settings of all open documents
const documentSettings = new Map<string, Thenable<MAST_Settings>>();

const REGULAR_DIAGNOSTICS_DELAY_MS = 250;
const pendingValidationDiagnosticsPublish = new Map<string, ReturnType<typeof setTimeout>>();
const pendingCompileDiagnosticsPublish = new Map<string, ReturnType<typeof setTimeout>>();
const publishedValidationDiagnostics = new Map<string, Diagnostic[]>();
const publishedCompileDiagnostics = new Map<string, Diagnostic[]>();
let activeCompilationCount = 0;

function updateCompileActivity(started: boolean): void {
	const previousCount = activeCompilationCount;
	activeCompilationCount = Math.max(0, activeCompilationCount + (started ? 1 : -1));
	if (previousCount === 0 && activeCompilationCount > 0) {
		sendToClient('compileStatus', { active: true });
	} else if (previousCount > 0 && activeCompilationCount === 0) {
		sendToClient('compileStatus', { active: false });
	}
}

async function runCompileMastFileWithStatus(document: TextDocument): Promise<Diagnostic[]> {
	updateCompileActivity(true);
	try {
		return await compileMastFile(document);
	} finally {
		updateCompileActivity(false);
	}
}

async function resolveDocumentSettings(resource?: string): Promise<MAST_Settings> {
	if (!hasConfigurationCapability || !resource) {
		return globalSettings;
	}

	const mastLanguageServerConfig = await connection.workspace.getConfiguration({
		scopeUri: resource,
		section: 'mastLanguageServer'
	});

	return {
		maxNumberOfProblems: mastLanguageServerConfig?.maxNumberOfProblems ?? defaultSettings.maxNumberOfProblems,
		allowMultipleCaches: mastLanguageServerConfig?.allowMultipleCaches ?? defaultSettings.allowMultipleCaches,
		cacheTimout: mastLanguageServerConfig?.cacheTimout ?? defaultSettings.cacheTimout,
		autoCompile: mastLanguageServerConfig?.autoCompile ?? defaultSettings.autoCompile,
		compileDiagnosticsDelayMs: mastLanguageServerConfig?.compileDiagnosticsDelayMs ?? defaultSettings.compileDiagnosticsDelayMs
	};
}

function getPublishedDiagnostics(uri: string): Diagnostic[] {
	return (publishedValidationDiagnostics.get(uri) || []).concat(publishedCompileDiagnostics.get(uri) || []);
}

function publishMergedDiagnostics(uri: string): void {
	connection.sendDiagnostics({ uri, diagnostics: getPublishedDiagnostics(uri) });
}

async function computeValidationDiagnosticsForDocument(document: TextDocument): Promise<Diagnostic[]> {
	let cache = getCache(document.uri);
	await cache.awaitLoaded();
	return validateTextDocument(document);
}

async function computeDiagnosticsForDocument(document: TextDocument): Promise<Diagnostic[]> {
	const settings = await getDocumentSettings(document.uri);
	let [val, comp]: [Diagnostic[], Diagnostic[]] = await Promise.all([
		computeValidationDiagnosticsForDocument(document),
		settings.autoCompile ? runCompileMastFileWithStatus(document) : Promise.resolve([])
	]);
	publishedValidationDiagnostics.set(document.uri, val);
	if (comp.length > 0) {
		publishedCompileDiagnostics.set(document.uri, comp);
	} else {
		publishedCompileDiagnostics.delete(document.uri);
	}
	return val.concat(comp);
}

function scheduleValidationDiagnosticsPublish(uri: string): void {
	const existing = pendingValidationDiagnosticsPublish.get(uri);
	if (existing) {
		clearTimeout(existing);
	}

	const handle = setTimeout(async () => {
		pendingValidationDiagnosticsPublish.delete(uri);
		const document = documents.get(uri);
		if (!document || document.languageId !== 'mast') {
			return;
		}

		try {
			const diagnostics = await computeValidationDiagnosticsForDocument(document);
			publishedValidationDiagnostics.set(uri, diagnostics);
			publishMergedDiagnostics(uri);
		} catch (e) {
			debug(e);
		}
	}, REGULAR_DIAGNOSTICS_DELAY_MS);

	pendingValidationDiagnosticsPublish.set(uri, handle);
}

function scheduleCompileDiagnosticsPublish(uri: string, delayMs: number): void {
	const existing = pendingCompileDiagnosticsPublish.get(uri);
	if (existing) {
		clearTimeout(existing);
	}

	const handle = setTimeout(async () => {
		pendingCompileDiagnosticsPublish.delete(uri);
		const document = documents.get(uri);
		if (!document || document.languageId !== 'mast') {
			return;
		}

		try {
			const settings = await getDocumentSettings(uri);
			if (!settings.autoCompile) {
				publishedCompileDiagnostics.delete(uri);
				publishMergedDiagnostics(uri);
				return;
			}

			const diagnostics = await runCompileMastFileWithStatus(document);
			if (diagnostics.length > 0) {
				publishedCompileDiagnostics.set(uri, diagnostics);
			} else {
				publishedCompileDiagnostics.delete(uri);
			}
			publishMergedDiagnostics(uri);
		} catch (e) {
			debug(e);
		}
	}, Math.max(0, delayMs));

	pendingCompileDiagnosticsPublish.set(uri, handle);
}

connection.onDidChangeConfiguration(async change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		const mastLanguageServerConfig = change.settings?.mastLanguageServer;
		globalSettings = {
			maxNumberOfProblems: mastLanguageServerConfig?.maxNumberOfProblems ?? defaultSettings.maxNumberOfProblems,
			allowMultipleCaches: mastLanguageServerConfig?.allowMultipleCaches ?? defaultSettings.allowMultipleCaches,
			cacheTimout: mastLanguageServerConfig?.cacheTimout ?? defaultSettings.cacheTimout,
			autoCompile: mastLanguageServerConfig?.autoCompile ?? defaultSettings.autoCompile,
			compileDiagnosticsDelayMs: mastLanguageServerConfig?.compileDiagnosticsDelayMs ?? defaultSettings.compileDiagnosticsDelayMs
		};
	}
	await refreshRuntimeSettings();
	// Refresh the diagnostics since the `maxNumberOfProblems` could have changed.
	// We could optimize things here and re-fetch the setting first can compare it
	// to the existing setting, but this is out of scope for this example.
	connection.languages.diagnostics.refresh();
});

export function getDocumentSettings(resource: string): Thenable<MAST_Settings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = resolveDocumentSettings(resource);
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	// This would break things, because it's only CLOSING, not DELETING
	// if (e.document.uri.endsWith(".py")) {
	// 	getCache(e.document.uri).removePyFile(e.document.uri)
	// } else if (e.document.uri.endsWith(".mast")) {
	// 	getCache(e.document.uri).removeMastFile(e.document.uri)
	// }
	documentSettings.delete(e.document.uri);
	const pendingValidationPublish = pendingValidationDiagnosticsPublish.get(e.document.uri);
	if (pendingValidationPublish) {
		clearTimeout(pendingValidationPublish);
		pendingValidationDiagnosticsPublish.delete(e.document.uri);
	}
	const pendingCompilePublish = pendingCompileDiagnosticsPublish.get(e.document.uri);
	if (pendingCompilePublish) {
		clearTimeout(pendingCompilePublish);
		pendingCompileDiagnosticsPublish.delete(e.document.uri);
	}
	publishedValidationDiagnostics.delete(e.document.uri);
	publishedCompileDiagnostics.delete(e.document.uri);
	if (e.document.languageId === 'mast') {
		connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
	}
	// Invalidate semantic tokens cache for this document
	getSemanticTokensCache().invalidate(e.document.uri);
});

connection.languages.diagnostics.on(async (params) => {
	let ret = {
		kind: DocumentDiagnosticReportKind.Full,
		items: []
	} satisfies DocumentDiagnosticReport;
	//TODO: get info from other files in same directory
	const document = documents.get(params.textDocument.uri);

	if (document !== undefined) {
		if (document.languageId !== "mast") return ret;
		try {
			let ret: Diagnostic[];
			if (
				publishedValidationDiagnostics.has(document.uri) ||
				publishedCompileDiagnostics.has(document.uri) ||
				pendingValidationDiagnosticsPublish.has(document.uri) ||
				pendingCompileDiagnosticsPublish.has(document.uri)
			) {
				ret = getPublishedDiagnostics(document.uri);
			} else {
				ret = await computeDiagnosticsForDocument(document);
			}
			
			// debug("Validation complete.");
			return {
				kind: DocumentDiagnosticReportKind.Full,
				items: ret
				// items: await validateTextDocument(document)
			} satisfies DocumentDiagnosticReport;
		} catch(e) {
			debug(e);
			return ret;
		}
	} else {
		// We don't know the document. We can either try to read it from disk
		// or we don't report problems for it.
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: []
		} satisfies DocumentDiagnosticReport;
	}
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
// 
//
/**
 * {@link TextDocument TextDocument}
 * {@link TextDocumentChangeEvent TextDocumentChangeEvent}
 */
documents.onDidChangeContent(change => {
	try {
		const updateStart = Date.now();
		const doc = change.document;
		if (!doc.uri.endsWith('.mast') && !doc.uri.endsWith('.py')) {
			return;
		}

		const cache = getCache(doc.uri);
		cache.updateFileInfo(doc);
		const updateElapsed = Date.now() - updateStart;
		if (updateElapsed > 15) {
			console.log(`[perf] onDidChangeContent ${updateElapsed}ms | ${doc.languageId} | ${doc.uri}`);
		}

		// Invalidate semantic token cache so next request recomputes from new text
		getSemanticTokensCache().invalidate(doc.uri);
		if (doc.uri.endsWith('.mast')) {
			publishedValidationDiagnostics.delete(doc.uri);
			publishedCompileDiagnostics.delete(doc.uri);
			publishMergedDiagnostics(doc.uri);
			scheduleValidationDiagnosticsPublish(doc.uri);
			void (async () => {
				try {
					const settings = await getDocumentSettings(doc.uri);
					if (!documents.get(doc.uri)) {
						return;
					}
					if (!settings.autoCompile) {
						const pendingCompilePublish = pendingCompileDiagnosticsPublish.get(doc.uri);
						if (pendingCompilePublish) {
							clearTimeout(pendingCompilePublish);
							pendingCompileDiagnosticsPublish.delete(doc.uri);
						}
						return;
					}
					scheduleCompileDiagnosticsPublish(doc.uri, settings.compileDiagnosticsDelayMs);
				} catch (e) {
					debug(e);
				}
			})();
		}
	} catch (e) {
		debug(e);
		console.error(e);
	}
});



// // This doesn't seem to work. IDK why.
// connection.onDidChangeTextDocument((params) => {
// 	debug("OnDidChangetextDocument");
// 	let changes = params.contentChanges;
// 	debug(changes);
// 	throw new Error;
// 	// for (const c of changes) {
		
// 	// }
//     // The content of a text document did change in VS Code.
//     // params.uri uniquely identifies the document.
//     // params.contentChanges describe the content changes to the document.
// });


export interface ErrorInstance {
	/**
	 * A regular expression of the diagnostic
	 */
	pattern: RegExp;
	/**
	 * The diagnostic's severity. Can be omitted. If omitted it is up to the
	 * client to interpret diagnostics as error, warning, info or hint.
	 */
	severity: DiagnosticSeverity;
	/**
	 * A human-readable string describing the source of this
	 * diagnostic, e.g. 'typescript' or 'super lint'. It usually
	 * appears in the user interface.
	 */
	source: string;
	/**
	 * The diagnostic's message. It usually appears in the user interface
	 */
	message: string;
	relatedMessage: string;
	excludeFrom: string[];
}





connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	debug(_change.changes);
	console.log('We received a file change event');
});

/**
 * Triggered when ending a function name with an open parentheses, e.g. "functionName( "
 */
connection.onSignatureHelp(async (_textDocPos: SignatureHelpParams): Promise<SignatureHelp | undefined> =>{
	//debug(functionData.length);
	// if (!_textDocPos.textDocument.uri.endsWith("mast")) {
	// 	return;
	// }
	const document = documents.get(_textDocPos.textDocument.uri);
	if (document === undefined) return undefined;
	const isMastDocument = _textDocPos.textDocument.uri.endsWith(".mast");
	const isPythonDocument = _textDocPos.textDocument.uri.endsWith(".py");
	if (!isMastDocument && !(isPythonDocument && enablePythonCompletions)) return undefined;
	const sigWaitStart = Date.now();
	await getCache(document.uri).awaitLoaded();
	const sigWaitElapsed = Date.now() - sigWaitStart;
	if (sigWaitElapsed > 20) {
		console.log(`[perf] signatureHelp awaitLoaded ${sigWaitElapsed}ms | ${document.uri}`);
	}
	const text = documents.get(_textDocPos.textDocument.uri);
	if (text === undefined) {
		return undefined;
	}
	const sigStart = Date.now();
	const ret = onSignatureHelp(_textDocPos,text);
	const sigElapsed = Date.now() - sigStart;
	if (sigElapsed > 20) {
		console.log(`[perf] signatureHelp compute ${sigElapsed}ms | ${_textDocPos.textDocument.uri}`);
	}
	return ret;
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	async (_textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[] | undefined> => {
		const isMastDocument = _textDocumentPosition.textDocument.uri.endsWith(".mast");
		const isPythonDocument = _textDocumentPosition.textDocument.uri.endsWith(".py");
		if (_textDocumentPosition.textDocument.uri.endsWith("json")) {
			// We don't want to deal with json files aside from story.json at this point.
			// TODO: Implement json autocompletion stuff for shipData.json?
			if (_textDocumentPosition.textDocument.uri !== "story.json") {
				return [];
			}
			debug("THIS IS A JSON FILE");
			let g = getArtemisGlobals();
			if (g !== undefined) {
				return g.libModuleCompletionItems;
			} else {
				await initializeArtemisGlobals();
				return getArtemisGlobals()?.libModuleCompletionItems;
			}
		}
		if (_textDocumentPosition.textDocument.uri.endsWith("__init__.mast")) {
			debug("Can't get completions from __init__.mast file");
		}
		
		if (!isMastDocument && !(isPythonDocument && enablePythonCompletions)) return undefined;
		const text = documents.get(_textDocumentPosition.textDocument.uri);
		if (text === undefined) {
			return [];
		}
		try {
			const completionWaitStart = Date.now();
			await getCache(_textDocumentPosition.textDocument.uri).awaitLoaded();
			const completionWaitElapsed = Date.now() - completionWaitStart;
			if (completionWaitElapsed > 20) {
				console.log(`[perf] completion awaitLoaded ${completionWaitElapsed}ms | ${_textDocumentPosition.textDocument.uri}`);
			}
			const completionStart = Date.now();
			let ci: CompletionItem[] = onCompletion(_textDocumentPosition,text);
			const completionElapsed = Date.now() - completionStart;
			// for (const c of ci) {
			// 	debug(c.documentation);
			// }
			// TODO: This hides if there's a bunch of copies, which may be technically a bug, or impacting efficiency.
			// ci = [...new Map(ci.map(v => [v.insertText||v.label, v])).values()];
			//This allows for items with the same label, but excludes duplicates
			ci = [...new Map(ci.map((v)=>[v.documentation+v.label+v.kind+v.detail, v])).values()]
			if (completionElapsed > 20) {
				console.log(`[perf] completion compute ${completionElapsed}ms | ${_textDocumentPosition.textDocument.uri} | items=${ci.length}`);
			}
			return ci;
		} catch (e) {
			debug("onCompletion failure\n" + e);
			return undefined;
		}
	}
);

// Handle completion item resolution for Python auto-imports
connection.onCompletionResolve(async (completionItem: CompletionItem): Promise<CompletionItem> => {
	if (!completionItem.data || !completionItem.data.sourceFile || !completionItem.data.documentUri) {
		return completionItem;
	}

	const activeDoc = documents.get(completionItem.data.documentUri as string);
	if (!activeDoc || (!activeDoc.uri.endsWith('.py') && activeDoc.languageId !== 'python' && activeDoc.languageId !== 'py')) {
		return completionItem;
	}

	const sourceFile = completionItem.data.sourceFile as string;
	const functionName = completionItem.data.functionName as string;
	const text = activeDoc.getText();
	const cache = getCache(activeDoc.uri);

	// Resolve preferred module name first (sbslib-relative), then fallback to legacy absolute path
	const preferredModuleName = cache.getPythonImportModuleNameForSource(sourceFile, activeDoc.uri);
	const fallbackModuleName = extractModuleName(sourceFile);
	const moduleNames = [...new Set([preferredModuleName, fallbackModuleName].filter((name): name is string => !!name))];
	if (moduleNames.length === 0) {
		return completionItem;
	}
	let moduleName = moduleNames[0];

	// Check if already imported
	for (const candidate of moduleNames) {
		if (isAlreadyImported(text, candidate, functionName)) {
			return completionItem;
		}
	}

	// Check if imports from this module already exist (supports preferred and legacy module styles)
	let existingImportMatch: { line: number; lineContent: string; imports: string[] } | undefined;
	for (const candidate of moduleNames) {
		const match = findExistingImportFromModule(text, candidate);
		if (match) {
			existingImportMatch = match;
			moduleName = candidate;
			break;
		}
	}
	
	if (existingImportMatch) {
		// Append to existing import
		const { line, lineContent, imports } = existingImportMatch;
		
		// Only add if not already in the list
		if (!imports.some(imp => imp.split(/\s+as\s+/)[0].trim() === functionName)) {
			const updatedImports = [...imports, functionName];
			const updatedLine = `from ${moduleName} import ${updatedImports.join(', ')}`;
			
			completionItem.additionalTextEdits = [
				{
					range: {
						start: { line, character: 0 },
						end: { line, character: lineContent.length }
					},
					newText: updatedLine
				}
			];
		}
	} else {
		// Add new import line at the top
		completionItem.additionalTextEdits = [
			{
				range: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 0 }
				},
				newText: `from ${moduleName} import ${functionName}\n`
			}
		];
	}

	return completionItem;
});

function extractModuleName(sourceFile: string): string | undefined {
	// Handle sbs/sbs_utils special cases
	if (sourceFile.includes('sbs.py') || sourceFile.includes('sbs\\sbs.py')) {
		return 'sbs';
	}
	if (sourceFile.includes('sbs_utils')) {
		// Extract the relative path from sbs_utils onwards
		const match = sourceFile.match(/sbs_utils[\\\/](.+?)\.py$/);
		if (match) {
			let modulePath = match[1].replace(/[\\\/]/g, '.');
			// If the captured path already starts with sbs_utils, don't duplicate it
			if (modulePath.startsWith('sbs_utils.')) {
				return modulePath;
			}
			return 'sbs_utils.' + modulePath;
		}
		return 'sbs_utils';
	}
	return undefined;
}

function findExistingImportFromModule(text: string, moduleName: string): { line: number; lineContent: string; imports: string[] } | undefined {
	const lines = text.split('\n');
	const importRegex = /^\s*from\s+([^\s]+)\s+import\s+(.+)$/;

	for (let i = 0; i < lines.length; i++) {
		const lineContent = lines[i];
		const trimmed = lineContent.trim();
		const match = importRegex.exec(trimmed);
		if (!match) {
			continue;
		}

		const importedModule = match[1].trim();
		if (importedModule !== moduleName) {
			continue;
		}

		let importPart = match[2];
		const commentIndex = importPart.indexOf('#');
		if (commentIndex >= 0) {
			importPart = importPart.slice(0, commentIndex);
		}

		const imports = importPart
			.split(',')
			.map(s => s.trim())
			.filter(Boolean)
			.map(s => s.replace(/\s+as\s+.+$/, '').trim());

		return {
			line: i,
			lineContent,
			imports
		};
	}

	return undefined;
}

function isAlreadyImported(text: string, moduleName: string, functionName: string): boolean {
	// Simple check for "from moduleName import functionName"
	const importRegex = new RegExp(`from\\s+${moduleName.replace(/\./g, '\\.')}\\s+import\\s+[^\\n]*\\b${functionName}\\b`, 'm');
	if (importRegex.test(text)) {
		return true;
	}
	
	// Check for "import moduleName"
	const fullModuleRegex = new RegExp(`import\\s+${moduleName.replace(/\./g, '\\.')}`, 'm');
	if (fullModuleRegex.test(text)) {
		return true;
	}

	return false;
}

connection.onHover(async (_textDocumentPosition: TextDocumentPositionParams): Promise<Hover | undefined> => {
	if (!_textDocumentPosition.textDocument.uri.endsWith(".mast")) return undefined;
	const text = documents.get(_textDocumentPosition.textDocument.uri);
	if (text === undefined) {
		debug("Undefined");
		return undefined;
	}
	const cache = getCache(_textDocumentPosition.textDocument.uri);
	await cache.awaitLoaded();
	let h = onHover(_textDocumentPosition,text);
	// if (h) {
	// 	debug(h);
	// 	if (h.contents.value.includes("Assign")) {
	// 		throw new Error("Assign");
	// 	}
	// }
	return h;
});




export function myDebug(str:any) {
    if (str === undefined) {
        str = "UNDEFINED";
    }
	const out = "\n" + String(str);
	// Async append to avoid blocking the event loop on every log
	fs.appendFile('outputLog.txt', out, (err) => {
		if (err) {
			try { connection.console.error(String(err)); } catch {}
		}
	});
	try {
		console.log(out);
	} catch {
		// If connection not ready, fallback to console.debug
		debug(out);
	}
}


export async function notifyClient(message:string) {
	debug("Sending to client: " + message);
	connection.sendNotification("custom/mastNotif", message);
}

export async function sendWarning(message:string) {
	debug("Sending to client: " + message);
	connection.sendNotification("custom/warning", message);
}

export async function sendToClient(notifName: string, data: any) {
	connection.sendNotification("custom/" + notifName, data);
}

const pendingQuickPickRequests = new Map<string, (selection: string | undefined) => void>();
let quickPickRequestCounter = 0;

export async function requestClientQuickPick(title: string, options: string[], placeHolder?: string): Promise<string | undefined> {
	if (options.length === 0) {
		return undefined;
	}

	const requestId = `quickpick-${Date.now()}-${++quickPickRequestCounter}`;
	return new Promise((resolve) => {
		pendingQuickPickRequests.set(requestId, resolve);
		sendToClient('openQuickPick', {
			requestId,
			title,
			placeHolder,
			options
		});
	});
}

connection.onNotification('custom/quickPickResponse', (payload: { requestId?: string; selection?: string } | undefined) => {
	if (!payload?.requestId) {
		return;
	}

	const resolver = pendingQuickPickRequests.get(payload.requestId);
	if (!resolver) {
		return;
	}

	pendingQuickPickRequests.delete(payload.requestId);
	resolver(payload.selection);
});



connection.onNotification("custom/storyJsonResponse",(response)=>{
	debug("Download command recieved: " + response);
	switch(response) {
		case 0:
			// Update to use latest local versions
			break;
		case 1:
			// Do nothing
			break;
		case 2: 
			// Download most recent version and update
			break;
		default:
			// Do nothing
			break;
	}
});

connection.onNotification('custom/openShipViewer', async (request: { mode?: string; argumentName?: string; sourceUri?: string } | undefined) => {
	try {
		const globals = getArtemisGlobals() || await initializeArtemisGlobals();
		if (!globals || !globals.artemisDir) {
			sendWarning('Artemis directory not found. Cannot open Ship 3D Viewer.');
			return;
		}

		if (!globals.shipData || !globals.shipData.ships || globals.shipData.ships.length === 0) {
			await globals.shipData?.load();
		}

		const ships = (globals.shipData?.ships || []).map(s => ({
			key: s.key,
			name: s.name,
			side: s.side,
			artFileRoot: s.artFileRoot,
			roles: s.roles
		}));

		sendToClient('ships', {
			artemisDir: globals.artemisDir,
			ships,
			mode: request?.mode || 'browse',
			argumentName: request?.argumentName || '',
			sourceUri: request?.sourceUri || ''
		});
	} catch (e) {
		debug('Failed to open ship viewer: ' + e);
		sendWarning('Failed to open Ship 3D Viewer. Check MAST output logs for details.');
	}
});

connection.onNotification('custom/openFaceBuilder', async (request: { sourceUri?: string } | undefined) => {
	try {
		const globals = getArtemisGlobals() || await initializeArtemisGlobals();
		if (!globals || !globals.artemisDir) {
			sendWarning('Artemis directory not found. Cannot open Face String Builder.');
			return;
		}

		const faces = (globals.faceArtFiles || []).map(face => ({
			raceId: face.shortName,
			fileName: face.fileName
		}));

		sendToClient('faces', {
			artemisDir: globals.artemisDir,
			faces,
			sourceUri: request?.sourceUri || ''
		});
	} catch (e) {
		debug('Failed to open face builder: ' + e);
		sendWarning('Failed to open Face String Builder. Check MAST output logs for details.');
	}
});

// Useful for debugging the client
connection.onNotification("custom/debug", (response) => {
	debug(response);
});

connection.onNotification('custom/compileMission', async (request: { sourceUri?: string } | undefined) => {
	const uri = request?.sourceUri;
	if (!uri) {
		sendWarning('MAST Compile: No document URI provided.');
		return;
	}
	const document = documents.get(uri);
	if (!document) {
		sendWarning('MAST Compile: Document not found in server. Save the file and try again.');
		return;
	}
	try {
		debug('compileMission: received request for ' + uri);
		const diagnostics = await runCompileMastFileWithStatus(document);
		const errors = diagnostics.map(d => ({
			message: d.message,
			uri,
			line: d.range.start.line + 1,
			character: d.range.start.character + 1,
			endLine: d.range.end.line + 1,
			endCharacter: d.range.end.character + 1,
			severity: d.severity,
			source: d.source || 'MAST Compiler'
		}));
		sendToClient('compileMissionResult', { errors, message: errors.length === 0 ? 'No compile errors found.' : `${errors.length} error(s) found.` });
		debug('compileMission: sent result with ' + errors.length + ' error(s)');
	} catch (e) {
		debug('compileMission command failed: ' + e);
		sendToClient('compileMissionResult', { errors: [], message: 'Compile failed: ' + String(e) });
	}
});




// connection.onDocumentOnTypeFormatting((params:DocumentOnTypeFormattingParams,token:CancellationToken): HandlerResult<TextEdit[] | null | undefined, void> =>{
// 	const te: TextEdit[] = [];
// 	params.
// 	return te;
// })


// connection.onDefinition((textDocumentIdentifier: TextDocumentIdentifier): Definition => {
// 	return Location.create(textDocumentIdentifier.uri, {
// 	  start: { line: 2, character: 5 },
// 	  end: { line: 2, character: 6 }
// 	});
//   });

// connection.onDefinition((params: DefinitionParams): HandlerResult<Definition | LocationLink[] | null | undefined, void>=>{
connection.onDefinition(async (params: DefinitionParams): Promise<Definition | undefined> =>{
	if (!params.textDocument.uri.endsWith(".mast")) {
		return undefined;
	}
	const document = documents.get(params.textDocument.uri);
	let def = undefined;
	if (document !== undefined) {
		let cache = getCache(params.textDocument.uri);
		await cache.awaitLoaded();
		if (!cache.isLoaded()) debug("NOT LOADED YET")
		def = await onDefinition(document,params.position);
		// debug(def);
	}
	
	return def;
});

connection.onReferences(async (params:ReferenceParams): Promise<Location[] | undefined> => {
	// debug("Trying to find word refs....")
	if (!params.textDocument.uri.endsWith(".mast")) {
		return undefined;
	}
	const cache = getCache(params.textDocument.uri);
	await cache.awaitLoaded();
	const document = documents.get(params.textDocument.uri);
	let def = undefined;
	if (document !== undefined) {
		def = await onReferences(document, params);
		// debug(def);
	}
	return def;
});

connection.onRenameRequest((params: RenameParams): HandlerResult<WorkspaceEdit | null | undefined, void>=>{
	return onRenameRequest(params);
	// return ret;
})

connection.onPrepareRename((params: PrepareRenameParams): Range | undefined =>{
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return;
	return onPrepareRename(doc, params.position);
})


export async function showProgressBar(visible: boolean) {
	sendToClient("progressNotif",visible);
}

// connection.onDocumentSymbol((params:DocumentSymbolParams,token:CancellationToken,workDoneProgress:WorkDoneProgressReporter,resultProgress:ResultProgressReporter<SymbolInformation[]|DocumentSymbol[]>|undefined,): HandlerResult<SymbolInformation[] | DocumentSymbol[] | null | undefined, void>=>{
// 	const uri = params.textDocument.uri;
// 	const td = documents.get(uri);
// 	if (!td) return;
// 	let sis:SymbolInformation[] = [];
// 	let r: Range = {
// 		start:td.positionAt(1),
// 		end:td.positionAt(50)
// 	}
// 	let loc: Location = {
// 		uri: uri,
// 		range: r
// 	}
// 	let si:SymbolInformation = {
// 		location: loc,
// 		name: '',
// 		kind: 1
// 	}
// 	sis.push(si);
// 	return sis;
// });

// connection.onDocumentRangeFormatting((params: DocumentRangeFormattingParams,token:CancellationToken,workDoneProgress:WorkDoneProgressReporter,resultProgress:ResultProgressReporter<never>|undefined): HandlerResult<TextEdit[] | null | undefined, void>=> {
// 	let te:TextEdit[] = [];
// 	params.options.
// 	return te;
// });

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Semantic tokens provider
connection.languages.semanticTokens.on(async (params: SemanticTokensParams) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return getEmptySemanticTokens();
	}
	try {
		const cache = getCache(params.textDocument.uri);
		await cache.awaitLoaded();
		// Note: updateFileInfo is intentionally NOT called here.
		// onDidChangeContent already handles keeping the cache up to date.
		// Calling it here would cause a redundant reparse on every semantic token request.

		// Check cache first
		const stcache = getSemanticTokensCache();
		const cached = stcache.get(params.textDocument.uri, document.version);
		if (cached) {
			return cached;
		}

		// Compute tokens and cache result
		const semTokenStart = Date.now();
		const allTokens = tokenizeDocument(document);
		const tokenizeElapsed = Date.now() - semTokenStart;

		const labelTypeByName = new Map<string, 'label' | 'route-label' | false>();
		const hasMethodByName = new Map<string, boolean>();
		const classifyStart = Date.now();
		for (const token of allTokens) {
			if (token.type === 'variable' && token.modifier === 'reference') {
				if (!labelTypeByName.has(token.text)) {
					const found = cache.getLabel(token.text, false);
					if (found) {
						labelTypeByName.set(token.text, token.text.startsWith('//') ? 'route-label' : 'label');
					} else {
						labelTypeByName.set(token.text, false);
					}
				}
				const labelType = labelTypeByName.get(token.text);
				if (labelType) {
					token.type = labelType;
					continue;
				}

				if (!hasMethodByName.has(token.text)) {
					hasMethodByName.set(token.text, !!cache.getMethod(token.text));
				}
				if (hasMethodByName.get(token.text)) {
					token.type = 'function';
					continue;
				}
			}
		}
		const classifyElapsed = Date.now() - classifyStart;
		// filter out strings because they're weird in mast sometimes and I don't want to take too much time
		// figuring out how to handle them properly in the semantic tokens. This is a temporary solution.
		const filteredTokens = allTokens.filter(t => t.type !== "comment");
		const buildStart = Date.now();
		const tokens = buildSemanticTokens(filteredTokens,document);
		const buildElapsed = Date.now() - buildStart;
		const semTokenElapsed = Date.now() - semTokenStart;
		if (semTokenElapsed > 20) {
			connection.console.log(`[perf] semanticTokens total=${semTokenElapsed}ms tokenize=${tokenizeElapsed}ms classify=${classifyElapsed}ms build=${buildElapsed}ms | ${params.textDocument.uri}`);
		}

		stcache.set(params.textDocument.uri, document.version, tokens);
		return tokens;
	} catch (e) {
		debug(`Error computing semantic tokens: ${e}`);
		return getEmptySemanticTokens();
	}
});

// Listen on the connection
connection.listen();
