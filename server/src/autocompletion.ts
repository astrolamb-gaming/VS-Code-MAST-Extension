import { debug } from 'console';
import { CompletionItem, CompletionItemKind, integer, MarkupContent, TextDocumentPositionParams } from 'vscode-languageserver';
import { checkLabels, getMainLabelAtPos } from './labels';
import { labelNames, updateLabelNames } from './server';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClassObject, ClassTypings, getVariablesInFile, IClassObject, PyFile } from './data';
import { getRouteLabelAutocompletions, getRouteLabelVars, getSkyboxCompletionItems } from './routeLabels';
import { isInComment, isInString, isInYaml, isTextInBracket } from './comments';
import { getCache } from './cache';
import path = require('path');
import { fixFileName } from './fileFunctions';
import { getVariableNamesInDoc, updateTokensForLine, variables } from './tokens';
import { getGlobals } from './globals';

let classes: IClassObject[] = [];
let defaultFunctionCompletionItems: CompletionItem[] = [];

/**
 * // TODO: This needs implemented I think???? Check the pyfile parsing and see if this is done already
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

let currentLine = 0;

export function onCompletion(_textDocumentPosition: TextDocumentPositionParams, text: TextDocument): CompletionItem[] {
	if (currentLine != _textDocumentPosition.position.line) {
		currentLine = _textDocumentPosition.position.line;
		// Here we can do any logic that doesn't need to be done every character change
		debug("Updating variables list")
		getVariableNamesInDoc(text);
	}
	updateTokensForLine(currentLine);
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
	// getVariablesInFile(text);
	// return ci;

	const cache = getCache(text.uri);

	// Calculate the position in the text's string value using the Position value.
	const pos : integer = text.offsetAt(_textDocumentPosition.position);
	const startOfLine : integer = pos - _textDocumentPosition.position.character;
	const iStr : string = t.substring(startOfLine,pos);
	//debug("" + startOfLine as string);
	//
	debug(iStr);

	// If we're inside a comment or a string, we don't want autocompletion.
	if (isInComment(pos)) {
		return ci;
	}

	if (isInYaml(pos)) {
		return ci;
	}

	// TODO: Check and make absolutely sure that isTextInBracket is working properly
	// TODO: May be useful to have a list of used string words that can be added via autocomplete (i.e. roles)
	const blobStr = iStr.substring(0,iStr.length-1);
	if (isInString(pos) && !isTextInBracket(iStr,pos)) {
		// Here we check for blob info
		if (blobStr.endsWith(".set(") || blobStr.endsWith(".get(")) {
			debug("Is BLobe");
			return getGlobals().blob_items
		}
		debug("Is in string");
		return ci;
	}

	

	// If we're defining a label, we don't want autocomplete.
	// TODO: ++ labels should have specific names
	if (iStr.trim().startsWith("--") || iStr.trim().startsWith("==") || iStr.trim().startsWith("++")) {
		return ci;
	}

	// Media labels only get the skybox names
	else if (iStr.endsWith("@media/skybox/")) {
		return getGlobals().skyboxes;
	// Get Music Options (default vs Artemis2)
	} else if (iStr.endsWith("@media/music/")) {
		return getGlobals().music;
	}

	// Route Label autocompletion
	if(iStr.trim().startsWith("//")) {
		// If this is a route label, but NOT anything after it, then we only return route labels
		if (!iStr.trim().includes(" ")) {
			ci = cache.getRouteLabels();//getRouteLabelAutocompletions(iStr);
			return ci;
		} else {
			const route = iStr.trim().substring(0,iStr.trim().indexOf(" "));
			const rlvs = getRouteLabelVars(route);
			for (const s of rlvs) {
				const c: CompletionItem = {
					label: s,
					kind: CompletionItemKind.EnumMember,
					labelDetails: {description: "Route-specific Variable"}
				}
				ci.push(c);
			}
		}
		// TODO: Add media, map, gui/tab, and console autocompletion items
	} else if (iStr.trim().startsWith("@")) {
		ci = cache.getMediaLabels();
		return ci;
	}
	

	// Handle label autocompletion
	let jump: RegExp = /(->|jump) *?$/;
	if (jump.test(iStr) || iStr.endsWith("task_schedule( ") || iStr.endsWith("task_schedule (") || iStr.endsWith("objective_add(") || iStr.endsWith("brain_add(")) {
		let labelNames = cache.getLabels(text);
		debug(labelNames);
		// Iterate over parent label info objects
		for (const i in labelNames) {
			ci.push({label: labelNames[i].name, kind: CompletionItemKind.Event, labelDetails: {description: path.basename(labelNames[i].srcFile)}});
		}
		const lbl = getMainLabelAtPos(startOfLine,labelNames);
		if (lbl === undefined) {
			return ci;
		}
		// Check for the parent label at this point (to get sublabels within the same parent)
		if (lbl.srcFile === fixFileName(text.uri)) {
			debug("same file name!");
			let subs = lbl.subLabels;
			debug(lbl.name);
			debug(subs);
			for (const i in subs) {
				ci.push({label: subs[i], kind: CompletionItemKind.Event, labelDetails: {description: "Sub-label of: " + lbl.name}});
			}
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


	/**  
	 	All of this is now done by MissionCache#getCompletions()
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
	*/

	


	debug("Checking getCompletions");
	//debug(text.uri);
	//debug(ci);
	

	// Check if this is a class
	if (iStr.endsWith(".")) {
		debug("Getting Classes...");
		for (const c of cache.missionClasses) {
			if (c.name === "sbs") {
				debug("THIS IS SBS");
			}
			if (iStr.endsWith(c.name + ".")) {
				debug(iStr + " contains" + c.name);
				// TODO: Only use labels with isClassMethod = true
				// c.methods[0].completionItem.kind == CompletionItemKind.Method;
				return c.methodCompletionItems;
			}
		}
	}
	//debug(ci.length);
	ci = ci.concat(cache.getCompletions());
	let keywords : string[] = [
		"def",
		"async",
		"on change",
		"await",
		"shared",
		"import",
		"if",
		"else",
		"match",
		"case",
		"yield"
	]
	// Add keywords to completions
	for (const key in keywords) {
		let i: CompletionItem = {
			label: key,
			kind: CompletionItemKind.Keyword
		}
		ci.push(i);
	}

	// Add Route-specific variables, e.g. COLLISION_ID or SCIENCE_TARGET
	const lbl = getMainLabelAtPos(pos);
	debug("Main label at pos: ");
	debug(lbl)
	if (lbl.type === "route") {
		const vars = getRouteLabelVars(lbl.name);
		for (const s of vars) {
			const c: CompletionItem = {
				label: s,
				kind: CompletionItemKind.EnumMember,
				labelDetails: {description: "Route-specific Variable"}
			}
			ci.push(c);
		}
	}

	// Add variable names to autocomplete list
	// TODO: Add variables from other files in scope?
	debug(variables)
	ci = ci.concat(variables);

	//debug(ci.length);
	//ci = ci.concat(defaultFunctionCompletionItems);
	// TODO: Account for text that's already present?? I don't think that's necessary
	// - Remove the text from the start of the completion item label
	return ci;
}


