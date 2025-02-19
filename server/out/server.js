"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.labelNames = exports.hasDiagnosticRelatedInformationCapability = void 0;
exports.getPyTypings = getPyTypings;
exports.getClassTypings = getClassTypings;
exports.updateLabelNames = updateLabelNames;
exports.myDebug = myDebug;
exports.notifyClient = notifyClient;
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
//// <reference path="../src/sbs.pyi" />
const node_1 = require("vscode-languageserver/node");
const vscode_uri_1 = require("vscode-uri");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const errorChecking_1 = require("./errorChecking");
const labels_1 = require("./labels");
const autocompletion_1 = require("./autocompletion");
const console_1 = require("console");
const hover_1 = require("./hover");
const signatureHelp_1 = require("./signatureHelp");
const comments_1 = require("./comments");
const fs = require("fs");
const cache_1 = require("./cache");
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
// Create a simple text document manager.
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
exports.hasDiagnosticRelatedInformationCapability = false;
const completionStrings = [];
let debugStrs = ""; //Debug: ${workspaceFolder}\n";
let pyTypings = [];
let workspacePyTypings = [];
function getPyTypings() { return pyTypings; }
let classTypings = [];
let workspaceClassTypings = [];
function getClassTypings() { return classTypings; }
exports.labelNames = [];
let typingsDone = false;
let currentDocument;
// let functionData : SignatureInformation[] = [];
// export function appendFunctionData(si: SignatureInformation) {functionData.push(si);}
// export function getFunctionData(): SignatureInformation[] { return functionData; }
// const supportedRoutes: string[][] = [];
// export function getSupportedRoutes(): string[][] { return supportedRoutes; }
/**
 * TODO: Implement system using semantic tokens
 * https://stackoverflow.com/questions/70490767/language-server-semantic-tokens
 */
connection.onInitialize((params) => {
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
                triggerCharacters: [".", "/", ">", " ", "\"", "\'", "@"]
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
                triggerCharacters: ['(', ',']
            },
            hoverProvider: true
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
        const uri = vscode_uri_1.URI.parse(workspaceFolder.uri);
        // let adir = getArtemisDirFromChild(uri.fsPath);
        // debug(adir);
        // try {
        // 	notifyClient("Sending the message");
        // } catch (e) {
        // 	debug(e);
        // 	console.error(e);
        // }
        (0, cache_1.loadCache)(uri.fsPath);
    }
    else {
        (0, console_1.debug)("No Workspace folders");
    }
    return result;
});
connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(node_1.DidChangeConfigurationNotification.type, undefined);
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
// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings = { maxNumberOfProblems: 1000 };
let globalSettings = defaultSettings;
// Cache the settings of all open documents
const documentSettings = new Map();
connection.onDidChangeConfiguration(change => {
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
    connection.languages.diagnostics.refresh();
});
function getDocumentSettings(resource) {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'languageServerExample'
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
        return {
            kind: node_1.DocumentDiagnosticReportKind.Full,
            items: await validateTextDocument(document)
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
documents.onDidChangeContent(change => {
    try {
        validateTextDocument(change.document);
    }
    catch (e) {
        (0, console_1.debug)(e);
        console.error(e);
    }
});
async function validateTextDocument(textDocument) {
    // In this simple example we get the settings for every validate run.
    const settings = await getDocumentSettings(textDocument.uri);
    (0, comments_1.getComments)(textDocument);
    (0, comments_1.getStrings)(textDocument);
    (0, comments_1.getYamls)(textDocument);
    // The validator creates diagnostics for all uppercase words length 2 and more
    const text = textDocument.getText();
    currentDocument = textDocument;
    const pattern = /\b[A-Z]{2,}\b/g;
    let m;
    let problems = 0;
    let diagnostics = [];
    let errorSources = [];
    let e1 = {
        pattern: /(^(=|-){2,}([0-9A-Za-z _]+?)(-|=)([0-9A-Za-z _]+?)(=|-){2,})/gm,
        severity: node_1.DiagnosticSeverity.Error,
        message: "Label Definition: Cannot use '-' or '=' inside label name.",
        source: "sbs",
        relatedMessage: "Only A-Z, a-z, 0-9, and _ are allowed to be used in a label name."
    };
    errorSources.push(e1);
    e1 = {
        pattern: /^[\w ][^+][^\"][\w\(\) ]+?\/\//g,
        severity: node_1.DiagnosticSeverity.Error,
        message: "Route labels can only be at the start of a line, unless used as label that runs when button is pressed.",
        source: "sbs",
        relatedMessage: "See https://artemis-sbs.github.io/sbs_utils/mast/routes/ for more details on routes."
    };
    e1 = {
        pattern: /\b[A-Z]{2,}\b/g,
        severity: node_1.DiagnosticSeverity.Information,
        source: "mast",
        message: "CAPS " + debugStrs,
        relatedMessage: "Is all caps intentional?"
    };
    //errorSources.push(e1);
    for (let i = 0; i < errorSources.length; i++) {
        let d1 = (0, errorChecking_1.findDiagnostic)(errorSources[i].pattern, textDocument, errorSources[i].severity, errorSources[i].message, errorSources[i].source, errorSources[i].relatedMessage, settings.maxNumberOfProblems, problems);
        diagnostics = diagnostics.concat(d1);
    }
    //let d1: Diagnostic[] = findDiagnostic(pattern, textDocument, DiagnosticSeverity.Error, "Message", "Source", "Testing", settings.maxNumberOfProblems, 0);
    //diagnostics = diagnostics.concat(d1);
    try {
        let d1 = (0, labels_1.checkLabels)(textDocument);
        diagnostics = diagnostics.concat(d1);
    }
    catch (e) {
        (0, console_1.debug)(e);
        (0, console_1.debug)("Couldn't get labels?");
    }
    return diagnostics;
}
connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VSCode
    (0, console_1.debug)(_change.changes);
    connection.console.log('We received a file change event');
});
/**
 * Triggered when ending a function name with an open parentheses, e.g. "functionName( "
 */
connection.onSignatureHelp((_textDocPos) => {
    //debug(functionData.length);
    const text = documents.get(_textDocPos.textDocument.uri);
    if (text === undefined) {
        return undefined;
    }
    return (0, signatureHelp_1.onSignatureHelp)(_textDocPos, text);
});
// This handler provides the initial list of the completion items.
connection.onCompletion((_textDocumentPosition) => {
    const text = documents.get(_textDocumentPosition.textDocument.uri);
    if (text === undefined) {
        return [];
    }
    try {
        return (0, autocompletion_1.onCompletion)(_textDocumentPosition, text);
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
connection.onHover((_textDocumentPosition) => {
    const text = documents.get(_textDocumentPosition.textDocument.uri);
    if (text === undefined) {
        (0, console_1.debug)("Undefined");
        return undefined;
    }
    return (0, hover_1.onHover)(_textDocumentPosition, text);
});
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);
// Listen on the connection
connection.listen();
function myDebug(str) {
    if (str === undefined) {
        str = "UNDEFINED";
    }
    str = "\n" + str;
    fs.writeFileSync('outputLog.txt', str, { flag: "a+" });
    (0, console_1.debug)(str);
    console.log(str);
}
function notifyClient(message) {
    connection.sendNotification("custom/notif", message);
}
//# sourceMappingURL=server.js.map