"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkLastLine = checkLastLine;
exports.findDiagnostic = findDiagnostic;
exports.relatedMessage = relatedMessage;
exports.checkFunctionSignatures = checkFunctionSignatures;
const node_1 = require("vscode-languageserver/node");
const server_1 = require("./server");
const console_1 = require("console");
const comments_1 = require("./tokens/comments");
/**
 * Checks if the file ends with an empty line.
 * @param textDocument
 * @returns
 */
function checkLastLine(textDocument) {
    if (textDocument.languageId !== "mast")
        return undefined;
    if (textDocument.uri.endsWith("__init__.mast"))
        return undefined;
    const text = textDocument.getText();
    textDocument.lineCount;
    const lastLinePos = textDocument.offsetAt({
        line: textDocument.lineCount - 1,
        character: 0
    });
    const arr = text.split("\n");
    //const lastLine = text.substring(lastLinePos);
    const lastLine = arr[arr.length - 1];
    if (lastLine !== "") {
        const diagnostic = {
            severity: node_1.DiagnosticSeverity.Error,
            range: {
                start: textDocument.positionAt(text.length - lastLine.length),
                end: textDocument.positionAt(text.length)
            },
            message: "MAST Compiler Error: File must end with an empty line.",
            source: "MAST Compiler " + __filename
        };
        return diagnostic;
    }
    return undefined;
}
// export function findDiagnostic(pattern: RegExp, textDocument: TextDocument, severity: DiagnosticSeverity, message: string, source: string, relatedInfo: string, maxProblems: integer, problems: integer): Diagnostic[] {
function findDiagnostic(e, textDocument, problems, maxProblems) {
    let text = textDocument.getText();
    const commentsStrings = (0, comments_1.getComments)(textDocument).concat((0, comments_1.getStrings)(textDocument));
    // TODO: This doesn't work right for weighted text in particular.
    for (const c of commentsStrings) {
        text = (0, comments_1.replaceRegexMatchWithUnderscore)(text, c);
    }
    let m;
    const diagnostics = [];
    while ((m = e.pattern.exec(text)) && problems < maxProblems) {
        //debug(JSON.stringify(m));
        problems++;
        const diagnostic = {
            severity: e.severity,
            range: {
                start: textDocument.positionAt(m.index),
                end: textDocument.positionAt(m.index + m[0].length)
            },
            message: e.message,
            source: e.source
        };
        if (server_1.hasDiagnosticRelatedInformationCapability) {
            diagnostic.relatedInformation = [
                {
                    location: {
                        uri: textDocument.uri,
                        range: Object.assign({}, diagnostic.range)
                    },
                    message: e.relatedMessage
                }
            ];
        }
        diagnostics.push(diagnostic);
    }
    return diagnostics;
}
function relatedMessage(t, range, rm) {
    if (server_1.hasDiagnosticRelatedInformationCapability) {
        const dri = [
            {
                location: {
                    uri: t.uri,
                    range: Object.assign({}, range)
                },
                message: rm
            }
        ];
        return dri;
    }
    return undefined;
}
/**
 * TODO: get this check system working
 * @param text String containing contents of document
 */
function checkFunctionSignatures(textDocument) {
    const text = textDocument.getText();
    (0, console_1.debug)("Starting function signature checking");
    const diagnostics = [];
    const functionRegex = /(\w+)\(.*(\n|$)/gm;
    const singleFunc = /(\w+)\(/g;
    let m;
    // Iterate over all lines that contain at least one function
    while (m = functionRegex.exec(text)) {
        const functions = [];
        const line = m[0];
        if ((0, comments_1.isInComment)(textDocument, m.index))
            continue;
        if ((0, comments_1.isInString)(textDocument, m.index) && !(0, comments_1.isInYaml)(textDocument, m.index))
            continue;
        const functionName = line.match(singleFunc);
        (0, console_1.debug)(functionName);
        let end = line.lastIndexOf(")");
        if (functionName !== null) {
            // debug(functionName);
            for (const fname of functionName) {
                const fi = {
                    name: fname,
                    start: m.index + line.indexOf(fname),
                    end: line.lastIndexOf(")")
                };
                functions.push(fi);
                (0, console_1.debug)("Name: " + fname);
            }
        }
        end = line.lastIndexOf(")");
        let func = line.substring(0, end + 1);
        (0, console_1.debug)(func);
        //debug(m);
        (0, console_1.debug)(line);
    }
    return diagnostics;
}
//# sourceMappingURL=errorChecking.js.map