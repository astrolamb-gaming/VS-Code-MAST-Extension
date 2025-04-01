"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTextDocument = validateTextDocument;
const console_1 = require("console");
const vscode_languageserver_1 = require("vscode-languageserver");
const cache_1 = require("./cache");
const comments_1 = require("./comments");
const errorChecking_1 = require("./errorChecking");
const labels_1 = require("./labels");
const server_1 = require("./server");
const routeLabels_1 = require("./routeLabels");
let debugStrs = ""; //Debug: ${workspaceFolder}\n";
async function validateTextDocument(textDocument) {
    if (textDocument.languageId === "json") {
        // TODO: Add autocompletion for story.json
        (0, console_1.debug)("THIS IS A JSON FILE");
        return [];
    }
    (0, cache_1.getCache)(textDocument.uri).updateLabels(textDocument);
    //debug("Validating document");
    // In this simple example we get the settings for every validate run.
    let maxNumberOfProblems = 100;
    const settings = await (0, server_1.getDocumentSettings)(textDocument.uri);
    if (settings !== null) {
        maxNumberOfProblems = settings.maxNumberOfProblems;
    }
    (0, comments_1.getSquareBrackets)(textDocument);
    let strs = (0, comments_1.getStrings)(textDocument);
    let comments = (0, comments_1.getComments)(textDocument);
    (0, comments_1.getYamls)(textDocument);
    // The validator creates diagnostics for all uppercase words length 2 and more
    const text = textDocument.getText();
    //currentDocument = textDocument;
    const pattern = /\b[A-Z]{2,}\b/g;
    let m;
    let problems = 0;
    let diagnostics = [];
    let errorSources = [];
    // for (const s of comments) {
    // 	let r: Range = {
    // 		start: textDocument.positionAt(s.start),
    // 		end: textDocument.positionAt(s.end)
    // 	}
    // 	let d: Diagnostic = {
    // 		range: r,
    // 		message: 'start: ' + s.start + ", end: " + s.end
    // 	}
    // 	diagnostics.push(d);
    // }
    // return diagnostics;
    let e1 = {
        pattern: /(^(=|-){2,}[ \t]*([0-9A-Za-z _]+?)[ \t]*(-|=)[ \t]*([0-9A-Za-z _]+?)(=|-){2,})/gm,
        severity: vscode_languageserver_1.DiagnosticSeverity.Error,
        message: "Label Definition: Cannot use '-' or '=' inside label name.",
        source: "sbs",
        relatedMessage: "Only A-Z, a-z, 0-9, and _ are allowed to be used in a label name."
    };
    errorSources.push(e1);
    e1 = {
        pattern: /^[\w ][^+][^\"][\w\(\) ]+?\/\//g,
        severity: vscode_languageserver_1.DiagnosticSeverity.Error,
        message: "Route labels can only be at the start of a line, unless used as label that runs when button is pressed.",
        source: "sbs",
        relatedMessage: "See https://artemis-sbs.github.io/sbs_utils/mast/routes/ for more details on routes."
    };
    e1 = {
        pattern: /\b[A-Z]{2,}\b/g,
        severity: vscode_languageserver_1.DiagnosticSeverity.Information,
        source: "mast",
        message: "CAPS " + debugStrs,
        relatedMessage: "Is all caps intentional?"
    };
    e1 = {
        pattern: /\w+\.($|\n)/gs,
        severity: vscode_languageserver_1.DiagnosticSeverity.Error,
        source: "mast",
        message: "Property for object not specified.",
        relatedMessage: ""
    };
    errorSources.push(e1);
    for (let i = 0; i < errorSources.length; i++) {
        let d1 = (0, errorChecking_1.findDiagnostic)(errorSources[i].pattern, textDocument, errorSources[i].severity, errorSources[i].message, errorSources[i].source, errorSources[i].relatedMessage, maxNumberOfProblems, problems);
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
    const mastCompilerErrors = [];
    // compileMission(textDocument.uri, textDocument.getText(), getCache(textDocument.uri).storyJson.sbslib).then((errors)=>{
    // 	debug(errors);
    // });
    // const functionSigs = checkFunctionSignatures(textDocument);
    // debug(functionSigs);
    // diagnostics = diagnostics.concat(functionSigs);
    let fstring = /\".*\{.*\}.*\"/g;
    let interior = /{.*\".*\".*}/g;
    while (m = fstring.exec(text)) {
        let ints = (0, comments_1.getMatchesForRegex)(interior, m[0]);
        for (const i of ints) {
            let str = text.substring(m.index + i.start, m.index + i.end);
            let start = str.indexOf("\"");
            let end = str.indexOf("\"", start + 1) + 1;
            if (end === 0) {
                end = start + 1;
            }
            let r = {
                start: textDocument.positionAt(m.index + i.start + start),
                end: textDocument.positionAt(m.index + i.start + end)
            };
            let d = {
                range: r,
                message: "Cannot use double quotes inside of an f-string that is encompassed by double quotes",
                severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                source: "mast extension"
            };
            diagnostics.push(d);
        }
    }
    fstring = /\'.*?\{.*?\}.*?\'/g;
    interior = /\{.*?\'.*?\'.*?\}/g;
    while (m = fstring.exec(text)) {
        let ints = (0, comments_1.getMatchesForRegex)(interior, m[0]);
        for (const i of ints) {
            let str = text.substring(m.index + i.start, m.index + i.end);
            let start = str.indexOf("\'");
            let end = str.indexOf("\'", start + 1) + 1;
            if (end === 0) {
                end = start + 1;
            }
            let r = {
                start: textDocument.positionAt(m.index + i.start + start),
                end: textDocument.positionAt(m.index + i.start + end)
            };
            let d = {
                range: r,
                message: "Cannot use single quotes inside of an f-string that is encompassed by single quotes",
                severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                source: "mast extension"
            };
            diagnostics.push(d);
        }
    }
    // For applicable diagnostics, check if they, or parts of them, are inside of a string or comment.
    diagnostics = diagnostics.filter((d) => {
        const start = textDocument.offsetAt(d.range.start);
        const end = textDocument.offsetAt(d.range.end);
        return (0, comments_1.isInString)(start) || (0, comments_1.isInString)(end) || (0, comments_1.isInComment)(start) || (0, comments_1.isInComment)(end);
    });
    const d = (0, errorChecking_1.checkLastLine)(textDocument);
    if (d !== undefined) {
        diagnostics.push(d);
    }
    (0, console_1.debug)("Checking enabled routes");
    const r = (0, routeLabels_1.checkEnableRoutes)(textDocument);
    (0, console_1.debug)(r);
    diagnostics = diagnostics.concat(r);
    return diagnostics;
}
//# sourceMappingURL=validate.js.map