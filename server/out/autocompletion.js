"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepCompletions = prepCompletions;
exports.onCompletion = onCompletion;
const console_1 = require("console");
const vscode_languageserver_1 = require("vscode-languageserver");
const labels_1 = require("./labels");
const server_1 = require("./server");
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
    // debug(iStr);
    let items = [
        "sbs",
        "change_console",
        "MoreThings",
        "sbs.something",
        "sbs.target",
        "sbs.functions"
    ];
    // If we're defining a label, we don't want autocomplete.
    if (iStr.includes("--") || iStr.includes("==")) {
        return ci;
    }
    // Route Label autocompletion
    if (iStr.includes("//")) {
        let routes = (0, server_1.getSupportedRoutes)();
        for (const i in routes) {
            let r = routes[i].join("/").replace("*b", "");
            if ((r + "//").includes(iStr.trim())) {
                ci.push({ label: r, kind: vscode_languageserver_1.CompletionItemKind.Event });
            }
        }
        return ci;
    }
    // Handle label autocompletion
    if (iStr.endsWith("-> ") || iStr.endsWith("jump ") || iStr.endsWith("task_schedule( ") || iStr.endsWith("task_schedule (")) {
        for (const i in server_1.labelNames) {
            ci.push({ label: server_1.labelNames[i].name, kind: vscode_languageserver_1.CompletionItemKind.Event });
        }
        const lbl = (0, labels_1.getMainLabelAtPos)(startOfLine, server_1.labelNames).subLabels;
        for (const i in lbl) {
            ci.push({ label: lbl[i], kind: vscode_languageserver_1.CompletionItemKind.Event });
        }
        return ci;
    }
    if (iStr.endsWith("(")) {
        // const func: RegExp = /[\w. ]+?\(/g
        // let m: RegExpExecArray | null;
        // while (m = func.exec(iStr)) {
        // }
        return ci;
    }
    // First we check if it should be just stuff from a particular class
    for (const i in classes) {
        let found = false;
        if (iStr.endsWith(classes[i].name + ".")) {
            const cf = classes[i].methodCompletionItems;
            for (const j in cf) {
                ci.push(cf[j]);
            }
            found = true;
        }
        if (found) {
            return ci;
        }
    }
    // If it doesn't belong to a particular class, add class name to the list of completion items
    for (const i in classes) {
        if (classes[i].constructorFunction !== undefined) {
            ci.push(classes[i].constructorFunction?.completionItem);
        }
    }
    ci = ci.concat(defaultFunctionCompletionItems);
    for (const i in ci) {
        (0, console_1.debug)(ci[i].label);
    }
    // depracated
    // ci = ci.concat(getPyTypings());
    return ci;
}
//# sourceMappingURL=autocompletion.js.map