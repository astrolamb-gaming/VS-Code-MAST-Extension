import { debug } from 'console';
import { CompletionItem, CompletionItemKind, integer, MarkupContent, ParameterInformation, SignatureHelpParams, SignatureInformation, TextDocumentPositionParams } from 'vscode-languageserver';
import { buildLabelDocs, getLabelMetadataKeys, getLabelsAsCompletionItems, getMainLabelAtPos } from './../tokens/labels';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { asClasses, replaceNames } from './../data';
import { getRouteLabelVars } from './../tokens/routeLabels';
import { CRange, getTokenContextAtPosition, getTokenTypeAtPosition, isTextInBracket, replaceRegexMatchWithUnderscore } from './../tokens/comments';
import { getCache, MissionCache } from './../cache';
import path = require('path');
import { fixFileName, getFilesInDir } from './../fileFunctions';
import { getArtemisGlobals } from '../artemisGlobals';
import { onSignatureHelp, getCallContextFromTokens } from './signatureHelp';
import { getWordsAsCompletionItems } from './../tokens/roles';
import { variableModifiers } from './../tokens/variables';
import { isClassMethod } from './../tokens/tokens';
import { Function } from './../data/function';
import { getCurrentLineFromTextDocument, getHoveredSymbol } from './hover';
import { countMatches } from './../rx';
import { buildSignalInfoListAsCompletionItems } from './../tokens/signals';
import { sendToClient } from '../server';

// https://stackoverflow.com/questions/78755236/how-can-i-prioritize-vs-code-extension-code-completion

let currentLine = 0;
let routeCompletions: CompletionItem[] = [];
const shipPickerArgs = new Set(['art', 'art_id', 'ship_key', 'ship_data_key']);
let lastShipPickerTriggerKey = '';
let lastShipPickerTriggerAt = 0;
const facePickerArgs = new Set(['face']);
let lastFacePickerTriggerKey = '';
let lastFacePickerTriggerAt = 0;

function maybeTriggerShipPicker(argName: string, text: TextDocument, line: number): void {
	if (!shipPickerArgs.has(argName)) {
		return;
	}

	const now = Date.now();
	const key = `${text.uri}:${line}:${argName}`;
	if (key === lastShipPickerTriggerKey && now - lastShipPickerTriggerAt < 10000) {
		return;
	}

	lastShipPickerTriggerKey = key;
	lastShipPickerTriggerAt = now;
	sendToClient('openShipPicker', {
		argumentName: argName,
		sourceUri: text.uri,
		line
	});
}

function maybeTriggerFacePicker(argName: string, text: TextDocument, line: number): void {
	if (!facePickerArgs.has(argName)) {
		return;
	}

	const now = Date.now();
	const key = `${text.uri}:${line}:${argName}`;
	if (key === lastFacePickerTriggerKey && now - lastFacePickerTriggerAt < 10000) {
		return;
	}

	lastFacePickerTriggerKey = key;
	lastFacePickerTriggerAt = now;
	sendToClient('openFacePicker', {
		argumentName: argName,
		sourceUri: text.uri,
		line
	});
}

export function onCompletion(_textDocumentPosition: TextDocumentPositionParams, text: TextDocument): CompletionItem[] {
	// return buildFaction("kra","Kralien_Set");
	// debug("Staring onCompletion");
	const cache = getCache(text.uri);
	// return getGlobals().artFiles;
	
	let ci : CompletionItem[] = [];
	// debug("Cache loaded.");
	const t = text?.getText();
	if (text === undefined) {
		debug("Document ref is undefined");
		return ci;
	}
	if (t === undefined) {
		debug("Document text is undefined");
		return ci;
	}

	// Keep token-derived context in sync with the latest document content.
	cache.updateFileInfo(text);
	const tokens = cache.getMastFile(text.uri)?.tokens || [];

	// Calculate the position in the text's string value using the Position value.
	const pos : integer = text.offsetAt(_textDocumentPosition.position);
	const startOfLine : integer = pos - _textDocumentPosition.position.character;
	const iStr : string = t.substring(startOfLine,pos);
	debug(iStr)
	if (iStr.trim().endsWith(")")) {
		debug("Ends with ), should have no completions")
		return [];
	}
	const line = getCurrentLineFromTextDocument(_textDocumentPosition.position, text)
	
//#region __init__.mast Completions
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
		// debug("NOT an init file");
	}
//#endregion


