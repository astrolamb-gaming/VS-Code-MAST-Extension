import { debug } from 'console';
import { integer, Location, Position, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getCache } from '../cache';
import { getComments, getStrings, isInComment, isInString } from './comments';
import { getCurrentLineFromTextDocument } from '../requests/hover';
import { showProgressBar } from '../server';
import { fileFromUri } from '../fileFunctions';

export interface Word {
	/**
	 * The text of the Word
	 */
	name: string,
	/**
	 * The location of the word
	 */
	locations: Location[]
}

const ignore = [
	"if",
	"else",
	"await",
	"not",
	"is",
	"None",
	"yaml",
	"in",
	"True",
	"False",
	"shared",
	"while"
]


export function parseWords(doc: TextDocument): Word[] {
	let ret: Word[] = [];
	const variableRX = /([\w_\/]+)/gm;
	const num = /(\d+)/;
	const text = doc.getText();
	let m: RegExpExecArray | null;
	const strings = getStrings(doc).concat(getComments(doc));
	while (m = variableRX.exec(text)) {
		const v = m[1];
		const start = m[0].indexOf(v) + m.index;
		const end = start + m[0].length;
		if (!isInComment(doc, m.index) || v.match(num)?.[0] !== null) { //!isInString(doc, m.index) || 
			const range: Range = { start: doc.positionAt(start), end: doc.positionAt(end)}
			let found = false;
			for (const w of ret) {
				if (w.name === v) {
					w.locations.push({uri: fileFromUri(doc.uri), range: range});
					found = true;
					break;
				}
			}
			if (!found) {
				let var1: Word = {
					name: v,
					locations: [{
						uri: fileFromUri(doc.uri),
						range: range
					}]
				}
				ret.push(var1);
			}
		}
	}
	// ret = [...new Map(ret.map(v => [v.range, v])).values()];
	// debug(ret);
	return ret;
}

export function getWordRangeAtPosition(doc:TextDocument, _pos:Position): string {
	const wordRE = /([\w_\/]+)/;
	const pos : integer = doc.offsetAt(_pos);
	const startOfLine : integer = pos - _pos.character;
	const endPosition = Position.create(_pos.line + 1, 0);
	const end : integer = doc.offsetAt(endPosition);
	const sub = doc.getText().substring(startOfLine,end-1);
	let m: RegExpExecArray | null;
	let w = "";
	debug("Starting regex exec");
	while (m = wordRE.exec(sub)) {
		w = m[1];
		debug(w);
		if (m.index <= _pos.character && m.index + w.length >= _pos.character) {
			break;
		}
	}
	return w;
}