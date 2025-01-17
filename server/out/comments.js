"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInComment = isInComment;
exports.getComments = getComments;
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
function getComments(textDocument) {
    commentRanges = [];
    const text = textDocument.getText();
    let pattern = /\/\*.*?\*\//gs;
    let m;
    while (m = pattern.exec(text)) {
        let comment = m[0];
        //debug(comment);
        log(comment);
        const r = {
            start: m.index,
            end: m.index + m[0].length
        };
        commentRanges.push(r);
    }
    pattern = /\#.*?(\"|$)/g;
    while (m = pattern.exec(text)) {
        let comment = m[0];
        if (comment.endsWith("\"")) {
            // TODO: Is this comment within a string?
        }
        log(comment);
        const r = {
            start: m.index,
            end: m.index + m[0].length
        };
    }
}
function log(str) {
    fs.writeFileSync('outputLog.txt', str, { flag: "a+" });
}
//# sourceMappingURL=comments.js.map