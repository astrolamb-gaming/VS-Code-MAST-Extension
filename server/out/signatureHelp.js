"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onSignatureHelp = onSignatureHelp;
exports.getCurrentMethodName = getCurrentMethodName;
const console_1 = require("console");
const cache_1 = require("./cache");
const comments_1 = require("./tokens/comments");
const hover_1 = require("./hover");
function onSignatureHelp(_textDocPos, text) {
    let sh = {
        signatures: []
    };
    //const text = documents.get(_textDocPos.textDocument.uri);
    const t = text?.getText();
    if (text === undefined) {
        (0, console_1.debug)("Document ref is undefined");
        return sh;
    }
    if (t === undefined) {
        (0, console_1.debug)("Document text is undefined");
        return sh;
    }
    // Calculate the position in the text's string value using the Position value.
    const pos = text.offsetAt(_textDocPos.position);
    const startOfLine = pos - _textDocPos.position.character;
    const iStr = t.substring(startOfLine, pos);
    // Calculate which parameter is the active one
    let m;
    let last = iStr.lastIndexOf("(");
    let sub = iStr.substring(last + 1, pos).replace(/ /g, "");
    let arr = sub.split(",");
    //debug(arr);
    sh.activeParameter = arr.length - 1;
    // Check for the current function name and get SignatureInformation for that function.
    let f = getCurrentMethodName(iStr);
    // debug(f);
    let sig = (0, cache_1.getCache)(text.uri).getSignatureOfMethod(f);
    // debug(sig);
    if (sig !== undefined) {
        sh.signatures.push(sig);
    }
    // This is just for testing
    let p = {
        label: "Parameter 1",
        documentation: "Param 1 Documentation"
    };
    let p2 = {
        label: "Parameter 2",
        documentation: "Param 2 Documentation"
    };
    let si = {
        label: "SignatureInformation",
        documentation: "Documentation",
        parameters: []
    };
    si.parameters?.push(p);
    si.parameters?.push(p2);
    return sh;
}
/**
 * Given a string, this function will return the name of the function which is having parameters added to it.
 * @param iStr The string
 * @returns A string representing the name of the function.
 */
function getCurrentMethodName(iStr) {
    let t;
    t = iStr.match(/\w+\(([^\(\)])*\)/g);
    while (t) {
        let s = iStr.indexOf(t[0]);
        let r = {
            start: s,
            end: t[0].length + s
        };
        iStr = (0, comments_1.replaceRegexMatchWithUnderscore)(iStr, r);
        t = iStr.match(/\w+\(([^\(\)])*\)/g);
    }
    let last = iStr.lastIndexOf("(");
    let symbol = (0, hover_1.getHoveredSymbol)(iStr, last);
    // debug(symbol);
    return symbol;
}
//# sourceMappingURL=signatureHelp.js.map