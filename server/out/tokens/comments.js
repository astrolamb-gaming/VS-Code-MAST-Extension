"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getComments = getComments;
exports.getStrings = getStrings;
exports.getYamls = getYamls;
exports.getSquareBrackets = getSquareBrackets;
exports.isInComment = isInComment;
exports.parseSquareBrackets = parseSquareBrackets;
exports.isInSquareBrackets = isInSquareBrackets;
exports.isInString = isInString;
exports.isInYaml = isInYaml;
exports.parseComments = parseComments;
exports.parseYamls = parseYamls;
exports.getIndentations = getIndentations;
exports.getMatchesForRegex = getMatchesForRegex;
exports.getBrackets = getBrackets;
exports.isTextInBracket = isTextInBracket;
exports.parseStrings = parseStrings;
exports.replaceRegexMatchWithUnderscore = replaceRegexMatchWithUnderscore;
const fs = require("fs");
const fileFunctions_1 = require("../fileFunctions");
const console_1 = require("console");
/**
 * TODO:
 * 		Fix comment and string checking for hover
 * 		When switching to another tab, the cache doesn't update
 */
const commentCache = new Map();
/**
 * Get all comments within the specified {@link TextDocument TextDocument}.
 * @param doc The {@link TextDocument TextDocument}
 * @returns An array of {@link CRange CRange}
 */
function getComments(doc) {
    for (const f of commentCache.keys()) {
        (0, console_1.debug)(f);
    }
    let comments = commentCache.get((0, fileFunctions_1.fixFileName)(doc.uri));
    if (comments === undefined) {
        comments = parseComments(doc);
    }
    return comments;
}
const stringCache = new Map();
/**
 * Get all strings within the specified {@link TextDocument TextDocument}.
 * @param doc The {@link TextDocument TextDocument}
 * @returns An array of {@link CRange CRange}
 */
function getStrings(doc) {
    let strings = stringCache.get((0, fileFunctions_1.fixFileName)(doc.uri));
    if (strings === undefined) {
        strings = parseStrings(doc);
    }
    return strings;
}
const yamlCache = new Map();
/**
 * Get all metadata within the specified {@link TextDocument TextDocument}.
 * @param doc The {@link TextDocument TextDocument}
 * @returns An array of {@link CRange CRange}
 */
function getYamls(doc) {
    let yamls = yamlCache.get((0, fileFunctions_1.fixFileName)(doc.uri));
    if (yamls === undefined) {
        yamls = parseYamls(doc);
    }
    return yamls;
}
const squareBracketCache = new Map();
/**
 * Get all square brackets within the specified {@link TextDocument TextDocument}.
 * @param doc The {@link TextDocument TextDocument}
 * @returns An array of {@link CRange CRange}
 */
function getSquareBrackets(doc) {
    let sqbs = squareBracketCache.get((0, fileFunctions_1.fixFileName)(doc.uri));
    if (sqbs === undefined) {
        sqbs = parseSquareBrackets(doc);
    }
    return sqbs;
}
function isInComment(doc, loc) {
    let commentRanges = getComments(doc);
    for (const r in commentRanges) {
        if (commentRanges[r].start <= loc && commentRanges[r].end >= loc) {
            return true;
        }
    }
    return false;
}
// let commentRanges:CRange[] = [];
// let stringRanges: CRange[] = [];
// let yamlRanges: CRange[] = [];
let squareBracketRanges = [];
/**
 * Parses a {@link TextDocument TextDocument} for all square brackets [...] within it.
 * Saves the information in a Map. Use {@link getComments getComments} to retrieve saved info.
 * @param textDocument The {@link TextDocument TextDocument} to parse
 * @returns An array of {@link CRange CRange}
 */
