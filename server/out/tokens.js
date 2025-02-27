"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.variables = exports.TokenType = void 0;
exports.getAllTokens = getAllTokens;
exports.getVariableNamesInDoc = getVariableNamesInDoc;
const console_1 = require("console");
const vscode_languageserver_1 = require("vscode-languageserver");
const data_1 = require("./data");
function getAllTokens(textDocument) {
    let variables = (0, data_1.getVariablesInFile)(textDocument);
}
var TokenType;
(function (TokenType) {
    TokenType[TokenType["VARIABLE"] = 0] = "VARIABLE";
    TokenType[TokenType["STRING"] = 1] = "STRING";
    TokenType[TokenType["FUNC"] = 2] = "FUNC";
    TokenType[TokenType["CLASS"] = 3] = "CLASS";
    TokenType[TokenType["OPERATOR"] = 4] = "OPERATOR";
    TokenType[TokenType["LABEL"] = 5] = "LABEL";
    TokenType[TokenType["ROUTE_LABEL"] = 6] = "ROUTE_LABEL";
    TokenType[TokenType["RESOURCE_LABEL"] = 7] = "RESOURCE_LABEL";
    TokenType[TokenType["MEDIA_LABEL"] = 8] = "MEDIA_LABEL";
})(TokenType || (exports.TokenType = TokenType = {}));
function getTokenTypeRegex(type) {
    switch (type) {
        case TokenType.STRING:
            return /\".*?\"/;
        case TokenType.VARIABLE:
            return /\b\w+\b/;
        default:
            return /test/;
    }
}
exports.variables = [];
function getVariableNamesInDoc(textDocument) {
    (0, console_1.debug)("Getting variable names");
    const vars = [];
    const arr = [];
    const variableRX = /^\s*[a-zA-Z_]\w*\s*(?==[^=])/gm;
    const text = textDocument.getText();
    let m;
    while (m = variableRX.exec(text)) {
        const v = m[0].trim();
        (0, console_1.debug)(m[0]);
        if (!vars.includes(v)) {
            vars.push(v);
        }
    }
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
//# sourceMappingURL=tokens.js.map