//#region YIELD Completions
	if (iStr.trim().startsWith("yield")) {
		const yieldRes = [
			// TODO: Add usage descriptions as second parameter of these arrays
			["success"],
			["idle"],
			["fail"],
			["result"],
			["end"]
		];
		for (const r of yieldRes) {
			const c: CompletionItem = {
				label: r[0],
				kind: CompletionItemKind.Constant
			}
			if (r[1] !== undefined) {
				c.detail = r[1];
			}
			ci.push(c);
		}
		return ci;
	}
//#endregion
	const tokenTypeAtPos = getTokenTypeAtPosition(text, tokens, _textDocumentPosition.position);
	const tokenContextAtPos = getTokenContextAtPosition(text, tokens, _textDocumentPosition.position);

	// if (currentLine != _textDocumentPosition.position.line) {
	// 	currentLine = _textDocumentPosition.position.line;
	// 	// Here we can do any logic that doesn't need to be done every character change
	// 	// debug("Updating variables list")
	// 	// const varNames = getVariableNamesInDoc(text);
	// 	// const variables = cache.getVariableCompletionItems(text);
	// 	// variables = getVariablesAsCompletionItem(varNames);
	// }
	// // debug("updating tokens...")
	// // updateTokensForLine(currentLine);
	
	
	// getVariablesInFile(text);
	// return ci;

	
	//debug("" + startOfLine as string);
	//
	const isInString = tokenTypeAtPos === 'string';
	const isInSquareBrackets = tokenTypeAtPos === 'square-bracket';

	// If we're inside a comment or a string, we don't want autocompletion.
	const isInComment = tokenTypeAtPos === 'comment';
	if (isInComment) {
		if (iStr.endsWith("#")) {
			const regions = [
				"region",
				"endregion"
			]
			for (const r of regions) {
				const c: CompletionItem = {
					label: r,
					kind: CompletionItemKind.Snippet
				}
				ci.push(c);
			}
			return ci;
		}
		debug("Is in Comment")
		return ci;
	}
	
	const isInYaml = tokenTypeAtPos === 'yaml';
	if (isInYaml) {
		debug("Is in Yaml")
		ci = ci.concat(cache.getCompletions());
		return ci;
	}

	// TODO: Check and make absolutely sure that isTextInBracket is working properly
	// TODO: May be useful to have a list of used string words that can be added via autocomplete (i.e. roles)
	// TODO: Faces: Add ability to get the desired image from tiles: https://stackoverflow.com/questions/11533606/javascript-splitting-a-tileset-image-to-be-stored-in-2d-image-array


	/// Try token-based function/parameter detection first (more reliable than line parsing)
	let callContext = getCallContextFromTokens(tokens, _textDocumentPosition.position, text);
	let currentParam:ParameterInformation|undefined;
	let currentParamName: string = "";
	let func: string = "";
	let currentParamType: string | undefined = undefined;

	if (callContext) {
		func = callContext.functionName;
		const method = cache.getMethod(func) || cache.getPossibleMethods(func)[0];
		if (method) {
			const params = method.parameters;
			if (callContext.parameterIndex < params.length) {
				const rawName = params[callContext.parameterIndex].name;
				currentParamName = rawName.split('=')[0].split(':')[0].trim();
				if (!callContext.parameterName && currentParamName) {
					callContext.parameterName = currentParamName;
				}
				currentParamType = params[callContext.parameterIndex].type;
				debug(`Token-based: func="${func}", param="${currentParamName}"`);
			}
		}
	}

	//#region Object Key/Value Completions
	if (tokenContextAtPos.inObject) {
		debug("Is in object");
		if (tokenContextAtPos.inObjectKey) {
			debug("Getting object key completions");
			const lbl = tokenContextAtPos.recentLabelInfo;
			if (lbl) {
				const keys = getLabelMetadataKeys(lbl, text, tokens);
				for (const k of keys) {
					const c: CompletionItem = {
						label: k[0],
						kind: CompletionItemKind.Text
					}
					if (tokenContextAtPos.inString) {
						c.insertText = k[0];
					} else {
						c.insertText = "\"" + k[0] + "\": ";
					}
					if (k[1] !== "") {
						c.documentation = "Default value: " + k[1];
					}
					ci.push(c);
				}
				return ci;
			}
		}
	}
	//#endregion

	// Fallback to signature help if token method didn't find it
	// if (!func) {
	// 	debug("Falling back to signature help");
	// 	const params: SignatureHelpParams = {
	// 		textDocument: _textDocumentPosition.textDocument,
	// 		position: _textDocumentPosition.position
	// 	}
	// 	const sig = onSignatureHelp(params, text);
	// 	if (sig && sig.signatures) {
	// 		let curSig = sig.signatures[0];
	// 		debug(curSig)
	// 		if (curSig.parameters) {
	// 			func = curSig.label;
	// 			if (sig.activeParameter === undefined) {
	// 				sig.activeParameter = 0
	// 			}
	// 			currentParam = curSig.parameters[sig.activeParameter]
	// 			currentParamName = currentParam.label as string
	// 		}
	// 	}
	// }

	// debug("arg: " + currentParamName)
	// debug("func: " + func)



