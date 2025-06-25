"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCompletion = onCompletion;
exports.getCurrentArgumentNames = getCurrentArgumentNames;
const console_1 = require("console");
const vscode_languageserver_1 = require("vscode-languageserver");
const labels_1 = require("./tokens/labels");
const data_1 = require("./data");
const routeLabels_1 = require("./tokens/routeLabels");
const comments_1 = require("./tokens/comments");
const cache_1 = require("./cache");
const path = require("path");
const fileFunctions_1 = require("./fileFunctions");
const globals_1 = require("./globals");
const signatureHelp_1 = require("./signatureHelp");
const roles_1 = require("./tokens/roles");
const variables_1 = require("./tokens/variables");
const tokens_1 = require("./tokens/tokens");
const hover_1 = require("./hover");
const rx_1 = require("./rx");
const server_1 = require("./server");
let currentLine = 0;
function onCompletion(_textDocumentPosition, text) {
    // return buildFaction("kra","Kralien_Set");
    (0, console_1.debug)("Staring onCompletion");
    const cache = (0, cache_1.getCache)(text.uri);
    // return getGlobals().artFiles;
    // This updates the file's info with any new info from other files.
    if (!(0, globals_1.getGlobals)().isCurrentFile(text.uri)) {
        (0, server_1.showProgressBar)(true);
        cache.updateFileInfo(text);
        (0, globals_1.getGlobals)().setCurrentFile(text.uri);
        (0, server_1.showProgressBar)(false);
    }
    let ci = [];
    (0, console_1.debug)("Cache loaded.");
    const t = text?.getText();
    if (text === undefined) {
        (0, console_1.debug)("Document ref is undefined");
        return ci;
    }
    if (t === undefined) {
        (0, console_1.debug)("Document text is undefined");
        return ci;
    }
    // Calculate the position in the text's string value using the Position value.
    const pos = text.offsetAt(_textDocumentPosition.position);
    const startOfLine = pos - _textDocumentPosition.position.character;
    // const eolPos: Position = _textDocumentPosition.position;
    // eolPos.line += 1;
    // eolPos.character = 0;
    // const endOfLine: integer = pos + text.offsetAt(eolPos)-1;
    const iStr = t.substring(startOfLine, pos);
    // const eStr: string = t.substring(pos, endOfLine);
    // const line = iStr + eStr;
    const line = (0, hover_1.getCurrentLineFromTextDocument)(_textDocumentPosition.position, text);
    (0, console_1.debug)(line);
    const eStr = line.replace(iStr, "");
    (0, console_1.debug)(iStr);
    (0, console_1.debug)(eStr);
    // debug(iStr);
    // if (iStr.includes("(")) {
    // 	let arg = getCurrentArgumentNames(iStr,text);
    // 	debug(arg);
    // }
    if ((0, fileFunctions_1.fixFileName)(text.uri).endsWith("__init__.mast")) {
        if (iStr.trim() === "") {
            return [{ label: "import", kind: vscode_languageserver_1.CompletionItemKind.Keyword }];
        }
        else if (iStr.trim().startsWith("import")) {
            const files = (0, fileFunctions_1.getFilesInDir)(path.dirname((0, fileFunctions_1.fixFileName)(text.uri)));
            for (const f of files) {
                if (!f.endsWith("__init__.mast")) {
                    if (!t.includes(path.basename(f))) {
                        const c = {
                            label: path.basename(f),
                            kind: vscode_languageserver_1.CompletionItemKind.File
                        };
                        ci.push(c);
                    }
                }
            }
        }
        return ci;
    }
    else {
        // debug("NOT an init file");
    }
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
            const c = {
                label: r[0],
                kind: vscode_languageserver_1.CompletionItemKind.Constant
            };
            if (r[1] !== undefined) {
                c.detail = r[1];
            }
            ci.push(c);
        }
        return ci;
    }
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
    if ((0, comments_1.isInComment)(text, pos)) {
        (0, console_1.debug)("Is in Comment");
        return ci;
    }
    if ((0, comments_1.isInYaml)(text, pos)) {
        (0, console_1.debug)("Is in Yaml");
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
    // This is to get rid of " or ' at end so we don't have to check for both
    const blobStr = iStr.substring(0, iStr.length - 1);
    // debug(blobStr)
    // Check if there's an odd number of quotes, if it starts with quotes, or is within a string
    // TODO: this doesn't account for f-strings....
    if ((0, rx_1.countMatches)(iStr, /[\"']/g) % 2 !== 0 || iStr.endsWith("\"") || iStr.endsWith("'") || (0, comments_1.isInString)(text, pos)) {
        (0, console_1.debug)("Is in string (probably)");
        if (!(0, comments_1.isTextInBracket)(iStr, pos)) {
            // Here we check for blob info
            if (blobStr.endsWith(".set(") || blobStr.endsWith(".get(")) {
                (0, console_1.debug)("Is BLobe");
                return (0, globals_1.getGlobals)().blob_items;
            }
            // Here we check for roles
            if (blobStr.endsWith("role(") || blobStr.endsWith("roles(")) {
                (0, console_1.debug)("Getting roles");
                let roles = (0, roles_1.getRolesForFile)(t);
                roles = roles.concat(cache.getRoles(text.uri));
                roles = roles.concat((0, globals_1.getGlobals)().shipData.roles);
                ci = (0, roles_1.getRolesAsCompletionItem)(roles);
                return ci;
            }
            // Now for inventory keys
            if ((0, signatureHelp_1.getCurrentMethodName)(iStr).includes("inventory")) {
                let keys = cache.getKeys(text.uri);
                ci = (0, roles_1.getKeysAsCompletionItem)(keys);
                return ci;
            }
            // Here we check for stylestrings, art_ids, etc.
            const func = (0, signatureHelp_1.getCurrentMethodName)(iStr);
            const sig = (0, cache_1.getCache)(text.uri).getSignatureOfMethod(func);
            const fstart = iStr.lastIndexOf(func);
            const wholeFunc = iStr.substring(fstart, iStr.length);
            const arr = wholeFunc.split(",");
            const args = getCurrentArgumentNames(iStr, text);
            (0, console_1.debug)("Current function: " + func);
            (0, console_1.debug)("arg: " + args);
            for (const a of args) {
                if (a === "role" || a === "roles") {
                    (0, console_1.debug)("Getting roles");
                    let roles = (0, roles_1.getRolesForFile)(t);
                    roles = roles.concat(cache.getRoles(text.uri));
                    roles = roles.concat((0, globals_1.getGlobals)().shipData.roles);
                    ci = (0, roles_1.getRolesAsCompletionItem)(roles);
                    return ci;
                }
                if (a === "style") {
                    (0, console_1.debug)("Style found; iterating over widget stylestrings");
                    for (const s of (0, globals_1.getGlobals)().widget_stylestrings) {
                        if (func === s.function) {
                            const c = {
                                label: s.name,
                                //labelDetails: {detail: s.docs},
                                documentation: s.docs,
                                kind: vscode_languageserver_1.CompletionItemKind.Text,
                                insertText: s.name + ": "
                            };
                            if (c.label === "color") {
                                c.insertText = c.insertText + "#";
                            }
                            ci.push(c);
                        }
                    }
                    if (ci.length > 0)
                        return ci;
                    for (const s of cache.styleDefinitions) {
                        const c = {
                            label: s,
                            kind: vscode_languageserver_1.CompletionItemKind.Text,
                            insertText: s + ": "
                        };
                        if (c.label.includes("color")) {
                            c.insertText = c.insertText + "#";
                        }
                        ci.push(c);
                    }
                    return ci;
                }
                if (a === "art_id" || a === "art") {
                    // ci = getGlobals().shipData.getCompletionItemsForShips();
                    ci = [];
                    const ships = (0, globals_1.getGlobals)().shipData.ships;
                    for (const ship of ships) {
                        ci.push(ship.completionItem);
                    }
                    return ci;
                }
                if (a === "key") {
                    if (func.endsWith("data_set_value")) {
                        return (0, globals_1.getGlobals)().blob_items;
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
                    ];
                    for (const b of behaves) {
                        const c = {
                            label: b,
                            kind: vscode_languageserver_1.CompletionItemKind.Text
                        };
                        ci.push(c);
                    }
                    return ci;
                }
            }
            // if (sig !== undefined) {
            // 	if (sig.parameters !== undefined) {
            // 		for (const i in sig.parameters) {
            // 			if (i !== ""+(arr.length-1)) continue;
            // 			if (sig.parameters[i].label === "style") {
            // 				for (const s of getGlobals().widget_stylestrings) {
            // 					if (func === s.function) {
            // 						const c = {
            // 							label: s.name,
            // 							//labelDetails: {detail: s.docs},
            // 							documentation: s.docs,
            // 							kind: CompletionItemKind.Text,
            // 							insertText: s.name + ": "
            // 						}
            // 						if (c.label === "color") {
            // 							c.insertText = c.insertText + "#"
            // 						}
            // 						ci.push(c)
            // 					}
            // 				}
            // 			} else if (sig.parameters[i].label === "art_id") {
            // 				// Get all possible art files
            // 				return getGlobals().artFiles;
            // 			} else if (sig.parameters[i].label === 'art') {
            // 				return getGlobals().artFiles;
            // 			}
            // 		}
            // 	}
            // }
            // getCompletionsForMethodParameters(iStr,"style",text,pos);
            (0, console_1.debug)("Is in string");
            return ci;
        }
    }
    // If we're defining a label, we don't want autocomplete.
    // TODO: ++ labels should have specific names
    if (iStr.trim().startsWith("--") || iStr.trim().startsWith("==") || iStr.trim().startsWith("++")) {
        return ci;
    }
    let trimmed = iStr.trim();
    // Media labels only get the skybox names
    if (iStr.endsWith("@media/skybox/")) {
        return (0, globals_1.getGlobals)().skyboxes;
        // Get Music Options (default vs Artemis2)
    }
    else if (iStr.endsWith("@media/music/")) {
        return (0, globals_1.getGlobals)().music;
    }
    if (trimmed.match(/sbs\.play_audio_file\([ \d\w]+\, */)) {
        return cache.getMusicFiles();
    }
    // Route Label autocompletion
    if (trimmed.startsWith("//")) {
        // If this is a route label, but NOT anything after it, then we only return route labels
        if (!iStr.trim().includes(" ")) {
            (0, console_1.debug)("Getting regular route labels");
            ci = cache.getRouteLabels(); //getRouteLabelAutocompletions(iStr);
            return ci;
        }
        else {
            const route = iStr.trim().substring(0, iStr.trim().indexOf(" "));
            const rlvs = (0, routeLabels_1.getRouteLabelVars)(route);
            (0, console_1.debug)(rlvs);
            for (const s of rlvs) {
                const c = {
                    label: s,
                    kind: vscode_languageserver_1.CompletionItemKind.EnumMember,
                    labelDetails: { description: "Route-specific Variable" }
                };
                ci.push(c);
            }
        }
        // TODO: Add media, map, gui/tab, and console autocompletion items
    }
    else if (trimmed.startsWith("@")) {
        ci = cache.getMediaLabels();
        return ci;
    }
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
        ];
        ci = [];
        for (const i of comms) {
            const c = {
                label: i,
                insertText: i + ">",
                kind: vscode_languageserver_1.CompletionItemKind.Field,
                labelDetails: { description: "Comms Target" }
            };
            ci.push(c);
        }
        const c = {
            label: "<<",
            kind: vscode_languageserver_1.CompletionItemKind.Field,
            insertText: "<",
            labelDetails: { description: "Comms Target" }
        };
        ci.push(c);
        return ci;
    }
    // Check if there is a label at the end of these, which could include optional data
    if ((trimmed.startsWith("+") || trimmed.startsWith("*") || trimmed.startsWith("jump") || trimmed.startsWith("->")) && !trimmed.endsWith(":")) {
        let lbl = iStr.replace(/{.*?}/, "");
        if (lbl.includes("{")) {
            lbl = iStr.replace(/{.*?(}|$)/gm, "").trim();
            (0, console_1.debug)(lbl);
            let labels = cache.getLabels(text);
            labels = labels.concat((0, labels_1.getMainLabelAtPos)(pos, labels).subLabels);
            for (const l of labels) {
                if (lbl.endsWith(l.name)) {
                    const keys = (0, labels_1.getLabelMetadataKeys)(l);
                    for (const k of keys) {
                        const c = {
                            label: k[0],
                            kind: vscode_languageserver_1.CompletionItemKind.Text,
                            insertText: "\"" + k[0] + "\": "
                        };
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
    // Handle label autocompletion
    let jump = /(->|jump)[ \t]*[^\t ]*$/m;
    // if (jump.test(iStr) || iStr.endsWith("task_schedule( ") || iStr.endsWith("task_schedule (") || iStr.endsWith("objective_add(") || iStr.endsWith("brain_add(")) {
    if (jump.test(iStr)) {
        let labelNames = cache.getLabels(text);
        //debug(labelNames);
        // Iterate over parent label info objects
        for (const i in labelNames) {
            if (labelNames[i].name === "main")
                continue;
            if (labelNames[i].name.startsWith("//"))
                continue;
            if ((0, fileFunctions_1.fixFileName)(labelNames[i].srcFile) !== (0, fileFunctions_1.fixFileName)(text.uri) && labelNames[i].name === "END")
                continue;
            ci.push({ documentation: (0, labels_1.buildLabelDocs)(labelNames[i]), label: labelNames[i].name, kind: vscode_languageserver_1.CompletionItemKind.Event, labelDetails: { description: path.basename(labelNames[i].srcFile) } });
        }
        labelNames = cache.getLabels(text, true);
        const lbl = (0, labels_1.getMainLabelAtPos)(startOfLine, labelNames);
        if (lbl === undefined) {
            return ci;
        }
        else {
            // Check for the parent label at this point (to get sublabels within the same parent)
            if (lbl.srcFile === (0, fileFunctions_1.fixFileName)(text.uri)) {
                (0, console_1.debug)("same file name!");
                let subs = lbl.subLabels;
                (0, console_1.debug)(lbl.name);
                (0, console_1.debug)(subs);
                for (const i in subs) {
                    ci.push({ documentation: (0, labels_1.buildLabelDocs)(subs[i]), label: subs[i].name, kind: vscode_languageserver_1.CompletionItemKind.Event, labelDetails: { description: "Sub-label of: " + lbl.name } });
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
    (0, console_1.debug)("Checking getCompletions");
    //debug(text.uri);
    //debug(ci);
    // Check if this is a class
    if (iStr.endsWith(".")) {
        (0, console_1.debug)("Getting Classes...");
        (0, console_1.debug)(iStr);
        // First we check if a class is being referenced.
        const classes = cache.getClasses();
        for (const c of classes) {
            if (c.name === "sbs") {
                (0, console_1.debug)("THIS IS SBS");
                (0, console_1.debug)(c);
            }
            // debug(c);
            if (iStr.endsWith(c.name + ".")) {
                (0, console_1.debug)(iStr + " contains " + c.name);
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
            if (data_1.asClasses.includes(c.name))
                continue;
            if (c.name.includes("Route"))
                continue;
            if (c.name === "event")
                continue;
            if (c.name === "sim")
                continue;
            for (const m of c.methods) {
                // Don't want to include constructors, this is for properties
                if (m.functionType === "constructor")
                    continue;
                const mc = m.buildCompletionItem();
                mc.label = "[" + c.name + "]." + m.name;
                // mc.label = c.name + "." + m.name;
                // If it's sim, convert back to simulation for this.
                let className = c.name;
                for (const cn of data_1.replaceNames) {
                    if (className === cn[1])
                        className = cn[0];
                }
                // (mc.documentation as MarkupContent).value = "_Method of class: " + className + "_\n" + (mc.documentation as MarkupContent).value;
                ci.push(mc);
            }
        }
        return ci;
    }
    const cm = (0, signatureHelp_1.getCurrentMethodName)(iStr);
    if ((0, tokens_1.isFunction)(iStr, cm)) {
        const args = getCurrentArgumentNames(iStr, text);
        for (const a of args) {
            let arg = a.replace(/=\w+/, "");
            if (arg === "label") {
                let labelNames = cache.getLabels(text);
                // Iterate over parent label info objects
                for (const i in labelNames) {
                    if (labelNames[i].name === "main")
                        continue;
                    if (labelNames[i].name.startsWith("//"))
                        continue;
                    if ((0, fileFunctions_1.fixFileName)(labelNames[i].srcFile) !== (0, fileFunctions_1.fixFileName)(text.uri) && labelNames[i].name === "END")
                        continue;
                    ci.push({ documentation: (0, labels_1.buildLabelDocs)(labelNames[i]), label: labelNames[i].name, kind: vscode_languageserver_1.CompletionItemKind.Event, labelDetails: { description: path.basename(labelNames[i].srcFile) } });
                }
                const lbl = (0, labels_1.getMainLabelAtPos)(startOfLine, labelNames);
                if (lbl === undefined) {
                    return ci;
                }
                else {
                    // Check for the parent label at this point (to get sublabels within the same parent)
                    if (lbl.srcFile === (0, fileFunctions_1.fixFileName)(text.uri)) {
                        (0, console_1.debug)("same file name!");
                        let subs = lbl.subLabels;
                        (0, console_1.debug)(lbl.name);
                        (0, console_1.debug)(subs);
                        for (const i in subs) {
                            ci.push({ documentation: (0, labels_1.buildLabelDocs)(subs[i]), label: subs[i].name, kind: vscode_languageserver_1.CompletionItemKind.Event, labelDetails: { description: "Sub-label of: " + lbl.name } });
                        }
                    }
                    return ci;
                }
            }
            if (arg === "data") {
                (0, console_1.debug)("Data argument found.");
                let labelStr = iStr.substring(iStr.lastIndexOf(cm) + cm.length);
                if (!labelStr.includes("{"))
                    continue;
                labelStr = labelStr.replace(/{.*?(}|$)/m, "");
                // Get all labels, including sublabels of the current main label
                let labels = cache.getLabels(text);
                let main = (0, labels_1.getMainLabelAtPos)(pos, labels);
                labels = labels.concat(main.subLabels);
                // Iterate over all the labels.
                for (const label of labels) {
                    // If the name matches, return the metadata for that label, if any.
                    if (labelStr.includes(label.name)) {
                        const keys = (0, labels_1.getLabelMetadataKeys)(label);
                        for (const k of keys) {
                            const c = {
                                label: k[0],
                                kind: vscode_languageserver_1.CompletionItemKind.Text,
                                insertText: "\"" + k[0] + "\":"
                            };
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
    }
    //debug(ci.length);
    ci = ci.concat(cache.getCompletions());
    let keywords = [
        // "def", // Pretty sure we can't define functions in a mast file
        "async",
        "on change",
        "await",
        "import",
        "if",
        "else",
        "match",
        "case",
        "yield",
        "pass",
        "with",
        "None",
        "True",
        "False"
    ];
    // Add keywords to completions
    for (const key of keywords) {
        let i = {
            label: key,
            kind: vscode_languageserver_1.CompletionItemKind.Keyword
        };
        ci.push(i);
    }
    for (const key of variables_1.variableModifiers) {
        let i = {
            label: key[0],
            kind: vscode_languageserver_1.CompletionItemKind.Keyword,
            detail: key[1]
        };
        ci.push(i);
    }
    const metadata = {
        label: "metadata",
        kind: vscode_languageserver_1.CompletionItemKind.Variable,
        insertText: "metadata: ```\n\n```"
    };
    ci.push(metadata);
    // Add Route-specific variables, e.g. COLLISION_ID or SCIENCE_TARGET
    const lbl = (0, labels_1.getMainLabelAtPos)(pos, cache.getMastFile(text.uri).labelNames);
    (0, console_1.debug)("Main label at pos: ");
    (0, console_1.debug)(lbl);
    if (lbl.type === "route") {
        // if (!iStr.trim().startsWith("//")) {
        const vars = (0, routeLabels_1.getRouteLabelVars)(lbl.name);
        for (const s of vars) {
            const c = {
                label: s,
                kind: vscode_languageserver_1.CompletionItemKind.EnumMember,
                labelDetails: { description: "Route-specific Variable" }
            };
            ci.push(c);
        }
        // }
    }
    else {
        // If it's a main or inline label
        const keys = (0, labels_1.getLabelMetadataKeys)(lbl);
        for (const k of keys) {
            const c = {
                label: k[0],
                kind: vscode_languageserver_1.CompletionItemKind.Text,
                insertText: "\"" + k[0] + "\":"
            };
            if (k[1] !== "") {
                c.documentation = "Default value: " + k[1];
            }
            ci.push(c);
        }
    }
    // Add variable names to autocomplete list
    // TODO: Add variables from other files in scope?
    let variables = [];
    try {
        variables = cache.getVariableCompletionItems(text);
    }
    catch (e) {
        (0, console_1.debug)(e);
    }
    (0, console_1.debug)("Variables parsed.");
    // debug(variables)
    ci = ci.concat(variables);
    // ci = ci.concat(cache.getMethods());
    //debug(ci.length);
    //ci = ci.concat(defaultFunctionCompletionItems);
    for (const m of cache.getMethods()) {
        ci.push(m.buildCompletionItem());
    }
    // TODO: Account for text that's already present?? I don't think that's necessary
    // - Remove the text from the start of the completion item label
    return ci;
}
function getCurrentArgumentNames(iStr, doc) {
    let ret = [];
    const func = (0, signatureHelp_1.getCurrentMethodName)(iStr);
    const fstart = iStr.lastIndexOf(func);
    let wholeFunc = iStr.substring(fstart, iStr.length);
    let obj = /{.*?(}|$)/gm;
    wholeFunc = wholeFunc.replace(obj, "_");
    wholeFunc = wholeFunc.replace(/(?<quote>[\"']).*?(\k<quote>)/g, "_");
    const doublequotes = (0, rx_1.countMatches)(wholeFunc, /\"/g);
    const singleQuotes = (0, rx_1.countMatches)(wholeFunc, /'/g);
    if (doublequotes % 2 !== 0) {
        const last = wholeFunc.lastIndexOf("\"");
        wholeFunc = (0, comments_1.replaceRegexMatchWithUnderscore)(wholeFunc, { start: last, end: wholeFunc.length });
    }
    if (singleQuotes % 2 !== 0) {
        const last = wholeFunc.lastIndexOf("\"");
        wholeFunc = (0, comments_1.replaceRegexMatchWithUnderscore)(wholeFunc, { start: last, end: wholeFunc.length });
    }
    const arr = wholeFunc.split(",");
    const paramNumber = arr.length - 1;
    let methods = [];
    (0, console_1.debug)(func);
    if ((0, tokens_1.isClassMethod)(wholeFunc, fstart)) {
        (0, console_1.debug)("class method");
        methods = (0, cache_1.getCache)(doc.uri).getPossibleMethods(func);
    }
    else {
        (0, console_1.debug)("Not class method");
        let f = (0, cache_1.getCache)(doc.uri).getMethod(func);
        if (f !== undefined)
            methods.push(f);
    }
    for (const m of methods) {
        let p = m.parameters[paramNumber];
        let name = p.name.replace(/=.*/, "").trim();
        ret.push(name);
    }
    return ret;
}
function getCompletionsForMethodParameters(iStr, paramName, doc, pos) {
    let ci = [];
    const func = (0, signatureHelp_1.getCurrentMethodName)(iStr);
    const fstart = iStr.lastIndexOf(func);
    const wholeFunc = iStr.substring(fstart, iStr.length);
    const arr = wholeFunc.split(",");
    const paramNumber = arr.length - 1;
    const method = (0, cache_1.getCache)(doc.uri).getMethod(func);
    if (method !== undefined) {
        let p = method.parameters[paramNumber];
        if (paramName === p.name) {
            // Now we iterate over all the possible optiosn
            if (paramName === "style") {
                for (const s of (0, globals_1.getGlobals)().widget_stylestrings) {
                    if (func === s.function) {
                        const c = {
                            label: s.name,
                            //labelDetails: {detail: s.docs},
                            documentation: s.docs,
                            kind: vscode_languageserver_1.CompletionItemKind.Text,
                            insertText: s.name + ": "
                        };
                        if (c.label === "color") {
                            c.insertText = c.insertText + "#";
                        }
                        ci.push(c);
                    }
                }
            }
            else if (paramName === "art_id") {
                // Get all possible art files
                return (0, globals_1.getGlobals)().artFiles;
            }
            else if (paramName === 'art') {
                return (0, globals_1.getGlobals)().artFiles;
            }
            else if (paramName === "label") {
                const cache = (0, cache_1.getCache)(doc.uri);
                let labels = cache.getMastFile(doc.uri).labelNames;
                const main = (0, labels_1.getMainLabelAtPos)(pos, labels);
                labels = cache.getLabels(doc);
                const subs = main.subLabels;
                for (const l of subs) {
                    ci.push({
                        documentation: (0, labels_1.buildLabelDocs)(l),
                        label: l.name,
                        kind: vscode_languageserver_1.CompletionItemKind.Event,
                        labelDetails: {
                            description: "Sub-label of: " + main.name
                        }
                    });
                }
                for (const l of labels) {
                    ci.push({
                        documentation: (0, labels_1.buildLabelDocs)(l),
                        label: l.name,
                        kind: vscode_languageserver_1.CompletionItemKind.Event,
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
function getCompletionsForMethodParams(iStr, paramName, doc) {
    let ci = [];
    const func = (0, signatureHelp_1.getCurrentMethodName)(iStr);
    const sig = (0, cache_1.getCache)(doc.uri).getSignatureOfMethod(func);
    const fstart = iStr.lastIndexOf(func);
    const wholeFunc = iStr.substring(fstart, iStr.length);
    const arr = wholeFunc.split(",");
    if (sig !== undefined) {
        if (sig.parameters !== undefined) {
            for (const i in sig.parameters) {
                if (i !== "" + (arr.length - 1))
                    continue;
                if (sig.parameters[i].label === "style") {
                    for (const s of (0, globals_1.getGlobals)().widget_stylestrings) {
                        if (func === s.function) {
                            const c = {
                                label: s.name,
                                //labelDetails: {detail: s.docs},
                                documentation: s.docs,
                                kind: vscode_languageserver_1.CompletionItemKind.Text,
                                insertText: s.name + ": "
                            };
                            if (c.label === "color") {
                                c.insertText = c.insertText + "#";
                            }
                            ci.push(c);
                        }
                    }
                }
                else if (sig.parameters[i].label === "art_id") {
                    // Get all possible art files
                    return (0, globals_1.getGlobals)().artFiles;
                }
                else if (sig.parameters[i].label === 'art') {
                    return (0, globals_1.getGlobals)().artFiles;
                }
                else if (sig.parameters[i].label === "label") {
                }
            }
        }
    }
    return ci;
}
//# sourceMappingURL=autocompletion.js.map