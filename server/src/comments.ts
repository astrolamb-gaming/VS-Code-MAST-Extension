import { debug } from 'console';
import { Range, TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import { integer } from 'vscode-languageserver';
interface CRange {
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
export function isInString(loc:integer) : boolean {
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
export function getComments(textDocument: TextDocument) {
	commentRanges = [];
	const text = textDocument.getText();
	let pattern = /\/\*.*?\*\//gs
	// Gets all the block comments
	commentRanges = commentRanges.concat(getMatchesForRegex(pattern,text));
	
	let m: RegExpExecArray | null;

	let strRng:CRange[] = [];
	pattern = /\".*?\"/g;
	strRng = getMatchesForRegex(pattern,text);
	
	pattern = /\#.*?(\"|$)/g;
	while (m = pattern.exec(text)) {
		let comment = m[0];
		//debug(m);
		for (const i in strRng) {
			if (strRng[i].start < m.index && m.index < strRng[i].end) {

			} else {
				const r: CRange = {
					start: m.index,
					end: m.index + m[0].length
				}
				commentRanges.push(r);
			}
		}
	}
	
}

const indents: integer[] = [];
const dedents: integer[] = [];
export function getIndentations(textDocument: TextDocument) {
	let text = textDocument.getText();
	let m: RegExpExecArray | null;
	let pattern = /^[\\t ]*/gm
	while (m = pattern.exec(text)) {
		let comment = m[0];
		debug(comment);
		const r: CRange = {
			start: m.index,
			end: m.index + m[0].length
		}
	}

}

function getMatchesForRegex(pattern: RegExp, text: string) {
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

export function getStrings(textDocument: TextDocument) {
	const text = textDocument.getText();
	let strings: CRange[] = [];
	//let pattern: RegExp = //gm;
	// TODO: Get all sets of {} to see if we're in an f-string and need to exclude sections of the string
	let strDouble = /([\"\'].*?[\"\'])/gm;
	let strDoubleStartOnly = /(^\\s*?(\")[^\"]*?(\\n|$))/gm;
	let multiDouble = /(\^{3,}.*?\^{3,})/gm;
	let caretDouble = /(\"{3,}.*?\"{3,})/gs;
	strings = getMatchesForRegex(strDouble,text);
	//debug(strings);
	stringRanges = strings;
	return strings;
}