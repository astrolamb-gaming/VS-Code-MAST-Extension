import { SignatureHelpParams, SignatureHelp, integer, SignatureInformation, ParameterInformation } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { debug } from 'console';
import { getCache } from './cache';
import { CRange, replaceRegexMatchWithUnderscore } from './tokens/comments';
import { getCurrentLineFromTextDocument, getHoveredSymbol } from './hover';
import { isClassMethod } from './tokens/tokens';

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
	const line = getCurrentLineFromTextDocument(_textDocPos.position,text);
	// Calculate which parameter is the active one
	const func = getCurrentMethodName(iStr);
	debug(func)
	if (func === "") return;
	const fstart = iStr.lastIndexOf(func);
	
	let wholeFunc = iStr.substring(fstart,iStr.length);
	let obj = /{.*?(}|$)/gm;
	// Here we get rid of some things that could cause parsing issues.
	// We replace fstrings and nested functions with _, and anythnig within quotes to just empty quotes.
	// This eliminates commas that mess with the current parameter, as well as functions etc in fstrings
	wholeFunc = wholeFunc.replace(obj, "_").replace(/\".*?\"/,'""');
	const arr = wholeFunc.split(",");
	sh.activeParameter = arr.length - 1;
	let isClassMethodRes = isClassMethod(line, fstart);

	// Check for the current function name and get SignatureInformation for that function.
	let sig = getCache(text.uri).getSignatureOfMethod(func,isClassMethodRes);
	// debug(sig)
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