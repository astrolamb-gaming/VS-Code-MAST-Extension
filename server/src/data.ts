import { debug } from 'console';
import { CompletionItemLabelDetails, integer, MarkupContent, ParameterInformation, SignatureInformation } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { fixFileName, getParentFolder } from './fileFunctions';
import exp = require('constants');
import { getCache } from './cache';
import { getGlobals } from './globals';

/**
 * This accounts for classes that use a different name as a global than the class name. 
 * E.g. the sim global variable refers to the simulation class. Instead of simulation.functionName(), use sim.functionName().
 */
export const replaceNames = [
	['simulation','sim']
]
/**
 * This accounts for modules that are treated as classes instead of just adding the functions as default functions.
 * So instead of simply using the arc() function from scatter.py, you'd need to use scatter.arc()
 */
export const asClasses = ["sbs","math","random"];
// export const asClasses = ["sbs","scatter","faces"];
/**
 * This accounts for modules that prepend the class name to the function name.
 * E.g. names.random_kralien_name() would become names_random_kralien_name()
 */
export const prepend = ["ship_data","names","scatter"];

// TODO: Account for names_random_kralien() instead of names.random_kralien() or random_kralien()

export class FileCache {
	uri: string;
	parentFolder: string;
	variableNames: string[] = [];
	constructor(uri: string) {
		this.uri = fixFileName(uri);
		let parent = "sbs_utils";
		if (!uri.includes("sbs_utils") && !uri.includes("mastlib") && !uri.includes("builtin")) {
			parent = getParentFolder(uri);
		}
		this.parentFolder = parent;
	}
	// 
	/**
	 * Pretty sure this isn't actually used...
	 * See {@link Variable Variable}
	 * @param contents 
	 */
	parseVariables(contents: string) {
		let pattern = /^\s*?(\w+)\s*?=\s*?[^\s\+=-\\*\/].*$/gm;
		let m: RegExpExecArray | null;
		let catcher = 0;
		while (m = pattern.exec(contents)) {
			const variable = m[0];
			
			debug(variable);
			catcher++;
			if (catcher > 20) {
				continue;
			}
		}
	}
}


/**
 * 
 * @param text 
 * @param pos 
 * @returns 
 */
export function getLabelDescription(td: TextDocument, pos:integer) {
	const labelLoc = td.positionAt(pos);
	const text = td.getText();
	let check = labelLoc.line + 1;
	let labelDesc: string = "";
	let multiLineComment: boolean = false;
	while (check < td.lineCount) {
		const lineStart = td.offsetAt({line: check, character:0});
		const str = text.substring(lineStart,text.indexOf("\n",lineStart));
		debug(str);
		if (multiLineComment) {
			if (str.endsWith("*/")) {
				multiLineComment = false;
				labelDesc = labelDesc + str.replace("*/","");
			} else {
				labelDesc = labelDesc + str;
			}
		}
		if (str.trim().startsWith("/*")) {
				multiLineComment = true;
				labelDesc = labelDesc + str.replace("/*","");
		} else {
			if (str.trim().startsWith("\"") || str.trim().startsWith("#")) {
				debug(str);
				labelDesc = labelDesc + str.replace("\"","").replace("#","");
			} else {
				break;
			}
		}
		check++;
	}
	return labelDesc;
}

// export function getVariablesInFile(textDocument:TextDocument) {
// 	const text = textDocument.getText();
// 	const cache = getCache(textDocument.uri);
// 	debug("Trying to get variables");
// 	let variables: Variable[] = [];
// 	const pattern: RegExp = /^\s*?\w+(?=\s*=[^=]\s*?)/gm;
// 	const lines = text.split("\n");
// 	debug("Done getting variables");
// 	let m: RegExpExecArray | null;
// 	let found = false;
// 	for (const line of lines) {
// 		const match = line.match(pattern);
// 		if (match) {
// 			const v = match[0];
// 			debug(v);
// 			// Get the variable type at this point

// 			const equal = line.indexOf("=")+1;
// 			const typeEvalStr = line.substring(equal).trim();
// 			debug(typeEvalStr);
// 			const t = getVariableTypes(typeEvalStr,textDocument.uri);
// 			debug(t);

// 			// Check if the variable is already found
// 			let found = false;
// 			for (const _var of variables) {
// 				if (_var.name === v) {
// 					found = true;
// 					// If it's already part of the list, then do this:
// 					for (const varType of t) {
// 						if (!_var.possibleTypes.includes(varType)) {
// 							_var.possibleTypes.push(varType);
// 						}
// 					}
// 					break;
// 				}
// 			}
			
// 			if (!found) {
// 				const variable:Variable = {
// 					name: v,
// 					possibleTypes: t,
// 					modifiers: []
// 				}
// 			}
// 		}
// 	}
// 	return variables;
// }



function getVariableTypes(typeEvalStr:string, uri:string): string[] {
	let types: string[] = [];
	const test:boolean = "to_object(amb_id)" === typeEvalStr;
	const isNumberType = (s: string) => !isNaN(+s) && isFinite(+s) && !/e/i.test(s)
	const cache = getCache(uri);
	//let type: string = "any";
	// Check if it's a string
	if (typeEvalStr.startsWith("\"") || typeEvalStr.startsWith("'")) {
		types.push("string");
	// Check if its an f-string
	} else if (typeEvalStr.startsWith("f\"") || typeEvalStr.startsWith("f'")) {
		types.push("string");
	// Check if it's a multiline string
	} else if (typeEvalStr.startsWith("\"\"\"") || typeEvalStr.startsWith("'''")) {
		types.push("string");
	} else if (typeEvalStr === "True" || typeEvalStr === "False") {
		types.push("boolean");
	} else if (isNumberType(typeEvalStr)) {
		// Check if it's got a decimal
		if (typeEvalStr.includes(".")) {
			types.push("float");
		}
		// Default to integer
		types.push("int");
	}
	

	// Check over all default functions
	// for (const f of cache.missionDefaultFunctions) {
	// 	if (typeEvalStr.startsWith(f.name)) {
	// 		if (test) debug(f);
	// 		types.push(f.returnType);
	// 	}
	// }

	// Is this a class, or a class function?
	for (const co of cache.missionClasses) {
		if (typeEvalStr.startsWith(co.name)) {
			// Check if it's a static method of the class
			for (const func of co.methods) {
				if (typeEvalStr.startsWith(co.name + "." + func.name)) {
					if (test) debug(co.name + "." + func.name);
					types.push(func.returnType);
				}
			}
			// If it's not a static method, then just return the class
			if (test) debug(co);
			types.push(co.name);
		}
	}

	// If it's none of the above, then it's probably an object, or a parameter of that object
	if (test)  debug(types);
	return types;

}
