import { myDebug } from './server';
import { SignatureHelpParams, SignatureHelp, integer, SignatureInformation, ParameterInformation } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { PyFile } from './data';
import { debug } from 'console';
import { getCache } from './cache';

let functionSigs: SignatureInformation[] = [];

// With new system, this function will be depracated
export function prepSignatures(files: PyFile[]) {
	debug("Prepping signatures");
	for (const i in files) {
		const pyFile = files[i];
		for (const f in pyFile.defaultFunctions) {
			const func = pyFile.defaultFunctions[f];
			let si:SignatureInformation = func.buildSignatureInformation();
			functionSigs.push(si);
		}
		for (const c in pyFile.classes) {
			functionSigs = functionSigs.concat(pyFile.classes[c].methodSignatureInformation);
		}
	}
}

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
	let sigs = getCache(text.uri).getMethodSignatures(f);
	for (const sig of sigs) {
		if (sig.label === f) {
			sh.signatures.push(sig);
		}
	}
	// for (const i in functionSigs) {
	// 	if (functionSigs[i].label === f) {
	// 		sh.signatures.push(functionSigs[i]);
	// 	}
	// }

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
	//sh.signatures.push(si);



	return sh;
	// debug(JSON.stringify(sh));
}

export function getCurrentMethodName(iStr: string): string {
	const last = iStr.lastIndexOf("(");
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
	return iStr.substring(prior,last).replace(/\.|\(| /g,"");
}