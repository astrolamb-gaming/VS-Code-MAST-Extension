"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadStyleDefs = loadStyleDefs;
/**
 * Get all the style string attributes, e.g. 'area' and 'tag'
 * @param file The uri of the file
 * @param text The contents of the file
 * @returns A list of all the style strings
 */
function loadStyleDefs(file, text) {
    let ret = [];
    if (file.endsWith("style.py") && file.includes("procedural")) {
        let pattern = /style_def\.get\([\"\'](.*)[\"\']\)/g;
        let m;
        while (m = pattern.exec(text)) {
            ret.push(m[1]);
        }
    }
    return ret;
}
//# sourceMappingURL=styles.js.map