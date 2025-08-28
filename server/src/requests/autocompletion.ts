import { debug } from 'console';
import { CompletionItem, CompletionItemKind, integer, MarkupContent, SignatureInformation, TextDocumentPositionParams } from 'vscode-languageserver';
import { buildLabelDocs, getLabelMetadataKeys, getLabelsAsCompletionItems, getMainLabelAtPos } from './../tokens/labels';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { asClasses, replaceNames } from './../data';
import { getRouteLabelVars } from './../tokens/routeLabels';
import { isInComment, isInString, isInYaml, isTextInBracket, replaceRegexMatchWithUnderscore } from './../tokens/comments';
import { getCache } from './../cache';
import path = require('path');
import { fixFileName, getFilesInDir } from './../fileFunctions';
import { getGlobals } from './../globals';
import { getCurrentMethodName } from './signatureHelp';
import { getKeysAsCompletionItem, getRolesAsCompletionItem, getRolesForFile } from './../tokens/roles';
import { variableModifiers } from './../tokens/variables';
import { isClassMethod, isFunction } from './../tokens/tokens';
import { Function } from './../data/function';
import { getCurrentLineFromTextDocument } from './hover';
import { countMatches } from './../rx';
import { showProgressBar } from './../server';
import { blob } from 'stream/consumers';
import { buildSignalInfoListAsCompletionItems } from './../tokens/signals';

// https://stackoverflow.com/questions/78755236/how-can-i-prioritize-vs-code-extension-code-completion

let currentLine = 0;
let routeCompletions: CompletionItem[] = [];

