"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInComment = isInComment;
exports.isInString = isInString;
exports.isInYaml = isInYaml;
exports.getComments = getComments;
exports.getYamls = getYamls;
exports.getIndentations = getIndentations;
exports.getMatchesForRegex = getMatchesForRegex;
exports.getBrackets = getBrackets;
exports.isTextInBracket = isTextInBracket;
exports.getStrings = getStrings;
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
let yamlRanges = [];
function isInString(loc) {
    for (const r in stringRanges) {
        if (stringRanges[r].start < loc && stringRanges[r].end > loc) {
            return true;
        }
    }
    return false;
}
function isInYaml(loc) {
    for (const r in yamlRanges) {
        if (yamlRanges[r].start < loc && yamlRanges[r].end > loc) {
            return true;
        }
    }
    return false;
}
/**
 * Should be called whenever the file is updated.
 * Really should be more efficient and add/remove as necessary, but I'm not taking the time to do that yet.
 * TODO: Update this system so that it only checks changed lines, and the surrounding ones if necessary,
 *  and updates the CRanges based on that.
 * @param textDocument
 */
function getComments(textDocument) {
    getStrings(textDocument);
    commentRanges = [];
    const text = textDocument.getText();
    let pattern = /\/\*.*?\*\//gs;
    // Gets all the block comments
    commentRanges = commentRanges.concat(getMatchesForRegex(pattern, text));
    let m;
    let strRng = [];
    pattern = /\".*?\"/g;
    strRng = stringRanges; //getMatchesForRegex(pattern,text);
    pattern = /\#.*?(\"|$)/gm;
    while (m = pattern.exec(text)) {
        let comment = m[0];
        let inString = false;
        // Now we iterate of strRange, which is all the strings in the file.
        // We're checking to make sure that the start index of the presumed comment is not 
        // within a string. If so, it's not a real comment.
        // E.g. spawn_asteroid("whatever", "asteroid,#", "whatever") has a # inside of a set
        // of double quotes, so it doesn't actually indicate a comment start.
        for (const i in strRng) {
            if (strRng[i].start < m.index && m.index < strRng[i].end) {
                inString = true;
            }
        }
        if (!inString) {
            const r = {
                start: m.index,
                end: m.index + m[0].length + 1
            };
            commentRanges.push(r);
        }
    }
}
function getYamls(textDocument) {
    const text = textDocument.getText();
    let yamls = [];
    let yaml = /^\\s*---$.*^\\s*?...$/gms;
    yamls = getMatchesForRegex(yaml, text);
    //debug(strings);
    //stringRanges = yamls;
    //debug("Strings found: " + strings.length);
    return yamls;
}
const indents = [];
const dedents = [];
/**
 * TODO: Finish this function
 * @param textDocument
 */
function getIndentations(textDocument) {
    let text = textDocument.getText();
    let m;
    let pattern = /^[\\t ]*/gm;
    while (m = pattern.exec(text)) {
        let comment = m[0];
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
/**
 * This function may be completely unnecessary
 */
function getBrackets(textDocument) {
    const text = textDocument.getText();
    let brackets = [];
    let pattern = /{.*?}/g;
    brackets = getMatchesForRegex(pattern, text);
    return brackets;
}
function isTextInBracket(text, pos) {
    let brackets = [];
    let pattern = /{.*?}/g;
    brackets = getMatchesForRegex(pattern, text);
    for (const b of brackets) {
        if (b.start < pos && b.end > pos) {
            return true;
        }
    }
    return false;
}
function getStrings(textDocument) {
    const text = textDocument.getText();
    let strings = [];
    //let pattern: RegExp = //gm;
    // TODO: Get all sets of {} to see if we're in an f-string and need to exclude sections of the string
    let strDouble = /([\"'].*?[\"'])/gm;
    let strDoubleStartOnly = /(^\\s*?(\")[^\"]*?(\\n|$))/gm;
    let multiDouble = /(\^{3,}.*?\^{3,})/gm;
    let caretDouble = /([\"']{3,}.*?[\"']{3,})/gs;
    strings = getMatchesForRegex(strDouble, text);
    strings = strings.concat(getMatchesForRegex(strDoubleStartOnly, text));
    strings = strings.concat(getMatchesForRegex(multiDouble, text));
    strings = strings.concat(getMatchesForRegex(caretDouble, text));
    //debug(strings);
    stringRanges = strings;
    //debug("Strings found: " + strings.length);
    return strings;
}
//# sourceMappingURL=comments.js.map