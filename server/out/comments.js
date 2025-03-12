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
    const color = /#([0-9a-fA-F]{3}){1,2}[\:\,\"\' ]/g;
    while (m = pattern.exec(text)) {
        let comment = m[0];
        if (comment.match(color) !== null) {
            (0, console_1.debug)("Skipping: " + comment);
            continue;
        }
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
    return commentRanges;
}
function getYamls(textDocument) {
    const text = textDocument.getText();
    let yamls = [];
    let yaml = /```[ \t]*.*?[ \t]*?```/gms;
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
    let text = textDocument.getText();
    let strings = [];
    //let pattern: RegExp = //gm;
    // TODO: Get all sets of {} to see if we're in an f-string and need to exclude sections of the string
    let strDouble = /(\".*?\")|('.*?')/gm;
    // let strDoubleStartOnly = /(^\\s*?(\")[^\"]*?(\\n|$))/gm;
    let caretDouble = /(\^{3,}.*?\^{3,})/gm;
    let multiDouble = /(\"{3,}.*?\"{3,})|('{3,}.*?'{3,})/gs;
    let weighted = /(\%\d*|\")([^\n\r\f]*)/gs;
    // TODO: Use a single regex if possible
    // e.g.
    // Problem is that some need the /s flag while some cannot have it
    let all = /(\"{3,}.*?\"{3,})|('{3,}.*?'{3,})|(\".*?\")|('.*?')|(\%\d*|\")([^\n\r\f]*)/gm;
    let brackets = /{.*?}/gm;
    let fstrings = getMatchesForRegex(brackets, text); // f-strings
    let test = [];
    let stringRanges = [];
    test = getMatchesForRegex(multiDouble, text);
    stringRanges = stringRanges.concat(test);
    for (const t of test) {
        text = replaceRegexMatchWithUnderscore(text, t);
    }
    test = getMatchesForRegex(caretDouble, text);
    stringRanges = stringRanges.concat(test);
    for (const t of test) {
        text = replaceRegexMatchWithUnderscore(text, t);
    }
    test = getMatchesForRegex(weighted, text);
    stringRanges = stringRanges.concat(test);
    for (const t of test) {
        text = replaceRegexMatchWithUnderscore(text, t);
    }
    test = getMatchesForRegex(strDouble, text);
    stringRanges = stringRanges.concat(test);
    // for (const t of test) {
    // 	text = replaceRegexMatchWithUnderscore(text, t);
    // }
    text = textDocument.getText();
    for (const s of stringRanges) {
        (0, console_1.debug)(s);
        const str = text.substring(s.start, s.end);
        (0, console_1.debug)(str);
        fstrings = getMatchesForRegex(brackets, str);
        // If it doesn't contain any brackets, we move on.
        if (fstrings.length === 0) {
            strings.push(s);
            continue;
        }
        // Effectively an else statement:
        let start = s.start;
        for (const f of fstrings) {
            const newRange = {
                start: start,
                end: f.start
            };
            strings.push(newRange);
            start = f.end + 1;
        }
        const finalRange = {
            start: start,
            end: s.end
        };
        strings.push(finalRange);
    }
    //debug(strings);
    // for (const r of strings) {
    // 	debug(text.substring(r.start,r.end));
    // }
    //debug("Strings found: " + strings.length);
    // Update the global stringRanges variable
    stringRanges = strings;
    return strings;
}
function replaceRegexMatchWithUnderscore(text, match) {
    text = text.replace(text.substring(match.start, match.end), "".padEnd(match.end - match.start, "_"));
    return text;
}
//# sourceMappingURL=comments.js.map