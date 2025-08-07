"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onReferences = onReferences;
const cache_1 = require("./cache");
const console_1 = require("console");
const hover_1 = require("./hover");
const comments_1 = require("./tokens/comments");
async function onReferences(doc, params) {
    (0, console_1.debug)("Trying to find word...");
    let locs = [];
    const pos = params.position;
    // debug(doc);
    if (doc === undefined) {
        (0, console_1.debug)("Undefined doc...");
        return locs;
    }
    // If it's in a comment, or in a string but not in metadata, then return empty
    if ((0, comments_1.isInComment)(doc, doc.offsetAt(pos)))
        return locs;
    const word = (0, hover_1.getHoveredSymbol)((0, hover_1.getCurrentLineFromTextDocument)(pos, doc), pos.character); //getWordRangeAtPosition(doc,pos);
    // Check signals - which can be in a string.
    let signals = (0, cache_1.getCache)(doc.uri).getSignals();
    for (const s of signals) {
        if (word === s.name) {
            locs = s.emit.concat(s.triggered);
            return locs;
        }
    }
    if ((0, comments_1.isInString)(doc, doc.offsetAt(pos)) && !(0, comments_1.isInYaml)(doc, doc.offsetAt(pos)))
        return locs;
    // debug("getWOrdRange")
    // debug("Finding: " + word);
    const wordLocs = (0, cache_1.getCache)(params.textDocument.uri).getWordLocations(word);
    for (const loc of wordLocs) {
        locs = locs.concat(loc);
    }
    return locs;
}
//# sourceMappingURL=references.js.map