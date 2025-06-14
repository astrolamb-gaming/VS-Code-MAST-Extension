"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.labelNames = exports.hasDiagnosticRelatedInformationCapability = exports.documents = exports.connection = void 0;
exports.getDocumentSettings = getDocumentSettings;
exports.updateLabelNames = updateLabelNames;
exports.myDebug = myDebug;
exports.notifyClient = notifyClient;
exports.sendToClient = sendToClient;
exports.showProgressBar = showProgressBar;
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
//// <reference path="../src/sbs.pyi" />
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const autocompletion_1 = require("./autocompletion");
const console_1 = require("console");
const hover_1 = require("./hover");
const signatureHelp_1 = require("./signatureHelp");
const fs = require("fs");
const variables_1 = require("./tokens/variables");
const globals_1 = require("./globals");
const validate_1 = require("./validate");
const goToDefinition_1 = require("./goToDefinition");
const references_1 = require("./references");
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
exports.connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
// Create a simple text document manager.
exports.documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = true;
exports.hasDiagnosticRelatedInformationCapability = false;
exports.labelNames = [];
// let functionData : SignatureInformation[] = [];
// export function appendFunctionData(si: SignatureInformation) {functionData.push(si);}
// export function getFunctionData(): SignatureInformation[] { return functionData; }
// const supportedRoutes: string[][] = [];
// export function getSupportedRoutes(): string[][] { return supportedRoutes; }
/**
 * TODO: Implement system using semantic tokens
 * https://stackoverflow.com/questions/70490767/language-server-semantic-tokens
 */
