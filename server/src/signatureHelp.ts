import { debug } from 'console';
import { SignatureHelpParams, SignatureHelp, integer, SignatureInformation, TextDocument, ParameterInformation } from 'vscode-languageserver';
import { getFunctionData } from './server';


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
	// Somehow a +1 to pos helps with things. Makes it not necessary to have a space after the comma following a parameter. But messes up other stuff
	const iStr : string = t.substring(startOfLine,pos);


	// Calculate which parameter is the active one
	let m: RegExpExecArray | null;
	let last = iStr.lastIndexOf("(");
	let sub = iStr.substring(last, iStr.length-1).replace(/ /g,"");
	let arr = sub.split(",");
	sh.activeParameter = arr.length - 1;

	//if (iStr.endsWith("(")) {


	
	let res: string = iStr.substring(0,last);
	debug("RES: ");
	debug(res);
	const lastFunc: RegExp = /\w+?$/g
	//m = func.exec(res);
	//let f = res?.replace(/[\(\)]/g,"");
	//debug("Starting WHile loop");
	const functionData = getFunctionData();
	while (m = lastFunc.exec(res)) {
		const f = m[0];
		debug(f);
		for (const i in functionData) {
			if (functionData[i].label === m[0]) {
				let s2: SignatureInformation ={
					label: functionData[i].label,
					parameters: functionData[i].parameters,
					documentation: functionData[i].documentation,
				}
				sh.signatures.push(s2);
				//debug(m[0]);
				debug(JSON.stringify(functionData[i]));
				break;
			}
		}
	}
	debug(sh);
	// debug("WHile loop done");
	// //sh.signatures.push(si);
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