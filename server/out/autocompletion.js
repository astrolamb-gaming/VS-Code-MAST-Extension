"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepCompletions = prepCompletions;
exports.onCompletion = onCompletion;
const console_1 = require("console");
const vscode_languageserver_1 = require("vscode-languageserver");
const labels_1 = require("./labels");
const routeLabels_1 = require("./routeLabels");
const comments_1 = require("./comments");
const cache_1 = require("./cache");
const path = require("path");
const fileFunctions_1 = require("./fileFunctions");
const tokens_1 = require("./tokens");
const globals_1 = require("./globals");
let classes = [];
let defaultFunctionCompletionItems = [];
/**
 * // TODO: This needs implemented I think???? Check the pyfile parsing and see if this is done already
 * Does setup for all of the autocompletion stuff. Only should run once.
 * @param files
 */
function prepCompletions(files) {
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
function onCompletion(_textDocumentPosition, text) {
    if (currentLine != _textDocumentPosition.position.line) {
        currentLine = _textDocumentPosition.position.line;
        // Here we can do any logic that doesn't need to be done every character change
        (0, console_1.debug)("Updating variables list");
        (0, tokens_1.getVariableNamesInDoc)(text);
    }
    (0, tokens_1.updateTokensForLine)(currentLine);
    let ci = [];
    const t = text?.getText();
    if (text === undefined) {
        (0, console_1.debug)("Document ref is undefined");
        return ci;
    }
    if (t === undefined) {
        (0, console_1.debug)("Document text is undefined");
        return ci;
    }
    // getVariablesInFile(text);
    // return ci;
    const cache = (0, cache_1.getCache)(text.uri);
    // Calculate the position in the text's string value using the Position value.
    const pos = text.offsetAt(_textDocumentPosition.position);
    const startOfLine = pos - _textDocumentPosition.position.character;
    const iStr = t.substring(startOfLine, pos);
    //debug("" + startOfLine as string);
    //
    (0, console_1.debug)(iStr);
    // If we're inside a comment or a string, we don't want autocompletion.
    if ((0, comments_1.isInComment)(pos)) {
        (0, console_1.debug)("Is in Comment");
        return ci;
    }
    if ((0, comments_1.isInYaml)(pos)) {
        (0, console_1.debug)("Is in Yaml");
        return ci;
    }
    // TODO: Check and make absolutely sure that isTextInBracket is working properly
    // TODO: May be useful to have a list of used string words that can be added via autocomplete (i.e. roles)
    const blobStr = iStr.substring(0, iStr.length - 1);
    if ((0, comments_1.isInString)(pos) && !(0, comments_1.isTextInBracket)(iStr, pos)) {
        // Here we check for blob info
        if (blobStr.endsWith(".set(") || blobStr.endsWith(".get(")) {
            (0, console_1.debug)("Is BLobe");
            return (0, globals_1.getGlobals)().blob_items;
        }
        (0, console_1.debug)("Is in string");
        return ci;
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
    // Route Label autocompletion
    if (iStr.trim().startsWith("//")) {
        // If this is a route label, but NOT anything after it, then we only return route labels
        if (!iStr.trim().includes(" ")) {
            ci = cache.getRouteLabels(); //getRouteLabelAutocompletions(iStr);
            return ci;
        }
        else {
            const route = iStr.trim().substring(0, iStr.trim().indexOf(" "));
            const rlvs = (0, routeLabels_1.getRouteLabelVars)(route);
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
    // Handle label autocompletion
    let jump = /(->|jump) *?$/;
    if (jump.test(iStr) || iStr.endsWith("task_schedule( ") || iStr.endsWith("task_schedule (") || iStr.endsWith("objective_add(") || iStr.endsWith("brain_add(")) {
        let labelNames = cache.getLabels(text);
        (0, console_1.debug)(labelNames);
        // Iterate over parent label info objects
        for (const i in labelNames) {
            ci.push({ label: labelNames[i].name, kind: vscode_languageserver_1.CompletionItemKind.Event, labelDetails: { description: path.basename(labelNames[i].srcFile) } });
        }
        const lbl = (0, labels_1.getMainLabelAtPos)(startOfLine, labelNames);
        if (lbl === undefined) {
            return ci;
        }
        // Check for the parent label at this point (to get sublabels within the same parent)
        if (lbl.srcFile === (0, fileFunctions_1.fixFileName)(text.uri)) {
            (0, console_1.debug)("same file name!");
            let subs = lbl.subLabels;
            (0, console_1.debug)(lbl.name);
            (0, console_1.debug)(subs);
            for (const i in subs) {
                ci.push({ label: subs[i], kind: vscode_languageserver_1.CompletionItemKind.Event, labelDetails: { description: "Sub-label of: " + lbl.name } });
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
    (0, console_1.debug)("Checking getCompletions");
    //debug(text.uri);
    //debug(ci);
    // Check if this is a class
    if (iStr.endsWith(".")) {
        (0, console_1.debug)("Getting Classes...");
        for (const c of cache.missionClasses) {
            if (c.name === "sbs") {
                (0, console_1.debug)("THIS IS SBS");
            }
            if (iStr.endsWith(c.name + ".")) {
                (0, console_1.debug)(iStr + " contains" + c.name);
                // TODO: Only use labels with isClassMethod = true
                // c.methods[0].completionItem.kind == CompletionItemKind.Method;
                return c.methodCompletionItems;
            }
        }
    }
    //debug(ci.length);
    ci = ci.concat(cache.getCompletions());
    let keywords = [
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
    ];
    // Add keywords to completions
    for (const key in keywords) {
        let i = {
            label: key,
            kind: vscode_languageserver_1.CompletionItemKind.Keyword
        };
        ci.push(i);
    }
    // Add Route-specific variables, e.g. COLLISION_ID or SCIENCE_TARGET
    const lbl = (0, labels_1.getMainLabelAtPos)(pos);
    (0, console_1.debug)("Main label at pos: ");
    (0, console_1.debug)(lbl);
    if (lbl.type === "route") {
        const vars = (0, routeLabels_1.getRouteLabelVars)(lbl.name);
        for (const s of vars) {
            const c = {
                label: s,
                kind: vscode_languageserver_1.CompletionItemKind.EnumMember,
                labelDetails: { description: "Route-specific Variable" }
            };
            ci.push(c);
        }
    }
    // Add variable names to autocomplete list
    // TODO: Add variables from other files in scope?
    (0, console_1.debug)(tokens_1.variables);
    ci = ci.concat(tokens_1.variables);
    //debug(ci.length);
    //ci = ci.concat(defaultFunctionCompletionItems);
    // TODO: Account for text that's already present?? I don't think that's necessary
    // - Remove the text from the start of the completion item label
    return ci;
}
//# sourceMappingURL=autocompletion.js.map