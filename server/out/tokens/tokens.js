"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenType = void 0;
exports.getTokenInfo = getTokenInfo;
exports.getTokenAt = getTokenAt;
exports.getVariableTypeFromFunction = getVariableTypeFromFunction;
exports.updateTokensForLine = updateTokensForLine;
exports.isFunction = isFunction;
exports.isClassMethod = isClassMethod;
exports.getClassOfMethod = getClassOfMethod;
exports.getWordRangeAtPosition = getWordRangeAtPosition;
const comments_1 = require("../tokens/comments");
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
function isFunction(line, token) {
    const start = line.indexOf(token);
    const end = start + token.length;
    // debug(line.substring(end).trim());
    if (line.substring(end).trim().startsWith("(")) {
        // debug("TRUE")
        return true;
    }
    return false;
}
/**
 * Somewhat misleading of a name, since it returns true if it's just a parameter
 * E.g. class.param would return true for param
 * @param line
 * @param token
 * @returns
 */
function isClassMethod(line, token) {
    const start = line.indexOf(token);
    const end = start + token.length;
    if (isFunction(line, token)) {
        // debug(line.substring(0,start));
        if (line.substring(0, start).trim().endsWith(".")) {
            return true;
        }
    }
    return false;
}
function getClassOfMethod(line, token) {
    const start = line.indexOf(token);
    const end = start + token.length;
    line = line.substring(0, start - 1);
    const className = /[a-zA-Z_]\w*$/m;
    let m;
    while (m = className.exec(line)) {
        const c = m[0];
        //debug(c);
        return c;
    }
}
function getWordRangeAtPosition(line, pos) {
    let start = pos.character;
    let end = pos.character;
    while (line.charAt(start).match(/\w/)) {
        start = start - 1;
    }
    while (line.charAt(end).match(/\w/)) {
        end = end + 1;
    }
    let range = {
        start: { line: pos.line, character: start },
        end: { line: pos.line, character: end }
    };
    return range;
}
//# sourceMappingURL=tokens.js.map