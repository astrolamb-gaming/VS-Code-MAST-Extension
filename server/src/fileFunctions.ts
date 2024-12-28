import * as path from 'path';
import * as fs from 'fs';
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	DocumentDiagnosticReportKind,
	type DocumentDiagnosticReport,
	integer,
	SignatureInformation,
	ParameterInformation,
	CompletionItemLabelDetails
} from 'vscode-languageserver/node';
import { appendFunctionData } from './server';
import { checkServerIdentity } from 'tls';
import { debug } from 'console';

export function getRootFolder() : string | null{
	// let initialDir = "./";
	// let dir = findSubfolderByName(initialDir,"__lib__");
	// if (dir === null) {
	
	// Need to be sure we're capturing the right folder - we don't know if the user
	// is using the root Artemis folder or the missions folder, or anything in between.
		let initialDir = "../../../../";
		let dir = findSubfolderByName(initialDir, "data");
		debug(dir + "\n");
		if (dir !== null) {
			dir =findSubfolderByName(dir, "missions");
			if (dir !== null) {
				dir = findSubfolderByName(dir, "__lib__");
				if (dir !== null) {
					//dir = dir.replace(/\.\.\\/g,"");
					return dir;
				}
			}
		}
		return null;
}

export function findSubfolderByName(dir: string, folderName: string): string | null {
	const files = fs.readdirSync(dir, { withFileTypes: true });
  
	for (const file of files) {
	  if (file.isDirectory()) {
		if (file.name === folderName) {
		  return path.join(dir, file.name);
		} else {
		  const subfolderPath = findSubfolderByName(path.join(dir, file.name), folderName);
		  if (subfolderPath) {
			return subfolderPath;
		  }
		}
	  }
	}
  
	return null;
}



export function getFolders(dir: string) : string[] {
	const entries = fs.readdirSync(dir, {withFileTypes: true});
	return entries.filter(entry=>entry.isDirectory()).map(entry=>entry.name);
}




/**
 * Parses a section of code. Can't handle mixing classes with normal functions, so you need to parse each class separately.
 * @param text string to parse
 * @returns List of CompletionItems
 */
export function parseTyping(text: string, className: string = "") : CompletionItem[] {
	let m: RegExpExecArray | null;

	const typings : CompletionItem[] = [];

	let testStr = 'def add_client_tag() -> None:\n    """stub; does nothing yet."""';

	let wholeFunction : RegExp = /((@property|\.setter)?([\n\t\r ]*?)(def)(.+?)([\.]{3,3}|((\"){3,3}(.*?)(\"){3,3})))/gms;

	let functionName : RegExp = /((def\s)(.+?)\()/gm; // Look for "def functionName(" to parse function names.
	//let className : RegExp = /class (.+?):/gm; // Look for "class ClassName:" to parse class names.
	let functionParam : RegExp = /\((.*?)\)/m; // Find parameters of function, if any.
	let returnValue : RegExp = /->(.+?):/gm; // Get the return value (None, boolean, int, etc)
	let comment : RegExp = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/gm;
	let isProperty : RegExp = /(@property)/;
	let isSetter : RegExp = /\.setter/;

	while ((m = wholeFunction.exec(text))) {
		// if (m[0] === testStr) {
		// 	debug("Strings idential");
		// }

		let name = getRegExMatch(m[0], functionName).replace("def ","").replace("(","");
		let params = getRegExMatch(m[0], functionParam).replace("(","").replace(")","");
		let retVal = getRegExMatch(m[0], returnValue).replace(/(:|->)/g, "").trim();
		let comments = getRegExMatch(m[0], comment).replace("\"\"\"","").replace("\"\"\"","");
		let cik: CompletionItemKind = CompletionItemKind.Method;
		let cikStr: string = "function";
		if (isProperty.test(m[0])) {
			cik = CompletionItemKind.Property;
			cikStr = "property";
		}
		if (name === "__init__") {
			cik = CompletionItemKind.Constructor;
			cikStr = "constructor";
		}

		let labelDetails: CompletionItemLabelDetails = {
			// Decided that this clutters up the UI too much. Same information is displayed in the CompletionItem details.
			//detail: "(" + params + ")",
			description: retVal
		}
		let ci_details: string = "(" + cikStr + ") " + ((className === "") ? "" : className + ".") + name + "(" + params + "): " + retVal;
		let ci : CompletionItem = {
			label: name,
			kind: cik,
			command: { command: 'editor.action.triggerSuggest', title: 'Re-trigger completions...' },
			documentation: comments,
			detail: ci_details,
			labelDetails: labelDetails
		}
		
		typings.push(ci);
		const si: SignatureInformation = {
			label: name,
			documentation: comments,
			parameters: []
		}
		//debug(name);
		//debug(params);
		if (params === "") {
			continue;
		}
		const paramArr: string[] = params.split(",");
		for (const i in paramArr) {
			try {
				if (paramArr[i].includes("*args") || paramArr[i].includes("**kwargs")) {
					const pi: ParameterInformation = {
						label: paramArr[i].trim(),
						documentation: comments
					}
					si.parameters?.push(pi);
					continue;
				}
				const paramDef: string[] = paramArr[i].split(":");
				const pi: ParameterInformation = {
					label: paramDef[0].trim(),
					documentation: (paramDef.length === 2) ? paramDef[1].trim() : comments
				}
				si.parameters?.push(pi);
			} catch (e) {
				debug("Error parsing parameter for function " + name + ", Parameter: "+ paramArr[i] + "\n" + e as string);
			}
		}
		
		//appendFunctionData(si);

		//debug(JSON.stringify(ci));

	}
	//debug(JSON.stringify(typings));
	return typings;
}

export function getRegExMatch(sourceString : string, pattern : RegExp) : string {
	let ret = "";
	let m: RegExpExecArray | null;
	let count = 0;
	while ((m = pattern.exec(sourceString)) && count < 1) {
		ret += m[0];
		count++
	}
	return ret;
}

// export function debug(str : string | undefined) {
// 	if (str === undefined) {
// 		str = "UNDEFINED";
// 	}
// 	str = "\n" + str;
// 	fs.writeFileSync('outputLog.txt', str, {flag: "a+"});
// }