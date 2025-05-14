import { Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

export interface Word {
	/**
	 * The text of the Word
	 */
	name: string,
	/**\
	 * An {@link Range Range} describing where the word is located
	 */
	range: Range,
	/**
	 * The uri of document the word is located in
	 */
	doc: string
}

export function parseWords(doc: TextDocument): Word[] {
	let ret: Word[] = [];
	const variableRX = /([\w_\/]+)/gm;
	const text = doc.getText();
	let m: RegExpExecArray | null;
	while (m = variableRX.exec(text)) {
		const v = m[1];
		const start = m[0].indexOf(v) + m.index;
		const end = start + m[0].length;
		const range: Range = { start: doc.positionAt(start), end: doc.positionAt(end)}
		let var1: Word = {
			name: v,
			range: range,
			doc: ''
		}
		ret.push(var1);
	}
	ret = [...new Map(ret.map(v => [v.range, v])).values()];
	return ret;
}
