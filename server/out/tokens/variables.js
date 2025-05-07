"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.variables = exports.variableModifiers = void 0;
exports.getVariableNamesInDoc = getVariableNamesInDoc;
exports.parseVariables = parseVariables;
exports.getVariablesAsCompletionItem = getVariablesAsCompletionItem;
exports.getVariableAsCompletionItem = getVariableAsCompletionItem;
const vscode_languageserver_1 = require("vscode-languageserver");
const hover_1 = require("../hover");
// TODO: Add these to autocomplete and hover
exports.variableModifiers = [
    ["default", "`default` means that if the variable is not already defined, define it. Otherwise, skip. So it does not overwrite if it exists."],
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
        let var1 = {
            name: v,
            range: range,
            doc: '',
            equals: val,
            types: []
        };
        // Instead of parsing the type every time an updated is made (super inefficient, loading takes forever),
        // we're instead going to parse just the applicable variable.
        ret.push(var1);
    }
    ret = [...new Map(ret.map(v => [v.range, v])).values()];
    // debug(ret);
    return ret;
}
function getVariablesAsCompletionItem(vars) {
    const arr = [];
    for (const v of vars) {
        const ci = {
            label: v.name,
            kind: vscode_languageserver_1.CompletionItemKind.Variable,
            //TODO: Check type of variable?
            labelDetails: { description: "var" },
            documentation: "Possible types:\n"
        };
        for (const d of v.types) {
        }
        arr.push(ci);
    }
    exports.variables = arr;
    return arr;
}
function getVariableAsCompletionItem(vars) {
    const ci = {
        label: vars.name,
        kind: vscode_languageserver_1.CompletionItemKind.Variable,
        labelDetails: { description: "var" }
    };
    let doc = "Possible types:\n";
    for (const v of vars.types) {
        if (!doc.includes(v)) {
            doc = doc + "\n";
        }
    }
    ci.documentation = doc.trim();
    return ci;
}
//# sourceMappingURL=variables.js.map