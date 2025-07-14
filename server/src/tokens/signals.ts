import { TextDocument } from 'vscode-languageserver-textdocument';

export function parseSignalsInFile(doc: TextDocument) {
	const rx = /signal_emit\([\"'](\w+)[\"']\)|\/\/(shared\/)?signal\/([\w\/]+)/g;
	let m: RegExpExecArray | null;
	let signals: string[] = [];
	while (m = rx.exec(doc.getText())) {
		if (m[1]) {
			signals.push(m[1]);
		}
		if (m[3]) {
			signals.push(m[3]);
		}
	}
	//TODO: Need to evaluate if this is what I should do
	signals = [...new Set(signals)];
	return signals;
}