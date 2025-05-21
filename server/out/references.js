"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onReferences = onReferences;
const cache_1 = require("./cache");
const words_1 = require("./tokens/words");
const server_1 = require("./server");
const console_1 = require("console");
async function onReferences(params) {
    (0, console_1.debug)("Trying to find word...");
    let locs = [];
    const pos = params.position;
    const doc = server_1.documents.get(params.textDocument.uri);
    if (doc === undefined) {
        (0, console_1.debug)("Undefined doc...");
        return [];
    }
    const word = (0, words_1.getWordRangeAtPosition)(doc, pos);
    (0, console_1.debug)("Finding: " + word);
    const wordLocs = (0, cache_1.getCache)(params.textDocument.uri).getWordLocations(word);
    for (const loc of wordLocs) {
        locs = locs.concat(loc);
    }
    return locs;
}
//# sourceMappingURL=references.js.map