//#region In-String Completions
	// This is to get rid of " or ' at end so we don't have to check for both
	const blobStr = iStr.substring(0,iStr.length-1);
	// debug(blobStr)
	// Check if there's an odd number of quotes, if it starts with quotes, or is within a string
	// TODO: this doesn't account for f-strings....
	// if (countMatches(iStr,/[\"']/g) % 2 !== 0 || iStr.endsWith("\"") || iStr.endsWith("'") || isInString) {
	if (isInString) {
		debug("Is in string (probably)")
		// if (blobStr.endsWith("signal_emit(")) {
		if (func === "signal_emit") {
			const signals = cache.getSignals();
			return buildSignalInfoListAsCompletionItems(signals);
		}
		if (!tokenContextAtPos.inObject) {
			debug("Not an object, checking for other in-string completions")
		// if (!isTextInBracket(iStr,0,pos)) {
			// Here we check for blob info
			if (blobStr.endsWith(".set(") || blobStr.endsWith(".get(")) {
				debug("Is BLobe");
				let blobs = getArtemisGlobals().blob_items;
				for (const bk of cache.getBlobKeys()) {
					if (blobs.find(item => item.label === bk.name)) continue;
					let ci:CompletionItem = {
						label: bk.name,
						kind: CompletionItemKind.Text,
						detail: "Type: Unknown"
					}
					blobs.push(ci);
				}
				return blobs;
			}

			// Here we check for roles
			// if (blobStr.endsWith("role(") || blobStr.endsWith("roles(")) {
			if (func.includes("role")) {
				debug("Getting roles")
				// let roles = getRolesForFile(text);
				let roles = cache.getRoles(text.uri);
				// roles = roles.concat(cache.getRoles(text.uri));
				// roles = roles.concat(getArtemisGlobals().shipData.roles);
				ci = getWordsAsCompletionItems("Role", roles, text);
				return ci;
			}

			// Now for inventory keys
			if (func.includes("inventory")) {
				// return getInventoryKeysForFile(cache, text);
				debug("Inventory key")
				debug(cache.getInventoryKeys(text.uri))
				return getWordsAsCompletionItems("Inventory Key", cache.getInventoryKeys(text.uri), text)
			}

			// Link names in link()/linked_to()/has_link()/etc.
			if (func.includes("link")) {
				const links = cache.getLinks();
				return getWordsAsCompletionItems("Link", links, text);
			}

			// Here we check for stylestrings, art_ids, etc.
			
			// const func = getCurrentMethodName(iStr);
			// const sig: SignatureInformation|undefined = getCache(text.uri).getSignatureOfMethod(func);
			// const fstart = iStr.lastIndexOf(func);
			// const wholeFunc = iStr.substring(fstart,iStr.length);
			// const arr = wholeFunc.split(",");
			// let named = /(\w+)\=$/m;
			// let test = blobStr.match(named);
			let args = [];
			// if (test) {
			// 	args = [test[1]];
			// } else {
			// 	args = getCurrentArgumentNames(iStr,text);
			// }
			// debug("Current function: " + func);
			// debug("arg: " + args);
			args = [currentParamName];
			debug("Checking args...." + currentParamName)
			for (const a of args) {
				if (a === "role" || a === "roles") {
					debug("Getting roles")
					let roles = cache.getRoles(text.uri);
					// roles = roles.concat(cache.getRoles(text.uri));
					// roles = roles.concat(getArtemisGlobals().shipData.roles);
					ci = getWordsAsCompletionItems("Role", roles, text);
				return ci;
				}
				if (a === "style" || a === "extra_style") {
					debug("Style found; iterating over widget stylestrings");
					// First we iterate over the stylestrings in the the txt file, these are SBS functions
					for (const s of getArtemisGlobals().widget_stylestrings) {
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
					if (ci.length > 0) return ci;
					// Then we do generic ones for MAST functions.
					for (const s of cache.styleDefinitions) {
						const c: CompletionItem = {
							label: s,
							kind: CompletionItemKind.Text,
							insertText: s + ": "
						}
						if (c.label.includes("color")) {
							c.insertText = c.insertText + "#"
						}
						if (c.label.includes("area")) {
							c.documentation = "Area Usage:\n\n `area: Left, Top, Right, Bottom;`";
						}
						ci.push(c);
					}
					return ci;
				}
				if (a === "descriptorString") {
					if (func.includes("particle")) {
						for (const arg of getArtemisGlobals().widget_stylestrings) {
							if (arg.function === "particle_event") {
								const item: CompletionItem = {
									label: arg.name,
									kind: CompletionItemKind.Text,
									insertText: arg.name + ": ",
									documentation: arg.docs
								}
								ci.push(item);
							}
						}
						return ci;
					}
				}
				if (a === "art_id" || a === "art" || a === "ship_key" || a === "ship_data_key") {
					maybeTriggerShipPicker(a, text, _textDocumentPosition.position.line);
					// ci = getGlobals().shipData.getCompletionItemsForShips();
					debug("Ship data key")
					ci = [];
					const ships = getArtemisGlobals().shipData.ships;
					for (const ship of ships) {
						ci.push(ship.completionItem);
					}
					debug(ci);
					return ci;
				}
				if (a === "face") {
					maybeTriggerFacePicker(a, text, _textDocumentPosition.position.line);
				}
				if (a === "key") {
					if (func.endsWith("data_set_value")) {
						return getAllBlobKeys(cache, text);
					}
					// Account for `modifier` and `modify`
					if (func.includes("modif")) {
						return getAllBlobKeys(cache, text).concat(getInventoryKeysForFile(cache, text))
					}
				}
				if (a === "behave_id") {
					// TODO: Someday there will be a master list of these and we will need to reference that instead
					let behaves = [
						"behav_npcship",
						"behav_typhon",
						"behav_asteroid",
						"behav_station",
						"behav_planet",
						"behav_nebula",
						"behav_missile",
						"behav_mine",
						"behav_maelstrom",
						"behav_pickup",
						"behav_wreck",
						"behav_do_nothing"
					]
					for (const b of behaves) {
						const c: CompletionItem = {
							label: b,
							kind: CompletionItemKind.Text
						}
						ci.push(c);
					}
					return ci;
				}
				if (a === "label" || a === "path") {
					const start = iStr.indexOf("//");
					let route = "";
					// If it starts with '//' then get routes
					if (start > -1) {
						route = iStr.substring(start);
						const routes = cache.getUsedRoutes(route);
						for (const r of routes) {
							const c: CompletionItem = {
								label: r,
								kind: CompletionItemKind.Event
							}
							ci.push(c);
						}
						return ci;
					}
					// Otherwise, just use regular labels
					const labels = cache.getLabels(text);
					const currentFileLabels = cache.getLabels(text, true);
					const main = getMainLabelAtPos(pos, currentFileLabels);
					return getLabelsAsCompletionItems(text, labels, main).concat(ci);
				}
				// If it even just INCLUDES "widget", then we'll try to add it.
				if (a.includes("widget")) {
					const widgets = getArtemisGlobals().widgets;
					for (const w of widgets) {
						const c: CompletionItem = {
							label: w.name,
							kind: CompletionItemKind.Text,
							documentation: w.docs,
							sortText: "___" + w.name
						}
						ci.push(c);
					}
					// return ci;
				}

				if (a === "link_name" || a === "link") {
					const links = cache.getLinks();
					ci = ci.concat(getWordsAsCompletionItems("Link", links, text));
					return ci;
				}
			}

			debug("Is in string");
			return ci;
		}
	}
//#endregion

	// If we're defining a label, we don't want autocomplete.
	// TODO: ++ labels should have specific names
	if (iStr.trim().startsWith("--") || iStr.trim().startsWith("==") || iStr.trim().startsWith("++")) {
		return [];
	}

	let trimmed = iStr.trim();
	

//#region Route and Media Labels 
	debug("Route and Media Labels");
	// Media labels only get the skybox names
	if (iStr.endsWith("@media/skybox/")) {
		return getArtemisGlobals().skyboxes;
	// Get Music Options (default vs Artemis2)
	} else if (iStr.endsWith("@media/music/")) {
		return getArtemisGlobals().music;
	}
	if (trimmed.match(/sbs\.play_audio_file\([ \d\w]+\, */)) {
		return cache.getMusicFiles();
	}

	// Get signal routes
	if (trimmed.startsWith("//signal/") || trimmed.startsWith("//shared/singal/") || trimmed.startsWith("on signal")) {
		const signals = cache.getSignals();
		return buildSignalInfoListAsCompletionItems(signals);
	}

	// Route Label autocompletion
	if(trimmed.includes("//")) {
		let route = trimmed.substring(trimmed.indexOf("//"));
		// If this is a route label, but NOT anything after it, then we only return route labels
		if (!route.trim().includes(" ")) {
			debug("Getting regular route labels")
			let routes = cache.getUsedRoutes(route);
			for (const r of routes) {
				let updatedRoute = r.replace(trimmed,"");
				const c: CompletionItem = {
					label: updatedRoute,
					kind: CompletionItemKind.Event,
					labelDetails: {description: "Route Label"}
				}
				ci.push(c);
			}
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
	} else if (trimmed.startsWith("@")) {
		ci = cache.getMediaLabels();
		return ci;
	}
//#endregion

//#region COMMS Stuff
	debug("Comms stuff");
	/**
 	* 	□ All
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
//#endregion

//#region Label Metadata Completions
	// debug("Label metadata")
	// // Check if there is a label at the end of these, which could include optional data
	// if ((trimmed.startsWith("+")||trimmed.startsWith("*")||trimmed.startsWith("jump")||trimmed.startsWith("->")) && !trimmed.endsWith(":")) {
	// 	let lbl = iStr.replace(/{.*?}/,"");
	// 	if (lbl.includes("{")) {
	// 		lbl = iStr.replace(/{.*?(}|$)/gm,"").trim();
	// 		debug(lbl);
	// 		let labels = cache.getLabels(text);
	// 		labels = labels.concat(getMainLabelAtPos(pos,labels).subLabels);
	// 		for (const l of labels) {
	// 			if (lbl.endsWith(l.name)) {
	// 				const keys = getLabelMetadataKeys(l);
	// 				for (const k of keys) {
	// 					const c: CompletionItem = {
	// 						label: k[0],
	// 						kind: CompletionItemKind.Text,
	// 						insertText: "\"" + k[0] + "\": "
	// 					}
	// 					if (k[1] !== "") {
	// 						c.documentation = "Default value: " + k[1];
	// 					}
	// 					ci.push(c);
	// 				}
	// 				return ci;
	// 			}
	// 		}
	// 	}
	// }
//#endregion

//#region JUMP Completions
	debug("JUMPs")
	// Handle label autocompletion
	let jump: RegExp = /(->|jump)[ \t]*[^\t ]*$/m;
	// if (jump.test(iStr) || iStr.endsWith("task_schedule( ") || iStr.endsWith("task_schedule (") || iStr.endsWith("objective_add(") || iStr.endsWith("brain_add(")) {
	if (jump.test(iStr)) {

		const labels = cache.getLabels(text);
		const currentFileLabels = cache.getLabels(text, true);
		const main = getMainLabelAtPos(pos, currentFileLabels);
		return getLabelsAsCompletionItems(text, labels, main);

		// let labelNames = cache.getLabels(text);
		// //debug(labelNames);
		// // Iterate over parent label info objects
		// for (const i in labelNames) {
		// 	if (labelNames[i].name === "main") continue;
		// 	if (labelNames[i].name.startsWith("//")) continue;
		// 	if (fixFileName(labelNames[i].srcFile) !== fixFileName(text.uri) && labelNames[i].name === "END") continue;
		// 	ci.push({documentation: buildLabelDocs(labelNames[i]),label: labelNames[i].name, kind: CompletionItemKind.Event, labelDetails: {description: path.basename(labelNames[i].srcFile)}});
		// }
		// labelNames = cache.getLabels(text, true);
		// const lbl = getMainLabelAtPos(startOfLine,labelNames);
		// if (lbl === undefined) {
		// 	return ci;
		// } else {
		// 	// Check for the parent label at this point (to get sublabels within the same parent)
		// 	if (lbl.srcFile === fixFileName(text.uri)) {
		// 		debug("same file name!");
		// 		let subs = lbl.subLabels;
		// 		debug(lbl.name);
		// 		debug(subs);
		// 		for (const i in subs) {
		// 			ci.push({documentation: buildLabelDocs(subs[i]),label: subs[i].name, kind: CompletionItemKind.Event, labelDetails: {description: "Sub-label of: " + lbl.name}});
		// 		}
		// 	}
		// 	return ci;
		// }
	}
//#endregion

	debug("Checking getCompletions");
	//debug(text.uri);
	//debug(ci);
	
//#region Class, Method, and Function Completions
	debug("Class, method, and function completions")
	// Check if this is a class
	debug(iStr);
	if (iStr.endsWith(".")) {
		debug("Getting Classes...");
		debug(iStr);
		// First we check if a class is being referenced.
		const classes = cache.getClasses();

		if (iStr.endsWith("'.") || iStr.endsWith('".')) {
			// Is a string, show string methods
			for (const c of classes) {
				if (c.name === "str") {
					return c.getMethodCompletionItems();
				}
			}
		}
		// debug(classes)
		for (const c of classes) {
			if (c.name === "sbs") {
				debug("THIS IS SBS");
				debug(c);
			}
			// debug(c);
			if (iStr.endsWith(" " + c.name + ".")) {
				debug(iStr + " contains " + c.name);
				// TODO: Only use labels with isClassMethod = true
				// c.methods[0].completionItem.kind == CompletionItemKind.Method;
				return c.getMethodCompletionItems();
			}
			if (iStr.endsWith("EVENT.") && c.name === "event") {
				return c.getMethodCompletionItems();
			}
		}
		// Then we assume it's an object, but we can't determine the type, so we iterate over all the classes.
		debug("It's an object, but don't know what class")
		for (const c of classes) {
			// debug(c.name);
			if (asClasses.includes(c.name)) continue;
			if (c.name.includes("Route")) continue;
			if (c.name === "event") continue;
			if (c.name === "sim") continue;
			// debug(c.name);
			for (const m of c.methods) {
				// Don't want to include constructors, this is for properties
				if (m.functionType === "constructor") continue;
				const mc: CompletionItem = m.buildCompletionItem();
				mc.label = "[" + c.name + "]." + m.name;
				// mc.label = c.name + "." + m.name;

				// If it's sim, convert back to simulation for this.
				let className = c.name;
				for (const cn of replaceNames) {
					if (className === cn[1]) className = cn[0];
				}
				// (mc.documentation as MarkupContent).value = "_Method of class: " + className + "_\n" + (mc.documentation as MarkupContent).value;
				ci.push(mc);
			}
			// Add properties.
			let props = c.buildVariableCompletionItemList();
			// debug(props);
			ci = ci.concat(props);
		}
		return ci;
	}
	debug("Not a class reference, checking functions...");
	const activeFunctionName = callContext?.functionName || func;
	debug(callContext?.functionName);
	debug(func)
	debug("Active function name: " + activeFunctionName);
	if (activeFunctionName) {
		debug("Active function: " + activeFunctionName);
		const callStart = iStr.lastIndexOf(activeFunctionName);
		let wholeFunc = callStart >= 0 ? iStr.substring(callStart) : iStr;
		const openParen = wholeFunc.indexOf("(");
		if (openParen >= 0) {
			wholeFunc = wholeFunc.substring(openParen);
		}

		// Add named-argument completions for parameters not yet explicitly used.
		const argNames = cache.getMethod(activeFunctionName) || cache.getPossibleMethods(activeFunctionName)[0];
		if (argNames) {
			debug(argNames.parameters)
			let defaultVal = /\=(.*?)$/;
			for (const a of argNames.parameters) {
				if (wholeFunc.includes(a.name+"=") || wholeFunc.includes(a.name+" =")) {
					continue;
				}
				const test = a.name.match(defaultVal);
				const name = a.name.replace(defaultVal,"");
				const c: CompletionItem = {
					label: a.name,
					kind: CompletionItemKind.TypeParameter,
					documentation: a.documentation,
					labelDetails: {description: "Argument Name"},
					sortText: "___"+name,
					insertText: name
				}
				if (test) {
					c.detail = test[1];
				}
				ci.push(c);
			}
		}

		const args: string[] = [];
		if (callContext?.parameterName) {
			args.push(callContext.parameterName);
		} else if (currentParamName) {
			args.push(currentParamName);
		}
		// Infer label argument for well-known MAST scheduling/control functions not in method cache
		if (args.length === 0 && callContext?.parameterIndex === 0) {
			if (activeFunctionName === 'task_schedule' || activeFunctionName === 'task_wait' ||
				activeFunctionName === 'objective_add' || activeFunctionName === 'brain_add') {
				args.push('label');
			}
		}

		// Get specific completions for each parameter
		for (const a of args) {
			let arg = a.replace(/=.*/,"").trim();
			if (arg === "label" || arg === "on_press") {
				let labelNames = cache.getLabels(text);
				const currentFileLabels = cache.getLabels(text, true);
				// Iterate over parent label info objects
				for (const i in labelNames) {
					if (labelNames[i].name === "main") continue;
					if (labelNames[i].name.startsWith("//")) continue;
					if (fixFileName(labelNames[i].srcFile) !== fixFileName(text.uri) && labelNames[i].name === "END") continue;
					ci.push({documentation: buildLabelDocs(labelNames[i]),label: labelNames[i].name, kind: CompletionItemKind.Event, labelDetails: {description: path.basename(labelNames[i].srcFile)}});
				}
				const lbl = getMainLabelAtPos(startOfLine, currentFileLabels);
				if (lbl === undefined) {
					debug("No label found at pos for sublabels");
					return ci;
				} else {
					// Check for the parent label at this point (to get sublabels within the same parent)
					if (lbl.srcFile === fixFileName(text.uri)) {
						debug("same file name!");
						let subs = lbl.subLabels;
						debug(lbl.name);
						debug(subs);
						for (const i in subs) {
							ci.push({documentation: buildLabelDocs(subs[i]),label: subs[i].name, kind: CompletionItemKind.Event, labelDetails: {description: "Sub-label of: " + lbl.name}});
						}
					}
					return ci;
				}
			}
			if (arg === "data") {
				debug("Data argument found.")
				let labelStr = callStart >= 0 ? iStr.substring(callStart + activeFunctionName.length) : iStr;
				if (!labelStr.includes("{")) continue;
				labelStr = labelStr.replace(/{.*?(}|$)/m,"");
				// Get all labels, including sublabels of the current main label
				let labels = cache.getLabels(text);
				let main = getMainLabelAtPos(pos,labels);
				labels = labels.concat(main.subLabels);

				// Iterate over all the labels.
				for (const label of labels) {
					// If the name matches, return the metadata for that label, if any.
					if (labelStr.includes(label.name)) {
						const keys = getLabelMetadataKeys(label, text, tokens);
						for (const k of keys) {
							const c: CompletionItem = {
								label: k[0],
								kind: CompletionItemKind.Text,
								insertText: "\"" + k[0] + "\":",
								sortText: "____" + label
							}
							if (k[1] !== "") {
								c.documentation = "Default value: " + k[1];
							}
							ci.push(c);
						}
						// return ci;
					}
				}
			}
			if (arg === "icon_index") {
				let iconList = getArtemisGlobals().gridIcons;
				for (const i of iconList) {
					const docs: MarkupContent = {
						kind: "markdown",
						value: "![" + path.basename(i.filePath) + "](/" + i.filePath + ")"
					}
					const item: CompletionItem = {
						label: i.index,
						documentation: docs,
						kind: CompletionItemKind.File			
					}
					ci.push(item);
				}
				return ci;
			}
			if (arg === "broad_type") {
				const bits = [
					{
						name: "TERRAIN",
						value: "0x01"
					},
					{
						name: "NPC",
						value: "0x10",
					},
					{
						name: "PLAYER",
						value: "0x20",
					},
					{
						name: "ALL",
						value: "0xffff",
					},
					{
						name: "NPC_AND_PLAYER",
						value: "0x30",
					},
					{
						name: "DEFAULT",
						value: "0xFFF0"
					}
				]
				for (const bit of bits) {
					const item: CompletionItem = {
						label: bit.value + " -> " + bit.name,
						insertText: bit.value.toString(),
						kind: CompletionItemKind.EnumMember
					}
					ci.push(item);
				}
				return ci;
			}
			if (arg === "link_name" || arg === "link") {
				const links = cache.getLinks();
				ci = ci.concat(getWordsAsCompletionItems("Link",links, text));
				return ci;
			}
		}
	}
