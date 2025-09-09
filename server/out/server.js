"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.labelNames = exports.hasDiagnosticRelatedInformationCapability = exports.documents = exports.connection = void 0;
exports.getDocumentSettings = getDocumentSettings;
exports.updateLabelNames = updateLabelNames;
exports.myDebug = myDebug;
exports.notifyClient = notifyClient;
exports.sendWarning = sendWarning;
exports.sendToClient = sendToClient;
exports.showProgressBar = showProgressBar;
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
//// <reference path="../src/sbs.pyi" />
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const autocompletion_1 = require("./requests/autocompletion");
const console_1 = require("console");
const hover_1 = require("./requests/hover");
const signatureHelp_1 = require("./requests/signatureHelp");
const fs = require("fs");
const variables_1 = require("./tokens/variables");
const globals_1 = require("./globals");
const validate_1 = require("./requests/validate");
const goToDefinition_1 = require("./requests/goToDefinition");
const cache_1 = require("./cache");
const references_1 = require("./requests/references");
const renameSymbol_1 = require("./requests/renameSymbol");
const words_1 = require("./tokens/words");
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
exports.connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
// Create a simple text document manager.
exports.documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = true;
exports.hasDiagnosticRelatedInformationCapability = false;
let allowMultipleCaches = true;
let cacheTimeout = 0;
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
    if (capabilities.workspace && capabilities.workspace.configuration) {
        (0, console_1.debug)("Config true!!!");
        capabilities.workspace.configuration;
    }
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
    }
    else {
        (0, console_1.debug)("No Workspace folders");
    }
    return result;
});
exports.connection.onInitialized(async () => {
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
    // Get config information
    let mastConfig = await exports.connection.workspace.getConfiguration("mastLanguageServer");
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
const defaultSettings = {
    maxNumberOfProblems: 1000,
    allowMultipleCaches: true,
    cacheTimout: 0
};
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
    let ret = {
        kind: node_1.DocumentDiagnosticReportKind.Full,
        items: []
    };
    //TODO: get info from other files in same directory
    const document = exports.documents.get(params.textDocument.uri);
    if (document !== undefined) {
        if (document.languageId !== "mast")
            return ret;
        try {
            let cache = (0, cache_1.getCache)(params.textDocument.uri);
            await cache.awaitLoaded();
            (0, variables_1.getVariableNamesInDoc)(document);
            // debug("Validating....");
            // let [val, comp]: Diagnostic[][] = await Promise.all([validateTextDocument(document), compileMastFile(document)]);
            // const ret = val.concat(comp);
            let ret = await (0, validate_1.validateTextDocument)(document);
            // debug("Validation complete.");
            return {
                kind: node_1.DocumentDiagnosticReportKind.Full,
                items: ret
                // items: await validateTextDocument(document)
            };
        }
        catch (e) {
            (0, console_1.debug)(e);
            return ret;
        }
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
exports.connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VSCode
    (0, console_1.debug)(_change.changes);
    exports.connection.console.log('We received a file change event');
});
/**
 * Triggered when ending a function name with an open parentheses, e.g. "functionName( "
 */
exports.connection.onSignatureHelp(async (_textDocPos) => {
    //debug(functionData.length);
    // if (!_textDocPos.textDocument.uri.endsWith("mast")) {
    // 	return;
    // }
    const document = exports.documents.get(_textDocPos.textDocument.uri);
    if (document === undefined)
        return undefined;
    if (!_textDocPos.textDocument.uri.endsWith(".mast"))
        return undefined;
    await (0, cache_1.getCache)(document.uri).awaitLoaded();
    const text = exports.documents.get(_textDocPos.textDocument.uri);
    if (text === undefined) {
        return undefined;
    }
    return (0, signatureHelp_1.onSignatureHelp)(_textDocPos, text);
});
// This handler provides the initial list of the completion items.
exports.connection.onCompletion(async (_textDocumentPosition) => {
    if (_textDocumentPosition.textDocument.uri.endsWith("json")) {
        // We don't want to deal with json files aside from story.json at this point.
        // TODO: Implement json autocompletion stuff for shipData.json?
        if (_textDocumentPosition.textDocument.uri !== "story.json") {
            return [];
        }
        (0, console_1.debug)("THIS IS A JSON FILE");
        let g = (0, globals_1.getGlobals)();
        if (g !== undefined) {
            return g.libModuleCompletionItems;
        }
        else {
            await (0, globals_1.initializeGlobals)();
            return (0, globals_1.getGlobals)()?.libModuleCompletionItems;
        }
    }
    if (_textDocumentPosition.textDocument.uri.endsWith("__init__.mast")) {
        (0, console_1.debug)("Can't get completions from __init__.mast file");
    }
    // if (_textDocumentPosition.textDocument.uri.endsWith(".py")) return undefined; // Redundant
    if (!_textDocumentPosition.textDocument.uri.endsWith(".mast"))
        return undefined;
    const text = exports.documents.get(_textDocumentPosition.textDocument.uri);
    if (text === undefined) {
        return [];
    }
    try {
        await (0, cache_1.getCache)(_textDocumentPosition.textDocument.uri).awaitLoaded();
        let ci = (0, autocompletion_1.onCompletion)(_textDocumentPosition, text);
        // for (const c of ci) {
        // 	debug(c.documentation);
        // }
        // TODO: This hides if there's a bunch of copies, which may be technically a bug, or impacting efficiency.
        // ci = [...new Map(ci.map(v => [v.insertText||v.label, v])).values()];
        //This allows for items with the same label, but excludes duplicates
        ci = [...new Map(ci.map((v) => [v.documentation + v.label + v.kind + v.detail, v])).values()];
        if (ci[0].label.startsWith("ship_data")) {
            (0, console_1.debug)("--------SHIP DATA-------");
            (0, console_1.debug)(ci);
        }
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
exports.connection.onHover(async (_textDocumentPosition) => {
    if (!_textDocumentPosition.textDocument.uri.endsWith(".mast"))
        return undefined;
    const text = exports.documents.get(_textDocumentPosition.textDocument.uri);
    if (text === undefined) {
        (0, console_1.debug)("Undefined");
        return undefined;
    }
    await (0, cache_1.getCache)(_textDocumentPosition.textDocument.uri).awaitLoaded();
    let h = (0, hover_1.onHover)(_textDocumentPosition, text);
    // if (h) {
    // 	debug(h);
    // 	if (h.contents.value.includes("Assign")) {
    // 		throw new Error("Assign");
    // 	}
    // }
    return h;
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
async function sendWarning(message) {
    (0, console_1.debug)("Sending to client: " + message);
    exports.connection.sendNotification("custom/warning", message);
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
// Useful for debugging the client
exports.connection.onNotification("custom/debug", (response) => {
    (0, console_1.debug)(response);
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
exports.connection.onDefinition(async (params) => {
    if (!params.textDocument.uri.endsWith(".mast")) {
        return undefined;
    }
    const document = exports.documents.get(params.textDocument.uri);
    let def = undefined;
    if (document !== undefined) {
        let cache = (0, cache_1.getCache)(params.textDocument.uri);
        await cache.awaitLoaded();
        if (!cache.isLoaded())
            (0, console_1.debug)("NOT LOADED YET");
        def = await (0, goToDefinition_1.onDefinition)(document, params.position);
        // debug(def);
    }
    return def;
});
exports.connection.onReferences(async (params) => {
    // debug("Trying to find word refs....")
    if (!params.textDocument.uri.endsWith(".mast")) {
        return undefined;
    }
    await (0, cache_1.getCache)(params.textDocument.uri).awaitLoaded();
    const document = exports.documents.get(params.textDocument.uri);
    let def = undefined;
    if (document !== undefined) {
        def = await (0, references_1.onReferences)(document, params);
        // debug(def);
    }
    return def;
});
exports.connection.onRenameRequest((params) => {
    return (0, renameSymbol_1.onRenameRequest)(params);
    // return ret;
});
exports.connection.onPrepareRename((params) => {
    let doc = exports.documents.get(params.textDocument.uri);
    if (!doc)
        return;
    let symbol = (0, words_1.getWordRangeAtPosition)(doc, params.position);
    let ret = {
        start: params.position,
        end: doc.positionAt(doc.offsetAt(params.position) + symbol.length)
    };
    return ret;
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