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
let classes = [];
let defaultFunctionCompletionItems = [];
/**
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
function onCompletion(_textDocumentPosition, text) {
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
    // Calculate the position in the text's string value using the Position value.
    const pos = text.offsetAt(_textDocumentPosition.position);
    const startOfLine = pos - _textDocumentPosition.position.character;
    const iStr = t.substring(startOfLine, pos);
    //debug("" + startOfLine as string);
    //
    (0, console_1.debug)(iStr);
    let keywords = [
        "def",
        "async",
        "on change",
        "await",
        "shared"
    ];
    // If we're inside a comment or a string, we don't want autocompletion.
    if ((0, comments_1.isInComment)(pos)) {
        return ci;
    }
    // TODO: Check and make absolutely sure that isTextInBracket is working properly
    // TODO: May be useful to have a list of used string words that can be added via autocomplete (i.e. roles)
    if ((0, comments_1.isInString)(pos) && !(0, comments_1.isTextInBracket)(iStr, pos)) {
        (0, console_1.debug)("Is in string");
        return ci;
    }
    // If we're defining a label, we don't want autocomplete.
    if (iStr.trim().startsWith("--") || iStr.trim().startsWith("==")) {
        return ci;
    }
    // Media labels only get the skybox names
    else if (iStr.endsWith("@media/skybox/")) {
        return (0, routeLabels_1.getSkyboxCompletionItems)();
        // Get Music Options (default vs Artemis2)
    }
    else if (iStr.endsWith("@media/music/")) {
        return (0, routeLabels_1.getMusic)();
    }
    // Route Label autocompletion
    if (iStr.trim().startsWith("//") || iStr.trim().startsWith("@")) {
        let ci = (0, routeLabels_1.getRouteLabelAutocompletions)(iStr);
        // TODO: Add media, map, gui/tab, and console autocompletion items
        return ci;
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
    let jump = /(->|jump) *?$/;
    if (jump.test(iStr) || iStr.endsWith("task_schedule( ") || iStr.endsWith("task_schedule (")) {
        let labelNames = (0, cache_1.getCache)(text.uri).getLabels(text.uri);
        for (const i in labelNames) {
            ci.push({ label: labelNames[i].name, kind: vscode_languageserver_1.CompletionItemKind.Event });
        }
        const lbl = (0, labels_1.getMainLabelAtPos)(startOfLine, labelNames).subLabels;
        for (const i in lbl) {
            ci.push({ label: lbl[i], kind: vscode_languageserver_1.CompletionItemKind.Event });
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
    const cache = (0, cache_1.getCache)(text.uri);
    // Check if this is a class
    if (iStr.endsWith(".")) {
        (0, console_1.debug)("Getting Classes...");
        for (const c of cache.missionClasses) {
            if (c.name === "sbs") {
                (0, console_1.debug)("THIS IS SBS");
            }
            if (iStr.endsWith(c.name + ".")) {
                (0, console_1.debug)(iStr + " contains" + c.name);
                return c.methodCompletionItems;
            }
        }
    }
    //debug(ci.length);
    ci = cache.getCompletions();
    //debug(ci.length);
    //ci = ci.concat(defaultFunctionCompletionItems);
    // TODO: Account for text that's already present??
    // - Remove the text from the start of the completion item label
    return ci;
}
//# sourceMappingURL=autocompletion.js.map