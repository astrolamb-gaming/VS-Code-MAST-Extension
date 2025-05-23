import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import { integer } from 'vscode-languageserver';
import exp = require('constants');
import { fixFileName } from '../fileFunctions';
import { debug } from 'console';


/**
 * TODO:
 * 		Fix comment and string checking for hover
 * 		When switching to another tab, the cache doesn't update
 */

const commentCache: Map<string,CRange[]> = new Map();
/**
 * Get all comments within the specified {@link TextDocument TextDocument}.
 * @param doc The {@link TextDocument TextDocument}
 * @returns An array of {@link CRange CRange}
 */
export function getComments(doc: TextDocument): CRange[] {
	// for (const f of commentCache.keys()) {
	// 	debug(f);
	// }
	let comments = commentCache.get(fixFileName(doc.uri));
	if (comments === undefined) {
		comments = parseComments(doc);
	}
	return comments;
}
const stringCache: Map<string,CRange[]> = new Map();
/**
 * Get all strings within the specified {@link TextDocument TextDocument}.
 * @param doc The {@link TextDocument TextDocument}
 * @returns An array of {@link CRange CRange}
 */
export function getStrings(doc: TextDocument): CRange[] {
	let strings = stringCache.get(fixFileName(doc.uri));
	if (strings === undefined) {
		strings = parseStrings(doc);
	}
	return strings;
}
const yamlCache: Map<string,CRange[]> = new Map();
/**
 * Get all metadata within the specified {@link TextDocument TextDocument}.
 * @param doc The {@link TextDocument TextDocument}
 * @returns An array of {@link CRange CRange}
 */
export function getYamls(doc: TextDocument): CRange[] {
	let yamls = yamlCache.get(fixFileName(doc.uri));
	if (yamls === undefined) {
		yamls = parseYamls(doc);
	}
	return yamls;
}
const squareBracketCache: Map<string,CRange[]> = new Map();
/**
 * Get all square brackets within the specified {@link TextDocument TextDocument}.
 * @param doc The {@link TextDocument TextDocument}
 * @returns An array of {@link CRange CRange}
 */
export function getSquareBrackets(doc: TextDocument): CRange[] {
	let sqbs = squareBracketCache.get(fixFileName(doc.uri));
	if (sqbs === undefined) {
		sqbs = parseSquareBrackets(doc);
	}
	return sqbs;
}

