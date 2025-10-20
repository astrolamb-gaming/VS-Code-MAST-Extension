"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onReferences = onReferences;
const cache_1 = require("./../cache");
const console_1 = require("console");
const hover_1 = require("./hover");
const comments_1 = require("./../tokens/comments");
const fileFunctions_1 = require("../fileFunctions");
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
    let word = (0, hover_1.getHoveredSymbol)((0, hover_1.getCurrentLineFromTextDocument)(pos, doc), pos.character); //getWordRangeAtPosition(doc,pos);
    if (word.startsWith("/")) {
        word = word.substring(1, word.length);
    }
    // Check signals - which can be in a string.
    (0, console_1.debug)(word);
    let signals = (0, cache_1.getCache)(doc.uri).getSignals();
    for (const s of signals) {
        if (word === s.name) {
            locs = s.emit.concat(s.triggered);
            return locs;
        }
    }
    let blob_keys = (0, cache_1.getCache)(doc.uri).getBlobKeys();
    for (const k of blob_keys) {
        if (k.name === word) {
            locs = locs.concat(k.locations);
        }
    }
    let inventory_keys = (0, cache_1.getCache)(doc.uri).getKeys(doc.uri);
    for (const k of inventory_keys) {
        if (k.name === word) {
            locs = locs.concat(k.locations);
        }
    }
    let links = (0, cache_1.getCache)(doc.uri).getLinks();
    for (const l of links) {
        if (l.name === word) {
            locs = locs.concat(l.locations);
        }
    }
    let roles = (0, cache_1.getCache)(doc.uri).getRoles(doc.uri);
    for (const r of roles) {
        if (r.name === word) {
            locs = locs.concat(r.locations);
        }
    }
    // Get references for labels
    // TODO: Refactor labels to use a similar system as Signals
    // let labels = getCache(doc.uri).getLabels(doc, false);
    // for (const label of labels) {
    // }
    if ((0, comments_1.isInString)(doc, doc.offsetAt(pos)) && !(0, comments_1.isInYaml)(doc, doc.offsetAt(pos)))
        return locs;
    // Now we'll check for any instance where it COULD be a function name. Because Python.
    let func = (0, cache_1.getCache)(doc.uri).getMethod(word);
    if (func) {
        const loc = func.location;
        loc.uri = (0, fileFunctions_1.fileFromUri)(loc.uri);
        locs.push(loc);
    }
    // debug("getWOrdRange")
    // debug("Finding: " + word);
    const wordLocs = (0, cache_1.getCache)(params.textDocument.uri).getWordLocations(word);
    for (const loc of wordLocs) {
        locs = locs.concat(loc);
    }
    return locs;
}
//# sourceMappingURL=references.js.map