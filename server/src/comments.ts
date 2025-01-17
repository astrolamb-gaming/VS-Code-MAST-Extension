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
export function getComments(textDocument: TextDocument) {
	commentRanges = [];
	const text = textDocument.getText();
	let pattern = /\/\*.*?\*\//gs
	let m: RegExpExecArray | null;
	while (m = pattern.exec(text)) {
		let comment = m[0];
		//debug(comment);
		log(comment);
		
		const r: CRange = {
			start: m.index,
			end: m.index + m[0].length
		}
		commentRanges.push(r);
	}
	pattern = /\#.*?(\"|$)/g;
	while (m = pattern.exec(text)) {
		let comment = m[0];
		if (comment.endsWith("\"")) {
			// TODO: Is this comment within a string?
		}
		log(comment);
		const r: CRange = {
			start: m.index,
			end: m.index + m[0].length
		}
	}
}

function log(str:any) {
	fs.writeFileSync('outputLog.txt', str, {flag: "a+"})
}