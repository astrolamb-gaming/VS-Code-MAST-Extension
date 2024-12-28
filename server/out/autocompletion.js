"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCompletion = onCompletion;
const console_1 = require("console");
const vscode_languageserver_1 = require("vscode-languageserver");
const labels_1 = require("./labels");
const server_1 = require("./server");
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
    if (iStr.endsWith("-> ") || iStr.endsWith("jump ") || iStr.endsWith("task_schedule( ")) {
        for (const i in server_1.labelNames) {
            ci.push({ label: server_1.labelNames[i].name, kind: vscode_languageserver_1.CompletionItemKind.Event });
        }
        const lbl = (0, labels_1.getMainLabelAtPos)(startOfLine, server_1.labelNames).subLabels;
        for (const i in lbl) {
            ci.push({ label: lbl[i], kind: vscode_languageserver_1.CompletionItemKind.Event });
        }
        return ci;
    }
    const ct = (0, server_1.getClassTypings)();
    for (const i in ct) {
        if (iStr.endsWith(ct[i].name + ".")) {
            const cf = ct[i].completionItems;
            for (const j in cf) {
                ci.push(cf[j]);
            }
        }
        else {
            ci.push(ct[i].classCompItem);
        }
        return ci;
    }
    items.forEach((i) => {
        //ci.push({label: "sbs: #" + _textDocumentPosition.position.character, kind: CompletionItemKind.Text});
        if (i.indexOf(".") < _textDocumentPosition.position.character - 1) {
            ci.push({ label: i, kind: vscode_languageserver_1.CompletionItemKind.Text });
        }
    });
    // completionStrings.forEach((i)=>{
    // 	if (i.indexOf(".")< _textDocumentPosition.position.character-1) {
    // 		ci.push({label: i, kind: CompletionItemKind.Text});
    // 	}
    // })
    ci = ci.concat((0, server_1.getPyTypings)());
    return ci;
}
//# sourceMappingURL=autocompletion.js.map