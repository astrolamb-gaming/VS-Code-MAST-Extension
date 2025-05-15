"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onReferences = onReferences;
const cache_1 = require("./cache");
const words_1 = require("./tokens/words");
const server_1 = require("./server");
const fileFunctions_1 = require("./fileFunctions");
const console_1 = require("console");
function onReferences(params) {
    let locs = [];
    const pos = params.position;
    const doc = server_1.documents.get(params.textDocument.uri);
    if (doc === undefined)
        return [];
    const word = (0, words_1.getWordRangeAtPosition)(doc, pos);
    (0, console_1.debug)("Finding: " + word);
    const words = (0, cache_1.getCache)(params.textDocument.uri).getWords();
    for (const w of words) {
        if (w.name !== word)
            continue;
        let loc = {
            uri: (0, fileFunctions_1.fileFromUri)(w.doc),
            range: w.range
        };
        locs.push(loc);
    }
    return locs;
}
//# sourceMappingURL=references.js.map