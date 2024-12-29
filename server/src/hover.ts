import { Hover, MarkupContent, TextDocumentPositionParams } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

export function onHover(_pos: TextDocumentPositionParams, text: TextDocument) : Hover {
	let str: MarkupContent = {
		kind: 'plaintext', // 'markdown' or 'plaintext'
		value: ''
	}
	const hover: Hover = {
		contents: ''
	}
	// const range: Range = {
	// 	start: t.positionAt(m.index),
	// 	end: t.positionAt(m.index + m[0].length)
	// }
	return hover;
}