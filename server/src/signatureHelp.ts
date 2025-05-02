import { SignatureHelpParams, SignatureHelp, integer, SignatureInformation, ParameterInformation } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { debug } from 'console';
import { getCache } from './cache';

export function onSignatureHelp(_textDocPos: SignatureHelpParams, text: TextDocument): SignatureHelp | undefined {
	let sh : SignatureHelp = {
		signatures: []
	}
	//const text = documents.get(_textDocPos.textDocument.uri);
	const t = text?.getText();
	if (text === undefined) {
		debug("Document ref is undefined");
		return sh;
	}
	if (t === undefined) {
		debug("Document text is undefined");
		return sh;
	}
	// Calculate the position in the text's string value using the Position value.
	const pos : integer = text.offsetAt(_textDocPos.position);
	const startOfLine : integer = pos - _textDocPos.position.character;
	const iStr : string = t.substring(startOfLine,pos);

	// Calculate which parameter is the active one
	let m: RegExpExecArray | null;
	let last = iStr.lastIndexOf("(");
	let sub = iStr.substring(last+1, pos).replace(/ /g,"");
	let arr = sub.split(",");
	//debug(arr);
	sh.activeParameter = arr.length - 1;

	// Check for the current function name and get SignatureInformation for that function.

	let f: string = getCurrentMethodName(iStr);
	debug(f);

	let sig = getCache(text.uri).getSignatureOfMethod(f);
	debug(sig);
	if (sig !== undefined) {
		sh.signatures.push(sig);
	}

	// This is just for testing
	let p: ParameterInformation = {
		label: "Parameter 1",
		documentation: "Param 1 Documentation"
	}
	let p2: ParameterInformation = {
		label: "Parameter 2",
		documentation: "Param 2 Documentation"
	}
	let si: SignatureInformation = {
		label: "SignatureInformation",
		documentation: "Documentation",
		parameters: []
	}
	si.parameters?.push(p);
	si.parameters?.push(p2);

	return sh;
}

export function getCurrentMethodName(iStr: string): string {
	const last = iStr.lastIndexOf("(");
	const lastClose = iStr.lastIndexOf(")");
	if (lastClose > last) {

	}
	const priorCheck = iStr.substring(0,last-1);
	let prior = priorCheck.lastIndexOf("(");
	if (prior === -1) {
		prior = priorCheck.lastIndexOf(".");
	}
	if (prior === -1) {
		prior = priorCheck.lastIndexOf(" ");
	}
	if (prior === -1) {
		prior = 0;
	}
	return iStr.substring(prior,last).replace(/\.|\(| |\"|\'/g,"");
}

const test = "testing(a(),function(1,5, 10)";
export function getMethodName(iStr: string): string {
	iStr = test;
	let ret = "";
	let token = "";
	let tokens = [];
	let last = "";
	let level = 0;
	let t: RegExpMatchArray | null;

	while (t = test.match(/\w+\(/)) {
		if (t === null) break;
		if (t.index !== undefined) break;
		// const line = iStr.substring()
	}

	for (const char of iStr) {
		// We can just ignore spaces
		if (char.match(/\w/)) {
			token += char;
			last = "char";
			continue;
		}
		if (char === "(") {
			level += 1;
			last = "functionOpen"
			continue;
		}
		if (char === (")")) {
			level -= 1;
			last = "functionClose"
			continue;
		}
		if (char !== "") {

		}
	}

	return ret;
}