export function onCompletion(_textDocumentPosition: TextDocumentPositionParams, text: TextDocument): CompletionItem[] {
	// return buildFaction("kra","Kralien_Set");
	debug("Staring onCompletion");
	const cache = getCache(text.uri);
	// return getGlobals().artFiles;
	// This updates the file's info with any new info from other files.
	if (!getGlobals().isCurrentFile(text.uri)) {
		showProgressBar(true);
		cache.updateFileInfo(text);
		getGlobals().setCurrentFile(text.uri);
		showProgressBar(false);
	}
	
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
	// const eolPos: Position = _textDocumentPosition.position;
	// eolPos.line += 1;
	// eolPos.character = 0;
	// const endOfLine: integer = pos + text.offsetAt(eolPos)-1;
	const iStr : string = t.substring(startOfLine,pos);
	// const eStr: string = t.substring(pos, endOfLine);
	// const line = iStr + eStr;
	const line = getCurrentLineFromTextDocument(_textDocumentPosition.position, text)
	debug(line);
	const eStr = line.replace(iStr,"");
	debug(iStr)
	// debug(eStr);
	// if (iStr.endsWith("/") && !iStr.endsWith("//")) {
	// 	return routeCompletions;
	// }
	// debug(iStr);
	// if (iStr.includes("(")) {
	// 	let arg = getCurrentArgumentNames(iStr,text);
	// 	debug(arg);
	// }
	
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
	

	// If we're inside a comment or a string, we don't want autocompletion.
	if (isInComment(text,pos)) {
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
	
	if (isInYaml(text,pos)) {
		debug("Is in Yaml")
		ci = ci.concat(cache.getCompletions());
		return ci;
	}

	// TODO: Check and make absolutely sure that isTextInBracket is working properly
	// TODO: May be useful to have a list of used string words that can be added via autocomplete (i.e. roles)
	// TODO: Faces: Add ability to get the desired image from tiles: https://stackoverflow.com/questions/11533606/javascript-splitting-a-tileset-image-to-be-stored-in-2d-image-array


// TODO: Verify that this isn't necessary, should not be if validate.js is working as intended
	// if (iStr.endsWith("\"") || iStr.endsWith("'")) {
	// 	debug("Updating strings...")
	// 	parseStrings(text);
	// }


//#region In-String Completions
	// This is to get rid of " or ' at end so we don't have to check for both
	const blobStr = iStr.substring(0,iStr.length-1);
	// debug(blobStr)
	// Check if there's an odd number of quotes, if it starts with quotes, or is within a string
	// TODO: this doesn't account for f-strings....
	if (countMatches(iStr,/[\"']/g) % 2 !== 0 || iStr.endsWith("\"") || iStr.endsWith("'") || isInString(text,pos)) {
		debug("Is in string (probably)")
		if (blobStr.endsWith("signal_emit(")) {
			const signals = cache.getSignals();
			return buildSignalInfoListAsCompletionItems(signals);
		}
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

			// Now for inventory keys
			if (getCurrentMethodName(iStr).includes("inventory")) {
				let keys = cache.getKeys(text.uri);
				debug(keys);
				ci = getKeysAsCompletionItem(keys);
				return ci;
			}

			// Here we check for stylestrings, art_ids, etc.
			
			const func = getCurrentMethodName(iStr);
			const sig: SignatureInformation|undefined = getCache(text.uri).getSignatureOfMethod(func);
			const fstart = iStr.lastIndexOf(func);
			const wholeFunc = iStr.substring(fstart,iStr.length);
			const arr = wholeFunc.split(",");
			let named = /(\w+)\=$/m;
			let test = blobStr.match(named);
			let args = [];
			if (test) {
				args = [test[1]];
			} else {
				args = getCurrentArgumentNames(iStr,text);
			}
			debug("Current function: " + func);
			debug("arg: " + args);
			for (const a of args) {
				if (a === "role" || a === "roles") {
					debug("Getting roles")
					let roles = getRolesForFile(t);
					roles = roles.concat(cache.getRoles(text.uri));
					roles = roles.concat(getGlobals().shipData.roles);
					ci = getRolesAsCompletionItem(roles);
				return ci;
				}
				if (a === "style") {
					debug("Style found; iterating over widget stylestrings");
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
					if (ci.length > 0) return ci;
					for (const s of cache.styleDefinitions) {
						const c: CompletionItem = {
							label: s,
							kind: CompletionItemKind.Text,
							insertText: s + ": "
						}
						if (c.label.includes("color")) {
							c.insertText = c.insertText + "#"
						}
						ci.push(c);
					}
					return ci;
				}
				if (a === "descriptorString") {
					if (func.includes("particle")) {
						for (const arg of getGlobals().widget_stylestrings) {
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
				if (a === "art_id" || a === "art") {
					// ci = getGlobals().shipData.getCompletionItemsForShips();
					ci = [];
					const ships = getGlobals().shipData.ships;
					for (const ship of ships) {
						ci.push(ship.completionItem);
					}
					return ci;
				}
				if (a === "key") {
					if (func.endsWith("data_set_value")) {
						return getGlobals().blob_items;
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
						"behav_mine",
						"behav_maelstrom",
						"behav_pickup",
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
					const main = getMainLabelAtPos(pos, labels);
					return getLabelsAsCompletionItems(text, labels, main).concat(ci);
				}
				// If it even just INCLUDES "widget", then we'll try to add it.
				if (a.includes("widget")) {
					const widgets = getGlobals().widgets;
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
			}

			debug("Is in string");
			return ci;
		}
	}
//#endregion

	// If we're defining a label, we don't want autocomplete.
	// TODO: ++ labels should have specific names
	if (iStr.trim().startsWith("--") || iStr.trim().startsWith("==") || iStr.trim().startsWith("++")) {
		return ci;
	}

	let trimmed = iStr.trim();
	

//#region Route and Media Labels 
	// Media labels only get the skybox names
	if (iStr.endsWith("@media/skybox/")) {
		return getGlobals().skyboxes;
	// Get Music Options (default vs Artemis2)
	} else if (iStr.endsWith("@media/music/")) {
		return getGlobals().music;
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
	// Check if there is a label at the end of these, which could include optional data
	if ((trimmed.startsWith("+")||trimmed.startsWith("*")||trimmed.startsWith("jump")||trimmed.startsWith("->")) && !trimmed.endsWith(":")) {
		let lbl = iStr.replace(/{.*?}/,"");
		if (lbl.includes("{")) {
			lbl = iStr.replace(/{.*?(}|$)/gm,"").trim();
			debug(lbl);
			let labels = cache.getLabels(text);
			labels = labels.concat(getMainLabelAtPos(pos,labels).subLabels);
			for (const l of labels) {
				if (lbl.endsWith(l.name)) {
					const keys = getLabelMetadataKeys(l);
					for (const k of keys) {
						const c: CompletionItem = {
							label: k[0],
							kind: CompletionItemKind.Text,
							insertText: "\"" + k[0] + "\": "
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
	}
//#endregion

//#region JUMP Completions
	// Handle label autocompletion
	let jump: RegExp = /(->|jump)[ \t]*[^\t ]*$/m;
	// if (jump.test(iStr) || iStr.endsWith("task_schedule( ") || iStr.endsWith("task_schedule (") || iStr.endsWith("objective_add(") || iStr.endsWith("brain_add(")) {
	if (jump.test(iStr)) {

		const labels = cache.getLabels(text);
		const main = getMainLabelAtPos(pos, labels);
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
	// Check if this is a class
	if (iStr.endsWith(".")) {
		debug("Getting Classes...");
		debug(iStr);
		// First we check if a class is being referenced.
		const classes = cache.getClasses();
		for (const c of classes) {
			if (c.name === "sbs") {
				debug("THIS IS SBS");
				debug(c);
			}
			// debug(c);
			if (iStr.endsWith(c.name + ".")) {
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
		for (const c of classes) {
			// debug(c.name);
			if (asClasses.includes(c.name)) continue;
			if (c.name.includes("Route")) continue;
			if (c.name === "event") continue;
			if (c.name === "sim") continue;
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
			debug(props);
			ci = ci.concat(props);
		}
		return ci;
	}

	const cm = getCurrentMethodName(iStr)
	let wholeFunc = iStr.substring(iStr.lastIndexOf(cm));
	wholeFunc = wholeFunc.substring(wholeFunc.indexOf("("));
	if (isFunction(iStr, cm)) {
		// Check for named argument
		let named = /(\w+)\=$/m;
		let test = iStr.match(named);
		let args = [];
		if (test) {
			args = [test[1]];
		} else {
			args = getCurrentArgumentNames(iStr,text);

			// Add the argument names
			// Don't want to do this with a named argument
			const argNames = cache.getMethod(cm);
			if (argNames) {
				debug(argNames.parameters)
				let defaultVal = /\=(.*?)$/;
				for (const a of argNames.parameters) {
					// If the argument is already used in the function call, don't include it
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
						insertText: name // TODO: Add '=' and trigger completions
					}
					if (test) {
						c.detail = test[1];	
					}

					debug(c);
					ci.push(c);
				}
			}
		}

		// Get specific completions for each parameter
		for (const a of args) {
			let arg = a.replace(/=\w+/,"");
			if (arg === "label" || arg === "on_press") {
				let labelNames = cache.getLabels(text);
				// Iterate over parent label info objects
				for (const i in labelNames) {
					if (labelNames[i].name === "main") continue;
					if (labelNames[i].name.startsWith("//")) continue;
					if (fixFileName(labelNames[i].srcFile) !== fixFileName(text.uri) && labelNames[i].name === "END") continue;
					ci.push({documentation: buildLabelDocs(labelNames[i]),label: labelNames[i].name, kind: CompletionItemKind.Event, labelDetails: {description: path.basename(labelNames[i].srcFile)}});
				}
				const lbl = getMainLabelAtPos(startOfLine,labelNames);
				if (lbl === undefined) {
					return [];
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
				let labelStr = iStr.substring(iStr.lastIndexOf(cm)+cm.length);
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
						const keys = getLabelMetadataKeys(label);
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
				let iconList = getGlobals().gridIcons;
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
		}
	}
//#endregion

	//debug(ci.length);
	ci = ci.concat(cache.getCompletions()); // TODO: What does this even do?

//#region Keywords and Variables
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
			kind: CompletionItemKind.Keyword
		}
		ci.push(i);
	}

	// Add Route-specific variables, e.g. COLLISION_ID or SCIENCE_TARGET
	const lbl = getMainLabelAtPos(pos,cache.getMastFile(text.uri).labelNames);
	debug("Main label at pos: ");
	debug(lbl)
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
		const keys = getLabelMetadataKeys(lbl);
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
	debug("Variables parsed.");
	// debug(variables)
	ci = ci.concat(variables);
	// ci = ci.concat(cache.getMethods());
//#endregion


	//debug(ci.length);
	//ci = ci.concat(defaultFunctionCompletionItems);
	for (const m of cache.getMethods()) {
		ci.push(m.buildCompletionItem());
	}
	// TODO: Account for text that's already present?? I don't think that's necessary
	// - Remove the text from the start of the completion item label
	return ci;
}

export function getCurrentArgumentNames(iStr:string, doc:TextDocument): string[] {
	let ret: string[] = [];
	if (iStr.endsWith("=")) {
		debug(iStr)
		let name = /(?:[^\w])(\w+)=$/m;
		let rm = iStr.match(name);
		if (rm !== null) {
			ret.push(rm[1]);
			return ret;
		}
	}
	const func = getCurrentMethodName(iStr);
	const fstart = iStr.lastIndexOf(func);
	let wholeFunc = iStr.substring(fstart,iStr.length);
	let obj = /{.*?(}|$)/gm;
	wholeFunc = wholeFunc.replace(obj, "_")
	wholeFunc = wholeFunc.replace(/(?<quote>[\"']).*?(\k<quote>)/g, "_");
	const doublequotes = countMatches(wholeFunc, /\"/g);
	const singleQuotes = countMatches(wholeFunc, /'/g);
	if (doublequotes % 2 !== 0) {
		const last = wholeFunc.lastIndexOf("\"")
		wholeFunc = replaceRegexMatchWithUnderscore(wholeFunc, {start: last, end: wholeFunc.length});
	}
	if (singleQuotes % 2 !== 0) {
		const last = wholeFunc.lastIndexOf("\"")
		wholeFunc = replaceRegexMatchWithUnderscore(wholeFunc, {start: last, end: wholeFunc.length});
	}
	const arr = wholeFunc.split(",");
	const paramNumber = arr.length-1;
	let methods:Function[]=[];
	debug(func);
	if (isClassMethod(wholeFunc,fstart)) {
		debug("class method")
		methods = getCache(doc.uri).getPossibleMethods(func);
	} else {
		debug("Not class method")
		let f = getCache(doc.uri).getMethod(func);
		if (f !== undefined) methods.push(f);
	}
	for (const m of methods) {
		let p = m.parameters[paramNumber];
		let name = p.name.replace(/=.*/,"").trim();
		ret.push(name);
	}
	return ret;
}

function getCompletionsForMethodParameters(iStr:string, paramName: string, doc:TextDocument, pos:integer): CompletionItem[] {
	let ci:CompletionItem[] = [];
	const func = getCurrentMethodName(iStr);
	const fstart = iStr.lastIndexOf(func);
	const wholeFunc = iStr.substring(fstart,iStr.length);
	const arr = wholeFunc.split(",");
	const paramNumber = arr.length-1;
	const method = getCache(doc.uri).getMethod(func);
	if (method !== undefined) {
		let p = method.parameters[paramNumber];
			if (paramName === p.name) {
				// Now we iterate over all the possible optiosn
				if (paramName === "style") {
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
				} else if (paramName === "art_id") {
					// Get all possible art files
					return getGlobals().artFiles;
				} else if (paramName === 'art') {
					return getGlobals().artFiles;
				} else if (paramName === "label") {
					const cache = getCache(doc.uri);
					let labels = cache.getMastFile(doc.uri).labelNames;
					const main = getMainLabelAtPos(pos,labels);
					labels = cache.getLabels(doc);
					const subs = main.subLabels;
					for (const l of subs) {
						ci.push({
							documentation: buildLabelDocs(l),
							label: l.name, 
							kind: CompletionItemKind.Event, 
							labelDetails: {
								description: "Sub-label of: " + main.name
							}
						});
					}
					for (const l of labels) {
						ci.push({
							documentation: buildLabelDocs(l),
							label: l.name, 
							kind: CompletionItemKind.Event, 
							labelDetails: {
								description: path.basename(l.srcFile)
							}
						});
					}
				}
			}
	}
	return ci;
}


function getCompletionsForMethodParams(iStr:string, paramName: string, doc:TextDocument): CompletionItem[] {
	let ci:CompletionItem[] = [];
	const func = getCurrentMethodName(iStr);
	const sig: SignatureInformation|undefined = getCache(doc.uri).getSignatureOfMethod(func);
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
				} else if (sig.parameters[i].label === "label") {

				}
			}
		}
	}
	return ci;
}