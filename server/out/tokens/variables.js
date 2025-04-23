"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.variables = exports.variableModifiers = void 0;
exports.getVariableNamesInDoc = getVariableNamesInDoc;
exports.getVariablesAsCompletionItem = getVariablesAsCompletionItem;
const vscode_languageserver_1 = require("vscode-languageserver");
// TODO: Add these to autocomplete and hover
exports.variableModifiers = [
    ["default", "`Default` means that if the variable is not already defined, define it. Otherwise, skip. So it does not overwrite if it exists."],
    ["shared", "Variables with this modifier are used by the server and all clients"],
    // TODO: what do assigned and temp do to variables?
    ["assigned", ""],
    ["client", "Variables with the `client` modifier are only used by the client."],
    ["temp", ""]
];
exports.variables = [];
function getVariableNamesInDoc(textDocument) {
    let vars = [];
    const variableRX = /^[\t ]*(default[ \t]+)?((shared|assigned|client|temp)\s+)?[a-zA-Z_]\w*[\t ]*(?==[^=])/gm;
    const text = textDocument.getText();
    let m;
    while (m = variableRX.exec(text)) {
        const v = m[0].replace(/(shared|assigned|client|temp|default)/g, "").trim();
        //debug(m[0])
        if (!vars.includes(v)) {
            vars.push(v);
        }
    }
    vars = [...new Set(vars)];
    return vars;
}
function getVariablesAsCompletionItem(vars) {
    const arr = [];
    for (const v of vars) {
        const ci = {
            label: v,
            kind: vscode_languageserver_1.CompletionItemKind.Variable,
            //TODO: Check type of variable?
            labelDetails: { description: "var" }
        };
        arr.push(ci);
    }
    exports.variables = arr;
    return arr;
}
//# sourceMappingURL=variables.js.map