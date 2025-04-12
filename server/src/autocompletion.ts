import { debug } from 'console';
import { CompletionItem, CompletionItemKind, CompletionItemTag, integer, MarkupContent, SignatureInformation, TextDocumentPositionParams } from 'vscode-languageserver';
import { getMainLabelAtPos } from './labels';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { IClassObject, PyFile } from './data';
import { getRouteLabelVars } from './routeLabels';
import { getStrings, getYamls, isInComment, isInString, isInYaml, isTextInBracket } from './comments';
import { getCache } from './cache';
import path = require('path');
import fs = require("fs");
import { fixFileName, getFilesInDir } from './fileFunctions';
import { updateTokensForLine } from './tokens';
import { getGlobals } from './globals';
import { getCurrentMethodName } from './signatureHelp';
import { getRolesAsCompletionItem, getRolesForFile } from './roles';
import { getVariableNamesInDoc, getVariablesAsCompletionItem } from './variables';
import { buildFaction } from './factions';

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
	// return buildFaction("kra","Kralien_Set");
	debug("Staring onCompletion");
	// return getGlobals().artFiles;
	const cache = getCache(text.uri);
	let ci : CompletionItem[] = [];
	debug("Cache loaded.");
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

	if (fixFileName(text.uri).endsWith("__init__.mast")) {
		if (iStr.trim() === "") {
			return [{label: "import", kind: CompletionItemKind.Keyword}]
		} else if (iStr.trim().startsWith("import")) {
			const files = getFilesInDir(path.dirname(fixFileName(text.uri)));
			for (const f of files) {
				if (!f.endsWith("__init__.mast")) {
					if (!t.includes(path.basename(f))) {
						const c: CompletionItem = {
							label: path.basename(f),
							kind: CompletionItemKind.File
						}
						ci.push(c);
					}
				}
			}
		}
		return ci;
	} else {
		debug("NOT an init file");
	}
	let variables: CompletionItem[] = [];
	try {
		variables = cache.getVariables(text.uri);
	} catch(e) {
		debug(e);
	}
	debug("Variables parsed.");
	if (currentLine != _textDocumentPosition.position.line) {
		currentLine = _textDocumentPosition.position.line;
		// Here we can do any logic that doesn't need to be done every character change
		debug("Updating variables list")
		const varNames = getVariableNamesInDoc(text);
		variables = getVariablesAsCompletionItem(varNames);
	}
	debug("updating tokens...")
	updateTokensForLine(currentLine);
	
	
	// getVariablesInFile(text);
	// return ci;

	
	//debug("" + startOfLine as string);
	//
	debug(iStr);

	// If we're inside a comment or a string, we don't want autocompletion.
	if (isInComment(pos)) {
		debug("Is in Comment")
		return ci;
	}
	getYamls(text);
	if (isInYaml(pos)) {
		debug("Is in Yaml")
		ci = ci.concat(cache.getCompletions());
		return ci;
	}

	// TODO: Check and make absolutely sure that isTextInBracket is working properly
	// TODO: May be useful to have a list of used string words that can be added via autocomplete (i.e. roles)
	// TODO: Faces: Add ability to get the desired image from tiles: https://stackoverflow.com/questions/11533606/javascript-splitting-a-tileset-image-to-be-stored-in-2d-image-array
	if (iStr.endsWith("\"") || iStr.endsWith("'")) {
		debug("Updating strings...")
		getStrings(text);
	}
	// This is to get rid of " or ' at end so we don't have to check for both
	const blobStr = iStr.substring(0,iStr.length-1);
	debug(blobStr)
	if (isInString(pos)) {
		if (!isTextInBracket(iStr,pos)) {
			// Here we check for blob info
			if (blobStr.endsWith(".set(") || blobStr.endsWith(".get(")) {
				debug("Is BLobe");
				return getGlobals().blob_items
			}

			// Here we check for roles
			if (blobStr.endsWith("role(") || blobStr.endsWith("roles(")) {
				debug("Getting roles")
				let roles = getRolesForFile(t);
				roles = roles.concat(cache.getRoles(text.uri));
				roles = roles.concat(getGlobals().shipData.roles);
				ci = getRolesAsCompletionItem(roles);
				return ci;
			}

			// Here we check for stylestrings, art_ids, etc.
			
			const func = getCurrentMethodName(iStr);
			const sig: SignatureInformation|undefined = getCache(text.uri).getSignatureOfMethod(func);
			const fstart = iStr.lastIndexOf(func);
			const wholeFunc = iStr.substring(fstart,iStr.length);
			const arr = wholeFunc.split(",");
			if (sig !== undefined) {
				if (sig.parameters !== undefined) {
					for (const i in sig.parameters) {
						if (i !== ""+(arr.length-1)) continue;
						if (sig.parameters[i].label === "style") {
							for (const s of getGlobals().widget_stylestrings) {
								if (func === s.function) {
									const c = {
										label: s.name,
										//labelDetails: {detail: s.docs},
										documentation: s.docs,
										kind: CompletionItemKind.Text,
										insertText: s.name + ": "
									}
									if (c.label === "color") {
										c.insertText = c.insertText + "#"
									}
									ci.push(c)
								}
							}
						} else if (sig.parameters[i].label === "art_id") {
							// Get all possible art files
							return getGlobals().artFiles;
						} else if (sig.parameters[i].label === 'art') {
							return getGlobals().artFiles;
						}
					}
				}
			}

			debug("Is in string");
			return ci;
		}
	}


	/**
 * 		□ All
		□ Scan
		□ Client
		□ Ship
		□ Dialog
		□ Dialog_main
		□ Dialog_consoles_all
		□ Dialog_consoles
			Dialog_ships
	 */
	if (iStr.endsWith("<")) {
		const comms = [
			"all",
			"scan",
			"client",
			"ship",
			"dialog",
			"dialog_main",
			"dialog_consoles_all",
			"dialog_consoles",
			"dialog_ships"
		]
		ci = [];
		for (const i of comms) {
			const c: CompletionItem = {
				label: i,
				insertText: i + ">",
				kind: CompletionItemKind.Field,
				labelDetails: {description: "Comms Target"}
			}
			ci.push(c);
		}
		const c: CompletionItem = {
			label: "<<",
			kind: CompletionItemKind.Field,
			insertText: "<",
			labelDetails: {description: "Comms Target"}
		}
		ci.push(c);
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
			debug("Getting regular route labels")
			ci = cache.getRouteLabels();//getRouteLabelAutocompletions(iStr);
			return ci;
		} else {
			const route = iStr.trim().substring(0,iStr.trim().indexOf(" "));
			const rlvs = getRouteLabelVars(route);
			debug(rlvs)
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
	let jump: RegExp = /(->|jump)[ \t]*?/;
	if (jump.test(iStr) || iStr.endsWith("task_schedule( ") || iStr.endsWith("task_schedule (") || iStr.endsWith("objective_add(") || iStr.endsWith("brain_add(")) {
		let labelNames = cache.getLabels(text);
		//debug(labelNames);
		// Iterate over parent label info objects
		for (const i in labelNames) {
			if (labelNames[i].name === "main") continue;
			if (labelNames[i].name.startsWith("//")) continue;
			if (fixFileName(labelNames[i].srcFile) !== fixFileName(text.uri) && labelNames[i].name === "END") continue;
			ci.push({label: labelNames[i].name, kind: CompletionItemKind.Event, labelDetails: {description: path.basename(labelNames[i].srcFile)}});
		}
		const lbl = getMainLabelAtPos(startOfLine,labelNames);
		if (lbl === undefined) {
			return ci;
		} else {
			// Check for the parent label at this point (to get sublabels within the same parent)
			if (lbl.srcFile === fixFileName(text.uri)) {
				debug("same file name!");
				let subs = lbl.subLabels;
				debug(lbl.name);
				debug(subs);
				for (const i in subs) {
					ci.push({label: subs[i].name, kind: CompletionItemKind.Event, labelDetails: {description: "Sub-label of: " + lbl.name}});
				}
			}
			return ci;
		}
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
	for (const key of keywords) {
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
		if (!iStr.trim().startsWith("//")) {
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