function parseSquareBrackets(textDocument) {
    const pattern = /\[.*?\]/g;
    const brackets = [];
    let m;
    const text = textDocument.getText();
    while (m = pattern.exec(text)) {
        const r = {
            start: m.index,
            end: m.index + m[0].length + 1
        };
        brackets.push(r);
    }
    squareBracketRanges = brackets;
    return squareBracketRanges;
}
function isInSquareBrackets(loc) {
    for (const r of squareBracketRanges) {
        if (r.start <= loc && r.end >= loc) {
            return true;
        }
    }
    return false;
}
function isInString(doc, loc) {
    let stringRanges = getStrings(doc);
    for (const r in stringRanges) {
        if (stringRanges[r].start <= loc && stringRanges[r].end >= loc) {
            return true;
        }
    }
    return false;
}
function isInYaml(doc, loc) {
    let yamlRanges = getYamls(doc);
    for (const r in yamlRanges) {
        if (yamlRanges[r].start <= loc && yamlRanges[r].end >= loc) {
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
/**
 * Parses a {@link TextDocument TextDocument} for all comments within it.
 * Saves the information in a Map. Use {@link getComments getComments} to retrieve saved info.
 * @param textDocument The {@link TextDocument TextDocument} to parse
 * @returns An array of {@link CRange CRange}
 */
function parseComments(textDocument) {
    let text = textDocument.getText();
    let strRng = [];
    strRng = getStrings(textDocument);
    let commentRanges = [];
    let comment = /^[ \t]*(#.*)($|\n)/gm;
    let comments = getMatchesForRegex(comment, text);
    commentRanges = commentRanges.concat(comments);
    for (const f of comments) {
        text = replaceRegexMatchWithUnderscore(text, f);
    }
    let pattern = /\/\*.*?\*\//gs;
    // Gets all the block comments
    let blocks = getMatchesForRegex(pattern, text);
    commentRanges = commentRanges.concat(blocks);
    for (const f of blocks) {
        text = replaceRegexMatchWithUnderscore(text, f);
    }
    let m;
    // strRng = stringRanges;//getMatchesForRegex(pattern,text);
    //pattern = /\#.*?(\"|$)/gm;
    pattern = /#+[^#\n\r\f]*/g;
    // Not using the more complicated version because there could be an accidental error in the color code.
    //const color: RegExp = /#((([0-9a-fA-F]){6}(([0-9a-fA-F]){2})?)|([0-9a-fA-F]){3,4})(?!\w)/g;
    const color = /([^#]|^)#[0-9a-fA-F]{3,8}(?!\w)/gm;
    // We have to account for any # symbol that is used in a string, e.g. the 'invisble' operator
    while (m = pattern.exec(text)) {
        let comment = m[0];
        if (comment.match(color) !== null) {
            //debug("Skipping: " + comment);
            continue;
        } //else { debug("Not skipping " + comment)}
        let inString = false;
        // Now we iterate of strRange, which is all the strings in the file.
        // We're checking to make sure that the start index of the presumed comment is not 
        // within a string. If so, it's not a real comment.
        // E.g. spawn_asteroid("whatever", "asteroid,#", "whatever") has a # inside of a set
        // of double quotes, so it doesn't actually indicate a comment start.
        if (!isInString(textDocument, m.index) && !isInSquareBrackets(m.index)) {
            const r = {
                start: m.index,
                end: m.index + m[0].length + 1
            };
            commentRanges.push(r);
        }
        else {
            // Do nothing, with new regex of #+...\#\n it will go to next # in line anyways, if it exists
        }
    }
    commentCache.set((0, fileFunctions_1.fixFileName)(textDocument.uri), commentRanges);
    return commentRanges;
}
/**
 * Parses a {@link TextDocument TextDocument} for all metadata within it.
 * Saves the information in a Map. Use {@link getYamls getYamls} to retrieve saved info.
 * @param textDocument The {@link TextDocument TextDocument} to parse
 * @returns An array of {@link CRange CRange}
 */
function parseYamls(textDocument) {
    const text = textDocument.getText();
    let yamls = [];
    let yaml = /```[ \t]*.*?[ \t]*?```/gms;
    yamls = getMatchesForRegex(yaml, text);
    yamlCache.set((0, fileFunctions_1.fixFileName)(textDocument.uri), yamls);
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
    fs.writeFileSync('MAST_VSCode_OutputLog.txt', str, { flag: "a+" });
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
/**
 * Parses a {@link TextDocument TextDocument} for all strings within it.
 * Saves the information in a Map. Use {@link getStrings getStrings} to retrieve saved info.
 * @param textDocument The {@link TextDocument TextDocument} to parse
 * @returns An array of {@link CRange CRange}
 */
function parseStrings(textDocument) {
    let text = textDocument.getText();
    let strings = [];
    // TODO: Get all sets of {} to see if we're in an f-string and need to exclude sections of the string
    let strDouble = /(f?\".*?\")|('.*?')/gm;
    // let strDoubleStartOnly = /(^\\s*?(\")[^\"]*?(\\n|$))/gm;
    let caretDouble = /(\^{3,}.*?\^{3,})/gs;
    let multiDouble = /([\"\']{3,}.*?[\"\']{3,})/gs;
    let weighted = /(\%\d*|\")([^\n\r\f]*)/gs;
    let comment = /^\s*#.*($|\n)/gm;
    let comments = getMatchesForRegex(comment, text);
    for (const f of comments) {
        text = replaceRegexMatchWithUnderscore(text, f);
    }
    let brackets = /{.*?}/gm;
    let fstrings = getMatchesForRegex(brackets, text); // f-strings
    let test = [];
    let localStringRanges = [];
    const fstringsOnly = [];
    // We're just going to handle strings within brackets first, then completely ignore everything within brackets.
    for (const f of fstrings) {
        let strs;
        while (strs = strDouble.exec(text.substring(f.start, f.end))) {
            fstringsOnly.push({ start: f.start + strs.index, end: f.start + strs.index + strs[0].length });
        }
        text = replaceRegexMatchWithUnderscore(text, f);
    }
    // These are all good I think. Commented out the concats for testing
    test = getMatchesForRegex(multiDouble, text);
    localStringRanges = localStringRanges.concat(test);
    for (const t of test) {
        text = replaceRegexMatchWithUnderscore(text, t);
    }
    test = getMatchesForRegex(caretDouble, text);
    localStringRanges = localStringRanges.concat(test);
    for (const t of test) {
        text = replaceRegexMatchWithUnderscore(text, t);
    }
    test = getMatchesForRegex(strDouble, text);
    localStringRanges = localStringRanges.concat(test);
    for (const t of test) {
        text = replaceRegexMatchWithUnderscore(text, t);
    }
    test = getMatchesForRegex(weighted, text);
    for (const t of test) {
        let found = false;
        for (const s of localStringRanges) {
            if (s.start > t.start && t.end > s.end) {
                found = true;
                break;
            }
        }
        if (!found) {
            localStringRanges.push(t);
        }
        //text = replaceRegexMatchWithUnderscore(text, t);
    }
    text = textDocument.getText();
    // Now we check for brackets within the strings
    // And TODO: Check for strings within brackets? Did this at the beginning for simplicity
    for (const s of localStringRanges) {
        const str = text.substring(s.start, s.end);
        // If it doesn't contain any brackets, we move on.
        if (fstrings.length === 0) {
            strings.push(s);
            continue;
        }
        // Effectively an else statement:
        //debug(fstrings)
        let start = s.start;
        for (const f of fstrings) {
            // Check if the brackets are inside the string.
            if (f.start > s.start && f.end < s.end) {
                const newRange = {
                    start: start,
                    end: f.start
                };
                strings.push(newRange);
                start = f.end;
            }
        }
        const finalRange = {
            start: start,
            end: s.end
        };
        strings.push(finalRange);
    }
    // Update the global stringRanges variable
    strings = strings.concat(fstringsOnly);
    // stringRanges = strings;
    stringCache.set((0, fileFunctions_1.fixFileName)(textDocument.uri), strings);
    return strings;
}
/**
 * Really just a helper function that gets rid of sections of code that have already been parsed
 * @param text
 * @param match
 * @returns
 */
function replaceRegexMatchWithUnderscore(text, match) {
    text = text.replace(text.substring(match.start, match.end), "".padEnd(match.end - match.start, "_"));
    return text;
}
//# sourceMappingURL=comments.js.map