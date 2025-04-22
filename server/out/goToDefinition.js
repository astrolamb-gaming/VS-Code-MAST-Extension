"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onDefinition = onDefinition;
function onDefinition(params) {
    let start = { line: 1, character: 1 };
    let end = { line: 1, character: 5 };
    let range = {
        start: start,
        end: end
    };
    let def = {
        uri: params.textDocument.uri,
        range: range
    };
    return def;
}
//# sourceMappingURL=goToDefinition.js.map