export interface CRange {
	start: integer,
	end: integer
}
export function isInComment(doc: TextDocument, loc:integer):boolean {
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
let squareBracketRanges: CRange[] = [];

/**
 * Parses a {@link TextDocument TextDocument} for all square brackets [...] within it.
 * Saves the information in a Map. Use {@link getComments getComments} to retrieve saved info.
 * @param textDocument The {@link TextDocument TextDocument} to parse
 * @returns An array of {@link CRange CRange}
 */
export function parseSquareBrackets(textDocument: TextDocument) {
	const pattern = /\[.*?\]/g;
	const brackets: CRange[] = [];
	let m: RegExpExecArray | null;
	const text = textDocument.getText();
	while (m = pattern.exec(text)) {
		const r: CRange = {
			start: m.index,
			end: m.index + m[0].length + 1
		}
		brackets.push(r);
	}
	squareBracketRanges = brackets;
	return squareBracketRanges;
}

export function isInSquareBrackets(loc:integer): boolean {
	for (const r of squareBracketRanges) {
		if (r.start <= loc && r.end >= loc) {
			return true;
		}
	}
	return false;
}

export function isInString(doc: TextDocument, loc:integer) : boolean {
	let stringRanges = getStrings(doc);
	for (const r in stringRanges) {
		if (stringRanges[r].start <= loc && stringRanges[r].end >= loc) {
			return true;
		}
	}
	return false;
}

export function isInYaml(doc: TextDocument, loc:integer): boolean {
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
export function parseComments(textDocument: TextDocument): CRange[] {
	let text = textDocument.getText();
	let strRng:CRange[] = [];
	strRng = getStrings(textDocument);
	let commentRanges: CRange[] = [];
	let comment = /^[ \t]*(#.*)($|\n)/gm;
	let comments = getMatchesForRegex(comment,text);
	commentRanges = commentRanges.concat(comments);
	for (const f of comments){
		text = replaceRegexMatchWithUnderscore(text,f);
	}
	
	let pattern = /\/\*.*?\*\//gs
	// Gets all the block comments
	let blocks = getMatchesForRegex(pattern,text);
	commentRanges = commentRanges.concat(blocks);
	for (const f of blocks) {
		text = replaceRegexMatchWithUnderscore(text,f);
	}

	let m: RegExpExecArray | null;

	// strRng = stringRanges;//getMatchesForRegex(pattern,text);
	
	//pattern = /\#.*?(\"|$)/gm;
	pattern = /#+[^#\n\r\f]*/g;

	// Not using the more complicated version because there could be an accidental error in the color code.
	//const color: RegExp = /#((([0-9a-fA-F]){6}(([0-9a-fA-F]){2})?)|([0-9a-fA-F]){3,4})(?!\w)/g;
	const color: RegExp = /([^#]|^)#[0-9a-fA-F]{3,8}(?!\w)/gm;

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
		if (!isInString(textDocument,m.index) && !isInSquareBrackets(m.index)) {
			const r: CRange = {
				start: m.index,
				end: m.index + m[0].length + 1
			}
			commentRanges.push(r);
		} else {
			// Do nothing, with new regex of #+...\#\n it will go to next # in line anyways, if it exists
		}
	}
	commentCache.set(fixFileName(textDocument.uri), commentRanges);
	return commentRanges;
}

/**
 * Parses a {@link TextDocument TextDocument} for all metadata within it.
 * Saves the information in a Map. Use {@link getYamls getYamls} to retrieve saved info.
 * @param textDocument The {@link TextDocument TextDocument} to parse
 * @returns An array of {@link CRange CRange}
 */
export function parseYamls(textDocument: TextDocument) {
	const text = textDocument.getText();
	let yamls: CRange[] = [];
	let yaml = /```[ \t]*.*?[ \t]*?```/gms;
	yamls = getMatchesForRegex(yaml,text);
	yamlCache.set(fixFileName(textDocument.uri),yamls);
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
	fs.writeFileSync('MAST_VSCode_OutputLog.txt', str, {flag: "a+"})
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

/**
 * Parses a {@link TextDocument TextDocument} for all strings within it.
 * Saves the information in a Map. Use {@link getStrings getStrings} to retrieve saved info.
 * @param textDocument The {@link TextDocument TextDocument} to parse
 * @returns An array of {@link CRange CRange}
 */
export function parseStrings(textDocument: TextDocument) {
	let text = textDocument.getText();
	let strings: CRange[] = [];
	// TODO: Get all sets of {} to see if we're in an f-string and need to exclude sections of the string
	let strDouble = /(f?\".*?\")|('.*?')/gm;
	// let strDoubleStartOnly = /(^\\s*?(\")[^\"]*?(\\n|$))/gm;
	let caretDouble = /(\^{3,}.*?\^{3,})/gs;
	let multiDouble = /([\"\']{3,}.*?[\"\']{3,})/gs;
	let weighted = /(?:^[ \t]*)(\%\d*|\"[^\"])([^\n\r\f]*)/gms;

	let comment = /^\s*#.*($|\n)/gm;
	let comments = getMatchesForRegex(comment,text);
	for (const f of comments){
		text = replaceRegexMatchWithUnderscore(text,f);
	}


	let brackets = /{.*?}/gm;
	let fstrings = getMatchesForRegex(brackets,text);// f-strings
	let test: CRange[] = [];
	let localStringRanges: CRange[] = [];

	const fstringsOnly: CRange[] = [];

	// We're just going to handle strings within brackets first, then completely ignore everything within brackets.
	for (const f of fstrings) {
		let strs;
		while (strs = strDouble.exec(text.substring(f.start,f.end))) {
			fstringsOnly.push({start:f.start + strs.index,end:f.start + strs.index + strs[0].length});
		}
		text = replaceRegexMatchWithUnderscore(text, f);
	}

// These are all good I think. Commented out the concats for testing
	test = getMatchesForRegex(weighted,text);
	localStringRanges = localStringRanges.concat(test);
	for (const t of test) {
		text = replaceRegexMatchWithUnderscore(text, t);
	}

	test = getMatchesForRegex(multiDouble,text);
	localStringRanges = localStringRanges.concat(test);
	for (const t of test) {
		text = replaceRegexMatchWithUnderscore(text, t);
	}
	test = getMatchesForRegex(caretDouble,text);
	localStringRanges = localStringRanges.concat(test);
	for (const t of test) {
		text = replaceRegexMatchWithUnderscore(text, t);
	}
	
	test = getMatchesForRegex(strDouble,text);
	localStringRanges = localStringRanges.concat(test);
	// Probably don't need this.
	// for (const t of test) {
	// 	text = replaceRegexMatchWithUnderscore(text, t);
	// }

	text = textDocument.getText();
	
	// Now we check for brackets within the strings
	// And TODO: Check for strings within brackets? Did this at the beginning for simplicity
	for (const s of localStringRanges) {
		const str: string = text.substring(s.start,s.end);

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
				const newRange: CRange = {
					start: start,
					end: f.start
				}
				strings.push(newRange);
				start = f.end;
			}
			
			
		}
		const finalRange: CRange = {
			start: start,
			end: s.end
		}
		strings.push(finalRange);
	}

	// Update the global stringRanges variable
	strings = strings.concat(fstringsOnly);
	// stringRanges = strings;
	stringCache.set(fixFileName(textDocument.uri),strings);
	return strings;
}

/**
 * Really just a helper function that gets rid of sections of code that have already been parsed
 * @param text 
 * @param match 
 * @returns 
 */
export function replaceRegexMatchWithUnderscore(text: string, match: CRange) {
	text = text.replace(text.substring(match.start,match.end),"".padEnd(match.end - match.start,"_"));
	return text;
}