"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.variables = exports.variableModifiers = void 0;
exports.getVariableNamesInDoc = getVariableNamesInDoc;
exports.parseVariables = parseVariables;
exports.getVariablesAsCompletionItem = getVariablesAsCompletionItem;
const vscode_languageserver_1 = require("vscode-languageserver");
const hover_1 = require("../hover");
const console_1 = require("console");
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
function getVariableNamesInDoc(doc) {
    let vars = [];
    const variableRX = /^[\t ]*(default[ \t]+)?((shared|assigned|client|temp)\s+)?[a-zA-Z_]\w*[\t ]*(?==[^=])/gm;
    const text = doc.getText();
    let m;
    while (m = variableRX.exec(text)) {
        const v = m[0].replace(/(shared|assigned|client|temp|default)/g, "").trim();
        if (!vars.includes(v)) {
            vars.push(v);
        }
    }
    vars = [...new Set(vars)];
    return vars;
}
function parseVariables(doc) {
    let ret = [];
    const variableRX = /^[\t ]*(default[ \t]+)?((shared|assigned|client|temp)\s+)?[a-zA-Z_]\w*[\t ]*(?==[^=])/gm;
    const text = doc.getText();
    let m;
    while (m = variableRX.exec(text)) {
        const v = m[0].replace(/(shared|assigned|client|temp|default)/g, "").trim();
        const start = m[0].indexOf(v) + m.index;
        const end = start + m[0].length;
        const range = { start: doc.positionAt(start), end: doc.positionAt(end) };
        const line = (0, hover_1.getCurrentLineFromTextDocument)(range.start, doc);
        let val = line.substring(line.indexOf("=") + 1, line.length).trim();
        (0, console_1.debug)("Variable: " + v);
        (0, console_1.debug)(val);
        let var1 = {
            name: v,
            range: range,
            doc: '',
            types: []
        };
        if (val.match(/-?\d+/)) {
            var1.types.push("number");
        }
        const match = val.match(/(\w+\.)?(\w+)\(/);
        if (match) {
            const func = match[2];
        }
    }
    ret = [...new Map(ret.map(v => [v.name, v])).values()];
    return ret;
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