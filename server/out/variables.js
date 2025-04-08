"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.variables = void 0;
exports.getVariableNamesInDoc = getVariableNamesInDoc;
exports.getVariablesAsCompletionItem = getVariablesAsCompletionItem;
const vscode_languageserver_1 = require("vscode-languageserver");
exports.variables = [];
function getVariableNamesInDoc(textDocument) {
    let vars = [];
    const variableRX = /^[\t ]*[a-zA-Z_]\w*[\t ]*(?==[^=])/gm;
    const text = textDocument.getText();
    let m;
    while (m = variableRX.exec(text)) {
        const v = m[0].trim();
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