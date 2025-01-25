"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkLastLine = checkLastLine;
exports.findDiagnostic = findDiagnostic;
exports.relatedMessage = relatedMessage;
const node_1 = require("vscode-languageserver/node");
const server_1 = require("./server");
/**
 * Checks if the file ends with an empty line.
 * @param textDocument
 * @returns
 */
function checkLastLine(textDocument) {
    const text = textDocument.getText();
    textDocument.lineCount;
    const lastLinePos = textDocument.offsetAt({
        line: textDocument.lineCount - 1,
        character: 0
    });
    const lastLine = text.substring(lastLinePos);
    if (lastLine !== "") {
        const diagnostic = {
            severity: node_1.DiagnosticSeverity.Error,
            range: {
                start: textDocument.positionAt(lastLinePos),
                end: textDocument.positionAt(lastLinePos + lastLine.length)
            },
            message: "MAST Compiler Error: File must end with an empty line.",
            source: "MAST Compiler " + __filename
        };
        return diagnostic;
    }
    return undefined;
}
function findDiagnostic(pattern, textDocument, severity, message, source, relatedInfo, maxProblems, problems) {
    const text = textDocument.getText();
    let m;
    const diagnostics = [];
    while ((m = pattern.exec(text)) && problems < maxProblems) {
        //debug(JSON.stringify(m));
        problems++;
        const diagnostic = {
            severity: severity,
            range: {
                start: textDocument.positionAt(m.index),
                end: textDocument.positionAt(m.index + m[0].length)
            },
            message: message,
            source: source
        };
        if (server_1.hasDiagnosticRelatedInformationCapability) {
            diagnostic.relatedInformation = [
                {
                    location: {
                        uri: textDocument.uri,
                        range: Object.assign({}, diagnostic.range)
                    },
                    message: relatedInfo
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
//# sourceMappingURL=errorChecking.js.map