"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onDefinition = onDefinition;
const fileFunctions_1 = require("./fileFunctions");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
function onDefinition(params) {
    const pos = params.position;
    const uri = (0, fileFunctions_1.fixFileName)(params.textDocument.uri);
    const td = vscode_languageserver_textdocument_1.TextDocument.create(uri, "text", 1, "");
    // debug(isInComment(td, td.offsetAt(pos)));
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