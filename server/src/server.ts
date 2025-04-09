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

} from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { LabelInfo } from './labels';
import { onCompletion } from './autocompletion';
import { debug} from 'console';
import { onHover } from './hover';
import { onSignatureHelp } from './signatureHelp';
import fs = require("fs");
import { getCache, loadCache } from './cache';
import { getVariableNamesInDoc } from './variables';
import { getGlobals } from './globals';
import { validateTextDocument } from './validate';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
export const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
export let hasDiagnosticRelatedInformationCapability = false;
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
	//debugStrs += capabilities.textDocument?.documentLink + "\n";

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			inlineCompletionProvider: true,
			completionProvider: {
				resolveProvider: false, // FOR NOW - MAY USE LATER
				// TODO: The /, >, and especially the space are hopefully temporary workarounds.
				triggerCharacters: [".","/",">","<"," ","\"","\'","@"]
			},
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false
			},
			codeActionProvider: true,
			executeCommandProvider: {
				commands: [
					// TODO: Here we add the command names - for QuickFix
					//'labels.fix'
				]
			},
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
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}

	if (params.workspaceFolders) {
		const workspaceFolder = params.workspaceFolders[0];
		//debug(workspaceFolder.uri);
		//readAllFilesIn(workspaceFolder);
		
		const uri = URI.parse(workspaceFolder.uri);

		// let adir = getArtemisDirFromChild(uri.fsPath);
		// debug(adir);
		// try {
		// 	notifyClient("Sending the message");
		// } catch (e) {
		// 	debug(e);
		// 	console.error(e);
		// }
		debug("Loading cache");
		loadCache(uri.fsPath);
		debug("Cache loaded")
		let cache = getCache(uri.fsPath);
		debug("Getting globals");

// Uncommment this to enable python stuff

		// try {
		// 	let globalFuncs = getGlobalFunctions(cache.storyJson.sbslib).then((funcs)=>{
		// 		debug(funcs);
		// 	});
		// } catch (e) {
		// 	debug(e)
		// }
		
	} else {
		debug("No Workspace folders");
	}
	return result;
});

connection.onInitialized(() => {
	
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});

	}
	
	
	
});
connection.onCodeAction((params) => {
	const textDocument = documents.get(params.textDocument.uri);
	if (textDocument === undefined) {
		return undefined;
	}
	const title = 'With User Input';
	return [
		// TODO: Here we add CodeActions (i.e. commands) for QuickFixes
		//CodeAction.create(title, Command.create(title, 'sample.fixMe', textDocument.uri), CodeActionKind.QuickFix)
	];
});
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
interface ExampleSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings = new Map<string, Thenable<ExampleSettings>>();

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

export function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
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
	documentSettings.delete(e.document.uri);
});


connection.languages.diagnostics.on(async (params) => {
	//TODO: get info from other files in same directory
	const document = documents.get(params.textDocument.uri);
	// connection.workspace.getWorkspaceFolders().then((value:WorkspaceFolder[] | null) => {
	// 	if (value !== null) {
	// 		value[0].uri
	// 	}
	// })
	
	if (document !== undefined) {
		getVariableNamesInDoc(document);
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: await validateTextDocument(document)
		} satisfies DocumentDiagnosticReport;
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


connection.onDidChangeTextDocument((params) => {
	debug("OnDidChangetextDocument");
	let changes = params.contentChanges;
	debug(changes);
	throw new Error;
	// for (const c of changes) {
		
	// }
    // The content of a text document did change in VS Code.
    // params.uri uniquely identifies the document.
    // params.contentChanges describe the content changes to the document.
});


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
connection.onSignatureHelp((_textDocPos: SignatureHelpParams): SignatureHelp | undefined =>{
	//debug(functionData.length);
	if (!_textDocPos.textDocument.uri.endsWith("mast")) {
		return;
	}
	const text = documents.get(_textDocPos.textDocument.uri);
	if (text === undefined) {
		return undefined;
	}
	return onSignatureHelp(_textDocPos,text);
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] | undefined => {
		if (_textDocumentPosition.textDocument.uri.endsWith("json")) {
			debug("THIS IS A JSON FILE");
			return getGlobals().libModuleCompletionItems;
		}
		if (_textDocumentPosition.textDocument.uri.endsWith("__init__.mast")) {
			debug("Can't get completions from __init__.mast file");
		}
		const text = documents.get(_textDocumentPosition.textDocument.uri);
		if (text === undefined) {
			return [];
		}
		try {
			return onCompletion(_textDocumentPosition,text);
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

connection.onHover((_textDocumentPosition: TextDocumentPositionParams): Hover | undefined => {
	const text = documents.get(_textDocumentPosition.textDocument.uri);
	if (text === undefined) {
		debug("Undefined");
		return undefined;
	}
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

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

export function myDebug(str:any) {
    if (str === undefined) {
        str = "UNDEFINED";
    }
    str = "\n" + str;
    fs.writeFileSync('outputLog.txt', str, { flag: "a+" });
	debug(str);
	console.log(str);
}


export function notifyClient(message:string) {
	debug("Sending to client: " + message);
	connection.sendNotification("custom/mastNotif", message);
}



export function sendToClient(notifName: string, data: any) {
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