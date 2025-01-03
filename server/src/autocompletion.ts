import { debug } from 'console';
import { CompletionItem, CompletionItemKind, integer, MarkupContent, TextDocumentPositionParams } from 'vscode-languageserver';
import { getMainLabelAtPos } from './labels';
import { getClassTypings, getPyTypings, getSourceFiles, getSupportedRoutes, labelNames } from './server';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClassObject, ClassTypings, IClassObject, PyFile } from './data';
import { getRouteLabelAutocompletions } from './routeLabels';

let classes: IClassObject[] = [];
let defaultFunctionCompletionItems: CompletionItem[] = [];

/**
 * Does setup for all of the autocompletion stuff. Only should run once.
 * @param files 
 */
export function prepCompletions(files: PyFile[]) {
	/// This gets all the default options. Should this be a const variable?
	
	for (const i in files) {
		const pyFile = files[i];
		defaultFunctionCompletionItems = defaultFunctionCompletionItems.concat(pyFile.defaultFunctionCompletionItems);
		classes = classes.concat(pyFile.classes);
	}
	//debug(defaultFunctionCompletionItems);
	// TODO: Send message to user if classes or defaultFunctionCompletionItems have a length of 0
}

export function onCompletion(_textDocumentPosition: TextDocumentPositionParams, text: TextDocument): CompletionItem[] {
	let ci : CompletionItem[] = [];
	const t = text?.getText();
	if (text === undefined) {
		debug("Document ref is undefined");
		return ci;
	}
	if (t === undefined) {
		debug("Document text is undefined");
		return ci;
	}
	// Calculate the position in the text's string value using the Position value.
	const pos : integer = text.offsetAt(_textDocumentPosition.position);
	const startOfLine : integer = pos - _textDocumentPosition.position.character;
	const iStr : string = t.substring(startOfLine,pos);
	//debug("" + startOfLine as string);
	//
	// debug(iStr);
	let items : string[] = [
		"sbs",
		"change_console",
		"MoreThings",
		"sbs.something",
		"sbs.target",
		"sbs.functions"
	]

	

	// If we're defining a label, we don't want autocomplete.
	if (iStr.includes("--") || iStr.includes("==")) {
		return ci;
	}

	// Route Label autocompletion
	if(iStr.includes("//")) {
		return getRouteLabelAutocompletions(iStr);
	}
	// TODO: Add variables provided by routes to autocompletion
	/**
	 * //science
	 * SCIENCE_ORIGIN_ID - The engine ID of the player ship doing the scan
	 * SCIENCE_ORIGIN - The python Agent of the player ship doing the scan
	 * SCIENCE_SELECTED_ID - The engine ID of the Agent being scanned
	 * SCIENCE_SELECTED - The python Agent of being scanned
	 * 
	 * //comms
	 * COMMS_ORIGIN_ID - The engine ID of the player ship for the comms console
	 * COMMS_ORIGIN - The python Agent of the player ship for the comms console
	 * COMMS_SELECTED_ID - The engine ID of the Agent being communicated with
	 * COMMS_SELECTED - The python Agent of being communicated with
	 * 
	 * //spawn
	 * SPAWNED_ID
	 * SPAWNED
	 */

	// Handle label autocompletion
	let jump: RegExp = /(->|jump) *?$/;
	if (jump.test(iStr) || iStr.endsWith("task_schedule( ") || iStr.endsWith("task_schedule (")) {
		for (const i in labelNames) {
			ci.push({label: labelNames[i].name, kind: CompletionItemKind.Event});
		}
		const lbl = getMainLabelAtPos(startOfLine,labelNames).subLabels;
		for (const i in lbl) {
			ci.push({label: lbl[i], kind: CompletionItemKind.Event});
		}
		return ci;
	}
	

	// if (iStr.endsWith("(")) {
	// 	// const func: RegExp = /[\w. ]+?\(/g
	// 	// let m: RegExpExecArray | null;
	// 	// while (m = func.exec(iStr)) {
		
	// 	// }
	// 	return ci;
	// }

	// First we check if it should be just stuff from a particular class
	for (const i in classes) {
		if (iStr.endsWith(classes[i].name + ".")) {
			return ci.concat(classes[i].methodCompletionItems);
		}
	}
	// If it doesn't belong to a particular class, add class constructor to the list of completion items
	for (const i in classes) {
		//if (classes[i].constructorFunction !== undefined) {
			ci.push(classes[i].completionItem);
		//}
	}

	ci = ci.concat(defaultFunctionCompletionItems);
	// TODO: Account for text that's already present
	// - Remove the text from the start of the completion item label
	return ci;
}


