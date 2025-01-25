"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInComment = isInComment;
exports.isInString = isInString;
exports.getComments = getComments;
exports.getIndentations = getIndentations;
exports.getStrings = getStrings;
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
let stringRanges = [];
function isInString(loc) {
    for (const r in stringRanges) {
        if (stringRanges[r].start < loc && stringRanges[r].end > loc) {
            return true;
        }
    }
    return false;
}
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
    pattern = /\#.*?(\"|$)/g;
    while (m = pattern.exec(text)) {
        let comment = m[0];
        //debug(m);
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
const indents = [];
const dedents = [];
function getIndentations(textDocument) {
    let text = textDocument.getText();
    let m;
    let pattern = /^[\\t ]*/gm;
    while (m = pattern.exec(text)) {
        let comment = m[0];
        (0, console_1.debug)(comment);
        const r = {
            start: m.index,
            end: m.index + m[0].length
        };
    }
}
function getMatchesForRegex(pattern, text) {
    let matches = [];
    let m;
    while (m = pattern.exec(text)) {
        let comment = m[0];
        //debug(comment);
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
    //let pattern: RegExp = //gm;
    // TODO: Get all sets of {} to see if we're in an f-string and need to exclude sections of the string
    let strDouble = /([\"\'].*?[\"\'])/gm;
    let strDoubleStartOnly = /(^\\s*?(\")[^\"]*?(\\n|$))/gm;
    let multiDouble = /(\^{3,}.*?\^{3,})/gm;
    let caretDouble = /(\"{3,}.*?\"{3,})/gs;
    strings = getMatchesForRegex(strDouble, text);
    //debug(strings);
    stringRanges = strings;
    return strings;
}
//# sourceMappingURL=comments.js.map