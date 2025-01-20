"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInComment = isInComment;
exports.getComments = getComments;
const console_1 = require("console");
const fs = require("fs");
function isInComment(loc) {
    for (const r in commentRanges) {
        if (commentRanges[r].start < loc && commentRanges[r].end > loc) {
            return true;
        }
    }
    return false;
}
let commentRanges = [];
/**
 * Should be called whenever the file is updated.
 * Really should be more efficient and add/remove as necessary, but I'm not taking the time to do that yet.
 * @param textDocument
 */
function getComments(textDocument) {
    commentRanges = [];
    const text = textDocument.getText();
    let pattern = /\/\*.*?\*\//gs;
    // Gets all the block comments
    commentRanges = commentRanges.concat(getMatchesForRegex(pattern, text));
    let m;
    let strRng = [];
    pattern = /\".*?\"/g;
    strRng = getMatchesForRegex(pattern, text);
    (0, console_1.debug)(strRng);
    pattern = /\#.*?(\"|$)/g;
    while (m = pattern.exec(text)) {
        let comment = m[0];
        (0, console_1.debug)(m);
        for (const i in strRng) {
            if (strRng[i].start < m.index && m.index < strRng[i].end) {
            }
            else {
                const r = {
                    start: m.index,
                    end: m.index + m[0].length
                };
                commentRanges.push(r);
            }
        }
    }
}
function getMatchesForRegex(pattern, text) {
    let matches = [];
    let m;
    while (m = pattern.exec(text)) {
        let comment = m[0];
        (0, console_1.debug)(comment);
        const r = {
            start: m.index,
            end: m.index + m[0].length
        };
        matches.push(r);
    }
    return matches;
}
function log(str) {
    fs.writeFileSync('outputLog.txt', str, { flag: "a+" });
}
function getStrings(textDocument) {
    const text = textDocument.getText();
    let strings = [];
    let pattern = /\".*?\"/g;
}
//# sourceMappingURL=comments.js.map