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
	Diagnostic

} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { LabelInfo } from './tokens/labels';
import { onCompletion } from './autocompletion';
import { debug} from 'console';
import { onHover } from './hover';
import { onSignatureHelp } from './signatureHelp';
import fs = require("fs");
import { getVariableNamesInDoc } from './tokens/variables';
import { getGlobals, initializeGlobals } from './globals';
import { validateTextDocument } from './validate';
import { onDefinition } from './goToDefinition';
import { getCache } from './cache';
import { onReferences } from './references';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
export const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
export const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = true;
export let hasDiagnosticRelatedInformationCapability = false;
let allowMultipleCaches = true;
let cacheTimeout = 0;
export let labelNames : LabelInfo[] = [];

// let functionData : SignatureInformation[] = [];
// export function appendFunctionData(si: SignatureInformation) {functionData.push(si);}
// export function getFunctionData(): SignatureInformation[] { return functionData; }


// const supportedRoutes: string[][] = [];
// export function getSupportedRoutes(): string[][] { return supportedRoutes; }


/**
 * TODO: Implement system using semantic tokens
 * https://stackoverflow.com/questions/70490767/language-server-semantic-tokens
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
				resolveProvider: false, // FOR NOW - MAY USE LATER
				// TODO: The /, >, and especially the space are hopefully temporary workarounds.
				triggerCharacters: [".","/",">","<"," ","\"","\'","@","=","(","{"]
			},
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false
			},
			definitionProvider: true,
			// TODO: Implement code actions and command providers
			// codeActionProvider: true,
			// executeCommandProvider: {
			// 	commands: [
			// 		// TODO: Here we add the command names - for QuickFix
			// 		//'labels.fix'
			// 		'labels.route.enable'
			// 	]
			// },
			signatureHelpProvider: {
				triggerCharacters: ['(',',']
			},
			hoverProvider: true,
			// semanticTokensProvider: {
            //     legend: {
            //         // set your tokens here
            //         tokenTypes: ['class','function','label','inline_label','variable','property','method','comment','string','keyword','number','operator'], 
            //         tokenModifiers: ['declaration','documentation']
            //     }
            // }
			referencesProvider: true
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
			connection.console.log('Workspace folder change event received.');
		});

	}
	
	// Get config information
	let mastConfig = await connection.workspace.getConfiguration("mastLanguageServer")
	allowMultipleCaches = mastConfig.allowMultipleCaches;
	cacheTimeout = mastConfig.cacheTimeout;
	
	// connection.workspace.getWorkspaceFolders().then((folders)=>{
	// 	debug(folders);
	// 	// progressUpdate(100);
	// })
	
});
// connection.onCodeAction((params) => {
// 	const textDocument = documents.get(params.textDocument.uri);
// 	if (textDocument === undefined) {
// 		return undefined;
// 	}
// 	// params.range
// 	const title = 'Update label with enable';
// 	return [
// 		// TODO: Here we add CodeActions (i.e. commands) for QuickFixes
// 		//CodeAction.create(title, Command.create(title, 'sample.fixMe', textDocument.uri), CodeActionKind.QuickFix)
// 		// CodeAction.create("Add enable line",CodeActionKind.QuickFix),
// 		CodeAction.create(title, Command.create(title, 'labels.route.enable', textDocument.uri), CodeActionKind.QuickFix)
// 	];
// });
connection.onExecuteCommand(async (params) => {
	//TODO: Here we execute the commands
	if (params.command !== 'labels.fix' || params.arguments === undefined) {
		return;
	}

	// const textDocument = documents.get(params.arguments[0]);
	// if (textDocument === undefined) {
	// 	return;
	// }
	// const newText = typeof params.arguments[1] === 'string' ? params.arguments[1] : 'Eclipse';
	// connection.workspace.applyEdit({
	// 	documentChanges: [
	// 		TextDocumentEdit.create({ uri: textDocument.uri, version: textDocument.version }, [
	// 			TextEdit.insert(Position.create(0, 0), newText)
	// 		])
	// 	]
	// });
});

// The example settings
interface MAST_Settings {
	maxNumberOfProblems: number;
	allowMultipleCaches: boolean;
	cacheTimout: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: MAST_Settings = { 
	maxNumberOfProblems: 1000,
	allowMultipleCaches: true,
	cacheTimout: 0	
};
let globalSettings: MAST_Settings = defaultSettings;

// Cache the settings of all open documents
const documentSettings = new Map<string, Thenable<MAST_Settings>>();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = (
			(change.settings.languageServerExample || defaultSettings)
		);
	}
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
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'MAST Language Server'
		});
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
			let cache = getCache(params.textDocument.uri);
			await cache.awaitLoaded();
			getVariableNamesInDoc(document);
			debug("Validating....");
			// let [val, comp]: Diagnostic[][] = await Promise.all([validateTextDocument(document), compileMastFile(document)]);
			// const ret = val.concat(comp);
			let ret: Diagnostic[] = await validateTextDocument(document);
			
			debug("Validation complete.");
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
// documents.onDidChangeContent(change => {
// 	try {
// 		//debug("onDidChangeContent");
// 		validateTextDocument(change.document);
// 	} catch (e) {
// 		debug(e);
// 		console.error(e);
// 	}
// });



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
}





connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	debug(_change.changes);
	connection.console.log('We received a file change event');
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
	if (!_textDocPos.textDocument.uri.endsWith(".mast")) return undefined;
	await getCache(document.uri).awaitLoaded();
	const text = documents.get(_textDocPos.textDocument.uri);
	if (text === undefined) {
		return undefined;
	}
	return onSignatureHelp(_textDocPos,text);
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	async (_textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[] | undefined> => {
		if (_textDocumentPosition.textDocument.uri.endsWith("json")) {
			debug("THIS IS A JSON FILE");
			let g = getGlobals();
			if (g !== undefined) {
				return g.libModuleCompletionItems;
			} else {
				await initializeGlobals();
				return getGlobals()?.libModuleCompletionItems;
			}
		}
		if (_textDocumentPosition.textDocument.uri.endsWith("__init__.mast")) {
			debug("Can't get completions from __init__.mast file");
		}
		if (_textDocumentPosition.textDocument.uri.endsWith(".py")) return undefined;
		if (!_textDocumentPosition.textDocument.uri.endsWith(".mast")) return undefined;
		const text = documents.get(_textDocumentPosition.textDocument.uri);
		if (text === undefined) {
			return [];
		}
		try {
			await getCache(_textDocumentPosition.textDocument.uri).awaitLoaded();
			let ci: CompletionItem[] = onCompletion(_textDocumentPosition,text);
			// for (const c of ci) {
			// 	debug(c.documentation);
			// }
			// TODO: This hides if there's a bunch of copies, which may be technically a bug, or impacting efficiency.
			// ci = [...new Map(ci.map(v => [v.insertText||v.label, v])).values()];
			//This allows for items with the same label, but excludes duplicates
			ci = [...new Map(ci.map((v)=>[v.documentation+v.label+v.kind+v.detail, v])).values()]
			return ci;
		} catch (e) {
			debug("onCompletion failure\n" + e);
			return undefined;
		}
	}
);

export function updateLabelNames(li: LabelInfo[]) {
	labelNames = li;
}

// This handler resolves additional information for the item selected in
// the completion list.

// connection.onCompletionResolve(
// 	(item: CompletionItem): CompletionItem => {
// 		if (item.data === 1) {
// 			item.detail = 'TypeScript details';
// 			item.documentation = 'TypeScript documentation';
// 		} else if (item.data === 2) {
// 			item.detail = 'JavaScript details';
// 			item.documentation = 'JavaScript documentation';
// 		}
// 		if (item.label === "sbs") {
// 			item.detail = "artemis_sbs details",
// 			item.documentation = "artemis_sbs details"
// 		}
// 		return item;
// 	}
// );

connection.onHover(async (_textDocumentPosition: TextDocumentPositionParams): Promise<Hover | undefined> => {
	if (!_textDocumentPosition.textDocument.uri.endsWith(".mast")) return undefined;
	const text = documents.get(_textDocumentPosition.textDocument.uri);
	if (text === undefined) {
		debug("Undefined");
		return undefined;
	}
	await getCache(_textDocumentPosition.textDocument.uri).awaitLoaded();
	return onHover(_textDocumentPosition,text);
});

// connection.onRequest("textDocument/semanticTokens/full", (params: SemanticTokensParams) => {
//     // Implement your logic to provide semantic tokens for the given document here.
//     // You should return the semantic tokens as a response.
//     const semanticTokens = computeSemanticTokens(params.textDocument.uri);
//     return semanticTokens;
// });

// function computeSemanticTokens(params: string): SemanticTokens {
// 	let doc = documents.get(params);
// 	if (doc === undefined) { return {data: []};}
//     let tokens: SemanticTokens = {
// 		data: []
// 	};
// 	debug(params);
// 	let strings = getStrings(doc);
// 	SemanticTokensBuilder.
// 	return tokens;
// }



export function myDebug(str:any) {
    if (str === undefined) {
        str = "UNDEFINED";
    }
    str = "\n" + str;
    fs.writeFileSync('outputLog.txt', str, { flag: "a+" });
	debug(str);
	console.log(str);
}


export async function notifyClient(message:string) {
	debug("Sending to client: " + message);
	connection.sendNotification("custom/mastNotif", message);
}



export async function sendToClient(notifName: string, data: any) {
	connection.sendNotification("custom/" + notifName, data);
}



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

// Useful for debugging the client
connection.onNotification("custom/debug", (response) => {
	debug(response);
})


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
	await getCache(params.textDocument.uri).awaitLoaded();
	const document = documents.get(params.textDocument.uri);
	let def = undefined;
	if (document !== undefined) {
		def = await onReferences(document, params);
		// debug(def);
	}
	return def;
});


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

// Listen on the connection
connection.listen();
