"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCompletion = onCompletion;
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
let currentLine = 0;
function onCompletion(_textDocumentPosition, text) {
    // return buildFaction("kra","Kralien_Set");
    (0, console_1.debug)("Staring onCompletion");
    // return getGlobals().artFiles;
    if (!(0, globals_1.getGlobals)().isCurrentFile(text.uri)) {
        (0, cache_1.getCache)(text.uri).updateFileInfo(text);
        (0, globals_1.getGlobals)().setCurrentFile(text.uri);
    }
    const cache = (0, cache_1.getCache)(text.uri);
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
    const iStr = t.substring(startOfLine, pos);
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
    (0, console_1.debug)(iStr);
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
    (0, console_1.debug)(blobStr);
    if ((0, comments_1.isInString)(text, pos)) {
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
            // Here we check for stylestrings, art_ids, etc.
            const func = (0, signatureHelp_1.getCurrentMethodName)(iStr);
            const sig = (0, cache_1.getCache)(text.uri).getSignatureOfMethod(func);
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
                    }
                }
            }
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
    // Media labels only get the skybox names
    else if (iStr.endsWith("@media/skybox/")) {
        return (0, globals_1.getGlobals)().skyboxes;
        // Get Music Options (default vs Artemis2)
    }
    else if (iStr.endsWith("@media/music/")) {
        return (0, globals_1.getGlobals)().music;
    }
    if (iStr.trim().match(/sbs\.play_audio_file\([ \d\w]+\, */)) {
        return cache.getMusicFiles();
    }
    // Route Label autocompletion
    if (iStr.trim().startsWith("//")) {
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
    else if (iStr.trim().startsWith("@")) {
        ci = cache.getMediaLabels();
        return ci;
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
    // Handle label autocompletion
    let jump = /(->|jump)[ \t]*?/;
    if (jump.test(iStr) || iStr.endsWith("task_schedule( ") || iStr.endsWith("task_schedule (") || iStr.endsWith("objective_add(") || iStr.endsWith("brain_add(")) {
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
        for (const c of cache.missionClasses) {
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
        for (const c of cache.missionClasses) {
            (0, console_1.debug)(c.name);
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
    // const cm = getCurrentMethodName(iStr) {
    // 	for ()
    // }
    //debug(ci.length);
    ci = ci.concat(cache.getCompletions());
    let keywords = [
        // "def", // Pretty sure we can't define functions in a mast file
        "async",
        "on change",
        "await",
        "default",
        "shared",
        "assigned",
        "client",
        "temp",
        "import",
        "if",
        "else",
        "match",
        "case",
        "yield",
        "pass",
        "with"
    ];
    // Add keywords to completions
    for (const key of keywords) {
        let i = {
            label: key,
            kind: vscode_languageserver_1.CompletionItemKind.Keyword
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
    //debug(ci.length);
    //ci = ci.concat(defaultFunctionCompletionItems);
    // TODO: Account for text that's already present?? I don't think that's necessary
    // - Remove the text from the start of the completion item label
    return ci;
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