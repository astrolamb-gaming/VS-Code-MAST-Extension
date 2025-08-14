"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onRenameRequest = onRenameRequest;
const hover_1 = require("./hover");
const server_1 = require("./../server");
const labels_1 = require("./../tokens/labels");
const cache_1 = require("./../cache");
function onRenameRequest(params) {
    let uri = params.textDocument.uri;
    let symbol_pos = params.position;
    let doc = server_1.documents.get(uri);
    if (!doc)
        return;
    let line = (0, hover_1.getCurrentLineFromTextDocument)(symbol_pos, doc);
    let replace = (0, hover_1.getHoveredSymbol)(line, symbol_pos.character);
    // Get the current label
    let mains = (0, cache_1.getCache)(uri).getLabels(doc, true);
    let label = (0, labels_1.getMainLabelAtPos)(doc.offsetAt(symbol_pos), mains);
    // if (!label) return;
    let labelContents = doc.getText().substring(label.start, label.end);
    let find = new RegExp(replace);
    let edits = [];
    let m;
    while (m = find.exec(labelContents)) {
        const te = {
            range: {
                start: doc.positionAt(m.index),
                end: doc.positionAt(m[0].length + m.index)
            },
            newText: params.newName
        };
        edits.push(te);
    }
    // let docEdit: TextDocumentEdit = {
    // 	textDocument: {uri: uri, version: 1},
    // 	edits: edits
    // }
    let ret = {
        changes: {
            uri: edits
        }
    };
    return ret;
}
//# sourceMappingURL=renameSymbol.js.map