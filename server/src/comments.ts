import { debug } from 'console';
import { TextDocument } from 'vscode-languageserver-textdocument';


export function getComments(textDocument: TextDocument) {
	const text = textDocument.getText();
	const pattern = /\/\*.*\*\//gs
	let m: RegExpExecArray | null;
	while (m = pattern.exec(text)) {
		let comment = m[0];
		//debug(comment);
	}
}