//#endregion

	//debug(ci.length);
	

//#region Keywords and Variables
	debug("Keywords and Variables")
	//#region Line Start Keywords
	if (trimmed.match(/[\t ]*\w*/)) {
		let line_start_keywords : string[] = [
			// "def", // Pretty sure we can't define functions in a mast file
			"async",
			"on change",
			"on signal",
			"await",
			"import",
			"if",
			"else",
			"match",
			"case",
			"yield",
			"pass",
			"with"
		]
		// Add keywords to completions
		for (const key of line_start_keywords) {
			let i: CompletionItem = {
				label: key,
				kind: CompletionItemKind.Keyword
			}
			ci.push(i);
		}
		for (const key of variableModifiers) {
			let i: CompletionItem = {
				label: key[0],
				kind: CompletionItemKind.Keyword,
				detail: key[1]
			}
			ci.push(i);
		}
		const metadata:CompletionItem = {
			label: "metadata",
			kind: CompletionItemKind.Variable,
			insertText: "metadata: ```\n\n```"
		}
		ci.push(metadata);
	}
	//#endregion


	let values = [
		"None",
		"True",
		"False"
	];
	for (const key of values) {
		let i: CompletionItem = {
			label: key,
			kind: CompletionItemKind.Keyword,
			sortText: "____" + key
		}
		ci.push(i);
	}

	// Add Route-specific variables, e.g. COLLISION_ID or SCIENCE_TARGET
	const lbl = getMainLabelAtPos(pos,cache.getMastFile(text.uri).labelNames);
	// debug("Main label at pos: ");
	// debug(lbl)
	if (lbl.type === "route") {
		// if (!iStr.trim().startsWith("//")) {
			const vars = getRouteLabelVars(lbl.name);
			for (const s of vars) {
				const c: CompletionItem = {
					label: s,
					kind: CompletionItemKind.EnumMember,
					labelDetails: {description: "Route-specific Variable"},
					sortText: "__"+ s
				}
				ci.push(c);
			}
		// }
	} else {
		// If it's a main or inline label
		const keys = getLabelMetadataKeys(lbl, text, tokens);
		for (const k of keys) {
			const c: CompletionItem = {
				label: k[0],
				kind: CompletionItemKind.Text,
				insertText: k[0],
				sortText: "__" + k[0]
			}
			if (k[1] !== "") {
				c.documentation = "Default value: " + k[1];
			}
			ci.push(c);
		}
	}
	

	// Add variable names to autocomplete list
	// TODO: Add variables from other files in scope?
	let variables: CompletionItem[] = [];
	try {
		variables = cache.getVariableCompletionItems(text);
	} catch(e) {
		debug(e);
	}
	// debug("Variables parsed.");
	// debug(variables)
	ci = ci.concat(variables);
	// ci = ci.concat(cache.getMethods());