exports.connection.onInitialize((params) => {
    // These are only executed on startup
    //const zip : Promise<void> = extractZip("","./sbs");
    //pyTypings = pyTypings.concat(parseTyping(fs.readFileSync("sbs.pyi","utf-8")));
    //debug(JSON.stringify(pyTypings));
    const capabilities = params.capabilities;
    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
    hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);
    exports.hasDiagnosticRelatedInformationCapability = !!(capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation);
    //debugStrs += capabilities.textDocument?.documentLink + "\n";
    const result = {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
            // Tell the client that this server supports code completion.
            inlineCompletionProvider: true,
            completionProvider: {
                resolveProvider: false, // FOR NOW - MAY USE LATER
                // TODO: The /, >, and especially the space are hopefully temporary workarounds.
                triggerCharacters: [".", "/", ">", "<", " ", "\"", "\'", "@", "=", "(", "{"]
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
                triggerCharacters: ['(', ',']
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
        (0, globals_1.initializeGlobals)().then(() => {
            (0, console_1.debug)("Global data compiled");
        });
    }
    else {
        (0, console_1.debug)("No Workspace folders");
    }
    return result;
});
exports.connection.onInitialized(() => {
    (0, console_1.debug)("Initialized");
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        exports.connection.client.register(node_1.DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        exports.connection.workspace.onDidChangeWorkspaceFolders(_event => {
            exports.connection.console.log('Workspace folder change event received.');
        });
    }
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
exports.connection.onExecuteCommand(async (params) => {
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
// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings = { maxNumberOfProblems: 1000 };
let globalSettings = defaultSettings;
// Cache the settings of all open documents
const documentSettings = new Map();
exports.connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    }
    else {
        globalSettings = ((change.settings.languageServerExample || defaultSettings));
    }
    // Refresh the diagnostics since the `maxNumberOfProblems` could have changed.
    // We could optimize things here and re-fetch the setting first can compare it
    // to the existing setting, but this is out of scope for this example.
    exports.connection.languages.diagnostics.refresh();
});
function getDocumentSettings(resource) {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = exports.connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'MAST Language Server'
        });
        documentSettings.set(resource, result);
    }
    return result;
}
// Only keep settings for open documents
exports.documents.onDidClose(e => {
    // This would break things, because it's only CLOSING, not DELETING
    // if (e.document.uri.endsWith(".py")) {
    // 	getCache(e.document.uri).removePyFile(e.document.uri)
    // } else if (e.document.uri.endsWith(".mast")) {
    // 	getCache(e.document.uri).removeMastFile(e.document.uri)
    // }
    documentSettings.delete(e.document.uri);
});
exports.connection.languages.diagnostics.on(async (params) => {
    //TODO: get info from other files in same directory
    const document = exports.documents.get(params.textDocument.uri);
    // connection.workspace.getWorkspaceFolders().then((value:WorkspaceFolder[] | null) => {
    // 	if (value !== null) {
    // 		value[0].uri
    // 	}
    // })
    if (document !== undefined) {
        (0, variables_1.getVariableNamesInDoc)(document);
        let [val, comp] = await Promise.all([(0, validate_1.validateTextDocument)(document), (0, validate_1.compileMastFile)(document)]);
        const ret = val.concat(comp);
        return {
            kind: node_1.DocumentDiagnosticReportKind.Full,
            items: ret
            // items: await validateTextDocument(document)
        };
    }
    else {
        // We don't know the document. We can either try to read it from disk
        // or we don't report problems for it.
        return {
            kind: node_1.DocumentDiagnosticReportKind.Full,
            items: []
        };
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
exports.connection.onDidChangeTextDocument((params) => {
    (0, console_1.debug)("OnDidChangetextDocument");
    let changes = params.contentChanges;
    (0, console_1.debug)(changes);
    throw new Error;
    // for (const c of changes) {
    // }
    // The content of a text document did change in VS Code.
    // params.uri uniquely identifies the document.
    // params.contentChanges describe the content changes to the document.
});
exports.connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VSCode
    (0, console_1.debug)(_change.changes);
    exports.connection.console.log('We received a file change event');
});
/**
 * Triggered when ending a function name with an open parentheses, e.g. "functionName( "
 */
exports.connection.onSignatureHelp((_textDocPos) => {
    //debug(functionData.length);
    // if (!_textDocPos.textDocument.uri.endsWith("mast")) {
    // 	return;
    // }
    if (_textDocPos.textDocument.uri.endsWith(".py"))
        return undefined;
    const text = exports.documents.get(_textDocPos.textDocument.uri);
    if (text === undefined) {
        return undefined;
    }
    return (0, signatureHelp_1.onSignatureHelp)(_textDocPos, text);
});
// This handler provides the initial list of the completion items.
exports.connection.onCompletion((_textDocumentPosition) => {
    if (_textDocumentPosition.textDocument.uri.endsWith("json")) {
        (0, console_1.debug)("THIS IS A JSON FILE");
        return (0, globals_1.getGlobals)().libModuleCompletionItems;
    }
    if (_textDocumentPosition.textDocument.uri.endsWith("__init__.mast")) {
        (0, console_1.debug)("Can't get completions from __init__.mast file");
    }
    if (_textDocumentPosition.textDocument.uri.endsWith(".py"))
        return undefined;
    const text = exports.documents.get(_textDocumentPosition.textDocument.uri);
    if (text === undefined) {
        return [];
    }
    try {
        let ci = (0, autocompletion_1.onCompletion)(_textDocumentPosition, text);
        // for (const c of ci) {
        // 	debug(c.documentation);
        // }
        // TODO: This hides if there's a bunch of copies, which may be technically a bug, or impacting efficiency.
        ci = [...new Map(ci.map(v => [v.label, v])).values()];
        return ci;
    }
    catch (e) {
        (0, console_1.debug)("onCompletion failure\n" + e);
        return undefined;
    }
});
function updateLabelNames(li) {
    exports.labelNames = li;
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
exports.connection.onHover((_textDocumentPosition) => {
    const text = exports.documents.get(_textDocumentPosition.textDocument.uri);
    if (text === undefined) {
        (0, console_1.debug)("Undefined");
        return undefined;
    }
    return (0, hover_1.onHover)(_textDocumentPosition, text);
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
function myDebug(str) {
    if (str === undefined) {
        str = "UNDEFINED";
    }
    str = "\n" + str;
    fs.writeFileSync('outputLog.txt', str, { flag: "a+" });
    (0, console_1.debug)(str);
    console.log(str);
}
async function notifyClient(message) {
    (0, console_1.debug)("Sending to client: " + message);
    exports.connection.sendNotification("custom/mastNotif", message);
}
async function sendToClient(notifName, data) {
    exports.connection.sendNotification("custom/" + notifName, data);
}
exports.connection.onNotification("custom/storyJsonResponse", (response) => {
    (0, console_1.debug)("Download command recieved: " + response);
    switch (response) {
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
exports.connection.onDefinition((params, token, workDoneProgress, resultProgress) => {
    const document = exports.documents.get(params.textDocument.uri);
    let def = undefined;
    if (document !== undefined) {
        def = (0, goToDefinition_1.onDefinition)(document, params.position);
        def.then((loc) => { (0, console_1.debug)(loc); });
    }
    return def;
});
exports.connection.onReferences((params) => {
    // debug("Trying to find word refs....")
    const document = exports.documents.get(params.textDocument.uri);
    let def = undefined;
    if (document !== undefined) {
        def = (0, references_1.onReferences)(document, params);
        def.then((locs) => { (0, console_1.debug)(locs); });
    }
    return def;
});
async function showProgressBar(visible) {
    sendToClient("progressNotif", visible);
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
exports.documents.listen(exports.connection);
// Listen on the connection
exports.connection.listen();
//# sourceMappingURL=server.js.map