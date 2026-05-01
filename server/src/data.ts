import { debug } from 'console';
import { CompletionItemLabelDetails, integer, MarkupContent, ParameterInformation, SignatureInformation } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { fixFileName, getParentFolder } from './fileFunctions';
import exp = require('constants');
import { getCache } from './cache';
import { getArtemisGlobals } from './artemisGlobals';

/**
 * This accounts for classes that use a different name as a global than the class name. 
 * E.g. the sim global variable refers to the simulation class. Instead of simulation.functionName(), use sim.functionName().
 */
export const replaceNames = [
	['simulation','sim']
]

export function getPreferredClassName(name: string): string {
	for (const [canonicalName, aliasName] of replaceNames) {
		if (name === canonicalName) {
			return aliasName;
		}
	}
	return name;
}

export function matchesClassName(left: string, right: string): boolean {
	if (left === right) {
		return true;
	}

	for (const [canonicalName, aliasName] of replaceNames) {
		if ((left === canonicalName && right === aliasName) || (left === aliasName && right === canonicalName)) {
			return true;
		}
	}

	return false;
}
/**
 * This accounts for modules that are treated as classes instead of just adding the functions as default functions.
 * So instead of simply using the arc() function from scatter.py, you'd need to use scatter.arc()
 */
export const asClasses: string[] = [];// ["sbs","math","random"];
// export const asClasses = ["sbs","scatter","faces"];
/**
 * This accounts for modules that prepend the class name to the function name.
 * E.g. names.random_kralien_name() would become names_random_kralien_name()
 * In theory this is not longer in use. Instead this should happen due to the check in {@link PyFile PyFile} for if it's a global
 * Need to verify if it's doing this properly.
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
}


/**
 * Gets the comments and weighted strings associated with the label at the provided position.
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