//#endregion


	// for (const m of cache.getMethods()) {
	// 	if (m.name.includes("gui")) {
	// 		debug(m);
	// 	}
	// 	ci.push(m.buildCompletionItem());
	// }

	ci = ci.concat(cache.getCompletions()); // TODO: What does this even do?

	// debug(iStr);
	debug(ci.length);

	// TODO: Account for text that's already present?? I don't think that's necessary
	// - Remove the text from the start of the completion item label
	return ci;
}

/**
 * Get the name of the current named argument, if it exists.
 * @param str The string from the start of the line until the cursor's current position.
 * @returns The name of the arguemnt, or undefined.
 */
export function findNamedArg(str:string): string|undefined {
	let ret = undefined;
	let name = /(?:[^\w])(\w+)=/g;
	let rm = str.match(name);
	let m: RegExpExecArray|null;
	while(m = name.exec(str)) {
		// Go until the last index
		ret = m[1];
	}
	return ret;
}

function inferCurrentMethodName(iStr: string): string {
	let working = iStr;
	let t: RegExpMatchArray | null;
	t = working.match(/\w+\(([^\(\)])*\)/g);
	while (t) {
		let s = working.indexOf(t[0]);
		let r: CRange = {
			start: s,
			end: t[0].length + s
		};
		working = replaceRegexMatchWithUnderscore(working, r);
		t = working.match(/\w+\(([^\(\)])*\)/g);
	}
	let last = working.lastIndexOf("(");
	if (last < 0) return "";
	return getHoveredSymbol(working, last);
}

function getInventoryKeysForFile(cache: MissionCache, text: TextDocument): CompletionItem[] {
	let keys = cache.getInventoryKeys(text.uri);
	// debug(keys);
	// ci = getKeysAsCompletionItem(keys);
	let ci = getWordsAsCompletionItems("Inventory Key", keys, text)
	return ci;
}

function getAllBlobKeys(cache: MissionCache, text: TextDocument): CompletionItem[] {
	const blobs = getArtemisGlobals().blob_items;
	for (const bk of cache.getBlobKeys()) {
		let find = blobs.find(key=>{
			return key.label === bk.name;
		});
		// debug(find);
		if (find !== undefined) {
			continue;
		}
		debug("Blob not found: " + bk.name)
		let ci:CompletionItem = {
			label: bk.name,
			kind: CompletionItemKind.Text,
			documentation: "",
			detail: "Type: Unknown"
		}
		blobs.push(ci);
	}
	return blobs;
}
