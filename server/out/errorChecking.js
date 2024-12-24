"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findDiagnostic = findDiagnostic;
exports.checkLabels = checkLabels;
const node_1 = require("vscode-languageserver/node");
const fileFunctions_1 = require("./fileFunctions");
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
/**
 *
 * @param textDocument
 * @returns array of all defined labels in the current document
 */
function getLabels(textDocument) {
    const definedLabel = /(^(=|-){2,}([0-9A-Za-z _]+?)(=|-){2,})/gm;
    let m;
    const text = textDocument.getText();
    const labels = [];
    labels.push("END");
    (0, fileFunctions_1.debug)("Iterating over defined labels");
    while (m = definedLabel.exec(text)) {
        const str = m[0].replace(/(=|-)/g, "").trim();
        (0, fileFunctions_1.debug)(str);
        labels.push(str);
    }
    return labels;
}
function checkLabels(textDocument) {
    const text = textDocument.getText();
    const diagnostics = [];
    const calledLabel = /(^ *?-> *?[0-9A-Za-z_]{1,})|(^ *?jump *?[0-9A-Za-z_]{1,})/gm;
    let m;
    const labels = getLabels(textDocument);
    (0, fileFunctions_1.debug)("Iterating over called labels");
    while (m = calledLabel.exec(text)) {
        const str = m[0].replace(/(->)|(jump )/g, "").trim();
        (0, fileFunctions_1.debug)(str);
        let found = false;
        for (const label in labels) {
            if (str === labels[label]) {
                found = true;
            }
        }
        if (!found) {
            const d = {
                range: {
                    start: textDocument.positionAt(m.index),
                    end: textDocument.positionAt(m.index + m[0].length)
                },
                severity: node_1.DiagnosticSeverity.Error,
                message: "Specified label does not exist. Define this label before use.",
                source: "mast"
            };
            if (server_1.hasDiagnosticRelatedInformationCapability) {
                d.relatedInformation = [
                    {
                        location: {
                            uri: textDocument.uri,
                            range: Object.assign({}, d.range)
                        },
                        message: "Labels must be defined in a format beginning and ending with two or more = or - signs. They may use A-Z, a-z, 0-9, and _ in their names. Other characters are not allowed."
                    }
                ];
            }
            diagnostics.push(d);
        }
    }
    const diagnostic = {
        severity: node_1.DiagnosticSeverity.Error,
        source: "mast",
        message: "Specified label does not exist",
        relatedMessage: "Define this label before use."
    };
    return diagnostics;
}
//# sourceMappingURL=errorChecking.js.map