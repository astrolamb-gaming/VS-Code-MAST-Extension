"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.labelNames = exports.hasDiagnosticRelatedInformationCapability = void 0;
exports.getPyTypings = getPyTypings;
exports.getClassTypings = getClassTypings;
exports.appendFunctionData = appendFunctionData;
exports.getSupportedRoutes = getSupportedRoutes;
exports.updateLabelNames = updateLabelNames;
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
//// <reference path="../src/sbs.pyi" />
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
//import fetch from 'node-fetch';
const fileFunctions_1 = require("./fileFunctions");
const errorChecking_1 = require("./errorChecking");
const labels_1 = require("./labels");
const autocompletion_1 = require("./autocompletion");
const console_1 = require("console");
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
// Create a simple text document manager.
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
exports.hasDiagnosticRelatedInformationCapability = false;
//const completionStrings : string[] = [];
let debugStrs = ""; //Debug: ${workspaceFolder}\n";
let pyTypings = [];
function getPyTypings() { return pyTypings; }
let classTypings = [];
function getClassTypings() { return classTypings; }
exports.labelNames = [];
let typingsDone = false;
let currentDocument;
let functionData = [];
function appendFunctionData(si) { functionData.push(si); }
let files = [
    "sbs/__init__",
    "sbs_utils/agent",
    "sbs_utils/consoledispatcher",
    "sbs_utils/damagedispatcher",
    "sbs_utils/extra_dispatcher",
    "sbs_utils/faces",
    "sbs_utils/fs",
    "sbs_utils/futures",
    "sbs_utils/griddispatcher",
    "sbs_utils/gridobject",
    "sbs_utils/gui",
    "sbs_utils/handlerhooks",
    "sbs_utils/helpers",
    "sbs_utils/layout",
    "sbs_utils/lifetimedispatchers",
    "sbs_utils/objects",
    "sbs_utils/scatter",
    "sbs_utils/spaceobject",
    "sbs_utils/tickdispatcher",
    "sbs_utils/vec",
    "sbs_utils/mast/label",
    "sbs_utils/mast/mast",
    "sbs_utils/mast/mast_sbs_procedural",
    "sbs_utils/mast/mastmission",
    "sbs_utils/mast/mastobjects",
    "sbs_utils/mast/mastscheduler",
    "sbs_utils/mast/maststory",
    "sbs_utils/mast/maststorypage",
    "sbs_utils/mast/maststoryscheduler",
    "sbs_utils/mast/parsers",
    "sbs_utils/mast/pollresults",
    "sbs_utils/pages/avatar",
    "sbs_utils/pages/shippicker",
    "sbs_utils/pages/start",
    "sbs_utils/pages/layout/layout",
    "sbs_utils/pages/layout/text_area",
    "sbs_utils/pages/widgets/control",
    "sbs_utils/pages/widgets/layout_listbox",
    "sbs_utils/pages/widgets/listbox",
    "sbs_utils/pages/widgets/shippicker",
    "sbs_utils/procedural/behavior",
    "sbs_utils/procedural/comms",
    "sbs_utils/procedural/cosmos",
    "sbs_utils/procedural/execution",
    "sbs_utils/procedural/grid",
    "sbs_utils/procedural/gui",
    "sbs_utils/procedural/internal_damage",
    "sbs_utils/procedural/inventory",
    "sbs_utils/procedural/links",
    "sbs_utils/procedural/maps",
    "sbs_utils/procedural/query",
    "sbs_utils/procedural/roles",
    "sbs_utils/procedural/routes",
    "sbs_utils/procedural/science",
    "sbs_utils/procedural/screen_shot",
    "sbs_utils/procedural/ship_data",
    "sbs_utils/procedural/signal",
    "sbs_utils/procedural/space_objects",
    "sbs_utils/procedural/spawn",
    "sbs_utils/procedural/style",
    "sbs_utils/procedural/timers"
];
const supportedRoutes = [];
function getSupportedRoutes() { return supportedRoutes; }
const routeDefSource = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/sbs_utils/mast/mast.py";
function parseWholeFile(text, sbs = false) {
    let className = /^class (.+?):/gm; // Look for "class ClassName:" to parse class names.
    let comment = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/m;
    let checkText;
    let classIndices = [];
    let m;
    //debug("\n Checking parser...");
    // Iterate over all classes to get their indices
    while (m = className.exec(text)) {
        classIndices.push(m.index);
        //debug("" + m.index + ": " +m[0]);
    }
    let len = classIndices.length;
    //debug("There are " + len + " indices found");
    // Here we go over all the indices and get all functions between the last index (or 0) and the current index.
    // So if the file doesn't start with a class definition, all function prior to a class definition are added to pyTypings
    // while class functions are addded to a ClassTypings object.
    for (let i = 0; i < len; i++) {
        //debug("index: "+i);
        let t;
        if (i === 0) {
            t = text.substring(0, classIndices[0]);
        }
        else {
            t = text.substring(classIndices[i - 1], classIndices[i]);
        }
        // TODO: Could pull the class parent and interfaces (if any). Would this be useful?
        let name = (0, fileFunctions_1.getRegExMatch)(t, className).replace("class ", "").replace(/\(.*?\):/, "");
        let comments = (0, fileFunctions_1.getRegExMatch)(t, comment).replace("\"\"\"", "").replace("\"\"\"", "");
        const typings = (0, fileFunctions_1.parseTyping)(t);
        if (sbs) {
            name = "sbs";
        }
        const classCompItem = {
            label: name,
            kind: node_1.CompletionItemKind.Class,
            detail: comments
        };
        if (name !== "") {
            const ct = {
                name: name,
                classCompItem: classCompItem,
                completionItems: typings
            };
            classTypings.push(ct);
            // debug(JSON.stringify(ct));
        }
        else {
            // Only acceptable because these are only loaded on startup
            pyTypings = pyTypings.concat(typings);
        }
    }
}
async function loadRouteLabels() {
    try {
        const data = await fetch(routeDefSource);
        const textData = await data.text();
        // Get the text of function that defines route labels
        const pattern = /RouteDecoratorLabel\(DecoratorLabel\):.+?generate_label_begin_cmds.+?[\s](def |class)/gs;
        let m;
        while (m = pattern.exec(textData)) {
            let t = m[0];
            const casePattern = / case [^_.]*?:/gm;
            let n;
            // Iterate over each "case...:" to find possible routes
            while (n = casePattern.exec(t)) {
                let routes = n[0].replace(/ (case \[)|\]:|"| /gm, "").trim();
                let arr = routes.split(",");
                //debug(arr.join("/"));
                supportedRoutes.push(arr);
            }
        }
    }
    catch (e) {
        (0, console_1.debug)("Error in loadRouteLabels(): " + e);
    }
}
async function loadTypings() {
    try {
        //const { default: fetch } = await import("node-fetch");
        //const fetch = await import('node-fetch');
        //let github : string = "https://github.com/artemis-sbs/sbs_utils/raw/refs/heads/master/mock/sbs.py";
        let gh = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/typings/";
        for (const page in files) {
            let url = gh + files[page] + ".pyi";
            const data = await fetch(url);
            const textData = await data.text();
            // check for sbs/__init__ is for if sbs is needed prior to function call (e.g. sbs.add_particle_emittor(...))
            let sbs = files[page].includes("sbs/__init__");
            parseWholeFile(textData, sbs);
        }
    }
    catch (err) {
        (0, console_1.debug)("\nFailed to load\n" + err);
    }
}
connection.onInitialize((params) => {
    loadTypings().then(() => { typingsDone = true; });
    loadRouteLabels().then(() => { (0, console_1.debug)("Routes Loaded"); });
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
            inlineCompletionProvider: {},
            completionProvider: {
                resolveProvider: true,
                // TODO: The /, >, and especially the space are hopefully temporary workarounds.
                triggerCharacters: [".", "/", ">", " "]
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
                triggerCharacters: ['(']
            }
        }
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true
            }
        };
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
    validateTextDocument(change.document);
});
async function validateTextDocument(textDocument) {
    // In this simple example we get the settings for every validate run.
    const settings = await getDocumentSettings(textDocument.uri);
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
    let d1 = (0, labels_1.checkLabels)(textDocument);
    diagnostics = diagnostics.concat(d1);
    return diagnostics;
}
connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VSCode
    connection.console.log('We received a file change event');
});
/**
 * Triggered when ending a function name with an open parentheses, e.g. "functionName( "
 */
