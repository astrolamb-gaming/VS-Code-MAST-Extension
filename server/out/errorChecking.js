"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findDiagnostic = findDiagnostic;
exports.relatedMessage = relatedMessage;
const server_1 = require("./server");
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