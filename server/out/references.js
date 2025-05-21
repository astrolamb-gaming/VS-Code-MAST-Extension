"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onReferences = onReferences;
const cache_1 = require("./cache");
const console_1 = require("console");
const hover_1 = require("./hover");
async function onReferences(doc, params) {
    (0, console_1.debug)("Trying to find word...");
    let locs = [];
    const pos = params.position;
    (0, console_1.debug)(doc);
    if (doc === undefined) {
        (0, console_1.debug)("Undefined doc...");
        return [];
    }
    (0, console_1.debug)("getWOrdRange");
    const word = (0, hover_1.getHoveredSymbol)((0, hover_1.getCurrentLineFromTextDocument)(pos, doc), pos.character); //getWordRangeAtPosition(doc,pos);
    (0, console_1.debug)("Finding: " + word);
    const wordLocs = (0, cache_1.getCache)(params.textDocument.uri).getWordLocations(word);
    for (const loc of wordLocs) {
        locs = locs.concat(loc);
    }
    return locs;
}
//# sourceMappingURL=references.js.map