connection.onSignatureHelp((_textDocPos) => {
    let sh = {
        signatures: []
    };
    const text = documents.get(_textDocPos.textDocument.uri);
    const t = text?.getText();
    if (text === undefined) {
        (0, console_1.debug)("Document ref is undefined");
        return sh;
    }
    if (t === undefined) {
        (0, console_1.debug)("Document text is undefined");
        return sh;
    }
    // Calculate the position in the text's string value using the Position value.
    const pos = text.offsetAt(_textDocPos.position);
    const startOfLine = pos - _textDocPos.position.character;
    const iStr = t.substring(startOfLine, pos);
    for (const i in functionData) {
        if (iStr.includes(functionData[i].label)) {
            sh.signatures.push(functionData[i]);
        }
    }
    return sh;
});
// This handler provides the initial list of the completion items.
connection.onCompletion((_textDocumentPosition) => {
    const text = documents.get(_textDocumentPosition.textDocument.uri);
    // We could just return pyTypings, but we don't want to add things to pyTypings over and over
    if (text === undefined) {
        return [];
    }
    return (0, autocompletion_1.onCompletion)(_textDocumentPosition, text);
});
function updateLabelNames(li) {
    exports.labelNames = li;
}
// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item) => {
    if (item.data === 1) {
        item.detail = 'TypeScript details';
        item.documentation = 'TypeScript documentation';
    }
    else if (item.data === 2) {
        item.detail = 'JavaScript details';
        item.documentation = 'JavaScript documentation';
    }
    if (item.label === "sbs") {
        item.detail = "artemis_sbs details",
            item.documentation = "artemis_sbs details";
    }
    return item;
});
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);
// Listen on the connection
connection.listen();
//# sourceMappingURL=server.js.map