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
    (0, console_1.debug)(f);
    let sig = (0, cache_1.getCache)(text.uri).getSignatureOfMethod(f);
    (0, console_1.debug)(sig);
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
function getCurrentMethodName(iStr) {
    // 	const last = iStr.lastIndexOf("(");
    // 	const lastClose = iStr.lastIndexOf(")");
    // 	if (lastClose > last) {
    // 	}
    // 	const priorCheck = iStr.substring(0,last-1);
    // 	let prior = priorCheck.lastIndexOf("(");
    // 	if (prior === -1) {
    // 		prior = priorCheck.lastIndexOf(".");
    // 	}
    // 	if (prior === -1) {
    // 		prior = priorCheck.lastIndexOf(" ");
    // 	}
    // 	if (prior === -1) {
    // 		prior = 0;
    // 	}
    // 	return iStr.substring(prior,last).replace(/\.|\(| |\"|\'/g,"");
    // }
    // const test = "testing(a(),function(1,5, 10";
    // export function getMethodName(iStr: string): string {
    // iStr = test;
    let t;
    t = iStr.match(/\w+\(([^\(\)])*\)/g);
    // debug(t);
    while (t) {
        let s = iStr.indexOf(t[0]);
        let r = {
            start: s,
            end: t[0].length + s
        };
        // debug(r);
        iStr = (0, comments_1.replaceRegexMatchWithUnderscore)(iStr, r);
        // debug(iStr);
        // const line = iStr.substring()
        t = iStr.match(/\w+\(([^\(\)])*\)/g);
    }
    let last = iStr.lastIndexOf("(");
    let symbol = (0, hover_1.getHoveredSymbol)(iStr, last);
    (0, console_1.debug)(symbol);
    return symbol;
}
//# sourceMappingURL=signatureHelp.js.map