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
    // We're just going to handle strings within brackets first, then completely ignore them.
    for (const f of fstrings) {
        (0, console_1.debug)(f);
        (0, console_1.debug)(text.substring(f.start, f.end));
        let strs;
        while (strs = strDouble.exec(text.substring(f.start, f.end))) {
            (0, console_1.debug)(strs);
            stringRanges.push({ start: f.start + strs.index, end: f.start + strs.index + strs[0].length });
        }
        text = replaceRegexMatchWithUnderscore(text, f);
    }
    // These are all good I think. Commented out the concats for testing
    test = getMatchesForRegex(multiDouble, text);
    //stringRanges = stringRanges.concat(test);
    for (const t of test) {
        text = replaceRegexMatchWithUnderscore(text, t);
    }
    test = getMatchesForRegex(caretDouble, text);
    //stringRanges = stringRanges.concat(test);
    for (const t of test) {
        text = replaceRegexMatchWithUnderscore(text, t);
    }
    // Now we have to check for regular strings, including ones within fstrings
    // test = getMatchesForRegex(weighted,text);
    // for (const t of test) {
    // 	let line = text.substring(t.start,t.end);
    // 	debug(line);
    // 	let strs;
    // 	let found = false;
    // 	while (strs = strDouble.exec(line)) {
    // 		stringRanges.push({start: strs.index,end: strs.index + strs[0].length});
    // 		found = true;
    // 		debug("Found");
    // 	}
    // 	if (!found) {
    // 		text = replaceRegexMatchWithUnderscore(text, t);
    // 		stringRanges.push(t);
    // 	}
    // }
    // test = getMatchesForRegex(strDouble,text);
    //stringRanges = stringRanges.concat(test);
    // for (const t of test) {
    // 	text = replaceRegexMatchWithUnderscore(text, t);
    // }
    text = textDocument.getText();
    // Now we check for brackets within the strings
    // And TODO: Check for strings within brackets?
    // for (const s of stringRanges) {
    // 	debug(s);
    // 	const str: string = text.substring(s.start,s.end);
    // 	debug(str);
    // 	fstrings = getMatchesForRegex(brackets,str);
    // 	// If it doesn't contain any brackets, we move on.
    // 	if (fstrings.length === 0) {
    // 		strings.push(s);
    // 		continue;
    // 	}
    // 	// Effectively an else statement:
    // 	let start = s.start;
    // 	for (const f of fstrings) {
    // 		const newRange: CRange = {
    // 			start: start,
    // 			end: f.start
    // 		}
    // 		strings.push(newRange);
    // 		start = f.end+1;
    // 	}
    // 	const finalRange: CRange = {
    // 		start: start,
    // 		end: s.end
    // 	}
    // 	strings.push(finalRange);
    // }
    //debug(strings);
    // for (const r of strings) {
    // 	debug(text.substring(r.start,r.end));
    // }
    //debug("Strings found: " + strings.length);
    // Update the global stringRanges variable
    //stringRanges = strings;
    (0, console_1.debug)("STRINGS");
    (0, console_1.debug)(stringRanges);
    return stringRanges;
}
function replaceRegexMatchWithUnderscore(text, match) {
    text = text.replace(text.substring(match.start, match.end), "".padEnd(match.end - match.start, "_"));
    return text;
}
//# sourceMappingURL=comments.js.map