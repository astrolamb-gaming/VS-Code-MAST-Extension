import { debug } from 'console';
import { Range, TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import { integer } from 'vscode-languageserver';
export interface CRange {
	start: integer,
	end: integer
}
export function isInComment(loc:integer):boolean {
	for (const r in commentRanges) {
		if (commentRanges[r].start < loc && commentRanges[r].end > loc) {
			return true;
		}
	}
	return false;
}
let commentRanges:CRange[] = [];
let stringRanges: CRange[] = [];
let yamlRanges: CRange[] = [];
export function isInString(loc:integer) : boolean {
	for (const r in stringRanges) {
		if (stringRanges[r].start < loc && stringRanges[r].end > loc) {
			return true;
		}
	}
	return false;
}

export function isInYaml(loc:integer): boolean {
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
export function getComments(textDocument: TextDocument) {
	getStrings(textDocument);
	commentRanges = [];
	const text = textDocument.getText();
	let pattern = /\/\*.*?\*\//gs
	// Gets all the block comments
	commentRanges = commentRanges.concat(getMatchesForRegex(pattern,text));
	
	let m: RegExpExecArray | null;

	let strRng:CRange[] = [];
	pattern = /\".*?\"/g;
	strRng = stringRanges;//getMatchesForRegex(pattern,text);
	
	pattern = /\#.*?(\"|$)/gm;
	const color: RegExp = /#([0-9a-fA-F]{3}){1,2}[\:\,\"\' ]/g;
	while (m = pattern.exec(text)) {
		let comment = m[0];
		if (comment.match(color) !== null) {
			debug("Skipping: " + comment);
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
			const r: CRange = {
				start: m.index,
				end: m.index + m[0].length + 1
			}
			commentRanges.push(r);
		}
	}
	return commentRanges;
}

export function getYamls(textDocument: TextDocument) {
	const text = textDocument.getText();
	let yamls: CRange[] = [];
	let yaml = /```[ \t]*.*?[ \t]*?```/gms;
	yamls = getMatchesForRegex(yaml,text);
	
	//debug(strings);
	//stringRanges = yamls;
	//debug("Strings found: " + strings.length);
	return yamls;
}

const indents: integer[] = [];
const dedents: integer[] = [];
/**
 * TODO: Finish this function
 * @param textDocument 
 */
export function getIndentations(textDocument: TextDocument) {
	let text = textDocument.getText();
	let m: RegExpExecArray | null;
	let pattern = /^[\\t ]*/gm
	while (m = pattern.exec(text)) {
		let comment = m[0];
		const r: CRange = {
			start: m.index,
			end: m.index + m[0].length
		}
	}

}

export function getMatchesForRegex(pattern: RegExp, text: string) {
	let matches: CRange[] = [];
	let m: RegExpExecArray | null;
	while (m = pattern.exec(text)) {
		let comment = m[0];
		//debug(comment);
		const r: CRange = {
			start: m.index,
			end: m.index + m[0].length
		}
		matches.push(r);
	}
	return matches;
}

function log(str:any) {
	fs.writeFileSync('outputLog.txt', str, {flag: "a+"})
}

/**
 * This function may be completely unnecessary
 */
export function getBrackets(textDocument: TextDocument) {
	const text = textDocument.getText();
	let brackets: CRange[] = [];
	let pattern = /{.*?}/g;
	brackets = getMatchesForRegex(pattern,text);
	return brackets;
}

export function isTextInBracket(text:string, pos: integer) {
	let brackets: CRange[] = [];
	let pattern = /{.*?}/g;
	brackets = getMatchesForRegex(pattern,text);
	for (const b of brackets) {
		if (b.start<pos && b.end > pos) {
			return true;
		}
	}
	return false;
}

export function getStrings(textDocument: TextDocument) {
	let text = textDocument.getText();
	let strings: CRange[] = [];
	//let pattern: RegExp = //gm;
	// TODO: Get all sets of {} to see if we're in an f-string and need to exclude sections of the string
	let strDouble = /(\".*?\")|('.*?')/gm;
	// let strDoubleStartOnly = /(^\\s*?(\")[^\"]*?(\\n|$))/gm;
	let caretDouble = /(\^{3,}.*?\^{3,})/gm;
	let multiDouble = /(\"{3,}.*?\"{3,})|('{3,}.*?'{3,})/gs;
	let weighted = /(\%\d*|\")([^\n\r\f]*)/gs

	// TODO: Use a single regex if possible
	// e.g.
	// Problem is that some need the /s flag while some cannot have it
	let all = /(\"{3,}.*?\"{3,})|('{3,}.*?'{3,})|(\".*?\")|('.*?')|(\%\d*|\")([^\n\r\f]*)/gm;





	let brackets = /{.*?}/gm;
	let fstrings = getMatchesForRegex(brackets,text);// f-strings
	let test: CRange[] = [];
	let stringRanges: CRange[] = [];

	// We're just going to handle strings within brackets first, then completely ignore them.
	for (const f of fstrings) {
		debug(f);
		debug(text.substring(f.start,f.end))
		let strs;
		while (strs = strDouble.exec(text.substring(f.start,f.end))) {
			debug(strs);
			stringRanges.push({start:f.start + strs.index,end:f.start + strs.index + strs[0].length});
		}
		text = replaceRegexMatchWithUnderscore(text, f);
	}

// These are all good I think. Commented out the concats for testing
	test = getMatchesForRegex(multiDouble,text);
	//stringRanges = stringRanges.concat(test);
	for (const t of test) {
		text = replaceRegexMatchWithUnderscore(text, t);
	}
	test = getMatchesForRegex(caretDouble,text);
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


	debug("STRINGS");
	debug(stringRanges);
	return stringRanges;
}

function replaceRegexMatchWithUnderscore(text: string, match: CRange) {
	text = text.replace(text.substring(match.start,match.end),"".padEnd(match.end - match.start,"_"));
	return text;
}