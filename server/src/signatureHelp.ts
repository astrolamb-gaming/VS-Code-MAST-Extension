import { SignatureHelpParams, SignatureHelp, integer, SignatureInformation, ParameterInformation } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { debug } from 'console';
import { getCache } from './cache';
import { CRange, replaceRegexMatchWithUnderscore } from './tokens/comments';
import { getHoveredSymbol } from './hover';

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
	const func = getCurrentMethodName(iStr);
	if (func === "") return;
	const fstart = iStr.lastIndexOf(func);
	let wholeFunc = iStr.substring(fstart,iStr.length);
	let obj = /{.*?(}|$)/gm;
	wholeFunc = wholeFunc.replace(obj, "_")
	const arr = wholeFunc.split(",");
	sh.activeParameter = arr.length - 1;

	// Check for the current function name and get SignatureInformation for that function.
	let sig = getCache(text.uri).getSignatureOfMethod(func);
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

/**
 * Given a string, this function will return the name of the function which is having parameters added to it.
 * @param iStr The string
 * @returns A string representing the name of the function.
 */
export function getCurrentMethodName(iStr: string): string {
	let t: RegExpMatchArray | null;
	t = iStr.match(/\w+\(([^\(\)])*\)/g);
	while (t) {
		let s = iStr.indexOf(t[0])
		let r: CRange = {
			start: s,
			end: t[0].length + s
		}
		iStr = replaceRegexMatchWithUnderscore(iStr,r);
		t = iStr.match(/\w+\(([^\(\)])*\)/g);
	}
	let last = iStr.lastIndexOf("(");
	let symbol = getHoveredSymbol(iStr,last);
	// debug(symbol);
	return symbol;
}