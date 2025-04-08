"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenType = void 0;
exports.getAllTokens = getAllTokens;
exports.getTokenInfo = getTokenInfo;
exports.getTokenAt = getTokenAt;
exports.getVariableTypeFromFunction = getVariableTypeFromFunction;
exports.updateTokensForLine = updateTokensForLine;
const data_1 = require("./data");
const comments_1 = require("./comments");
function getAllTokens(textDocument) {
    let variables = (0, data_1.getVariablesInFile)(textDocument);
}
var TokenType;
(function (TokenType) {
    TokenType[TokenType["VARIABLE"] = 0] = "VARIABLE";
    TokenType[TokenType["STRING"] = 1] = "STRING";
    TokenType[TokenType["FUNC"] = 2] = "FUNC";
    TokenType[TokenType["CLASS"] = 3] = "CLASS";
    TokenType[TokenType["KEYWORD"] = 4] = "KEYWORD";
    TokenType[TokenType["OPERATOR"] = 5] = "OPERATOR";
    TokenType[TokenType["LABEL"] = 6] = "LABEL";
    TokenType[TokenType["ROUTE_LABEL"] = 7] = "ROUTE_LABEL";
    TokenType[TokenType["RESOURCE_LABEL"] = 8] = "RESOURCE_LABEL";
    TokenType[TokenType["MEDIA_LABEL"] = 9] = "MEDIA_LABEL";
    TokenType[TokenType["COMMENT"] = 10] = "COMMENT";
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
let tokens = [];
function getTokenInfo() {
    return tokens;
}
function getTokenAt(pos) {
    for (const t of tokens) {
        if (t.range.start < pos && t.range.end > pos) {
            return t;
        }
    }
}
function getVariableTypeFromFunction(textDocument) {
    const text = textDocument.getText();
    const varFunc = /(\w+)[ \t]*=[ \t]*((\w+)\.)?(\w+)\(/g;
    let m;
    while (m = varFunc.exec(text)) {
    }
}
function updateTokensForLine(line) {
}
function tokenizeDoc(doc) {
    const text = doc.getText();
    const lineTokens = [];
    const tokens = [];
    // Start with just strings
    const strings = (0, comments_1.getStrings)(doc);
    for (const s of strings) {
        const token = {
            type: TokenType.STRING,
            range: s,
            text: text.substring(s.start, s.end),
            value: text.substring(s.start, s.end)
        };
        tokens.push(token);
    }
    // Then we add comments
    const comments = (0, comments_1.getComments)(doc);
    for (const c of comments) {
        const token = {
            type: TokenType.COMMENT,
            range: c,
            text: text.substring(c.start, c.end),
            value: text.substring(c.start, c.end)
        };
        tokens.push(token);
    }
    // Next we check for keyworks
    const keywords = /(^|\s*)(def|async|on change|await|shared|import|if|else|match|case|yield)(\s*)/gm;
    let m;
    while (m = keywords.exec(text)) {
        const kw = m[0].trim();
        const token = {
            type: TokenType.KEYWORD,
            range: { start: m.index, end: m[0].length },
            text: kw,
            value: kw
        };
        tokens.push(token);
    }
}
//# sourceMappingURL=tokens.js.map