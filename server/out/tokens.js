"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenType = void 0;
exports.getAllTokens = getAllTokens;
function getAllTokens(textDocument) {
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
//# sourceMappingURL=tokens.js.map