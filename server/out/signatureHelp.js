"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onSignatureHelp = onSignatureHelp;
exports.getCurrentMethodName = getCurrentMethodName;
const console_1 = require("console");
const cache_1 = require("./cache");
const comments_1 = require("./tokens/comments");
const hover_1 = require("./hover");
const tokens_1 = require("./tokens/tokens");
function onSignatureHelp(_textDocPos, text) {
    let sh = {
        signatures: []
    };
    //const text = documents.get(_textDocPos.textDocument.uri);
    if (text === undefined) {
        (0, console_1.debug)("Document ref is undefined");
        return sh;
    }
    const t = text.getText();
    if (t === undefined) {
        (0, console_1.debug)("Document text is undefined");
        return sh;
    }
    const cache = (0, cache_1.getCache)(text.uri);
    // Calculate the position in the text's string value using the Position value.
    const pos = text.offsetAt(_textDocPos.position);
    const startOfLine = pos - _textDocPos.position.character;
    const iStr = t.substring(startOfLine, pos);
    const line = (0, hover_1.getCurrentLineFromTextDocument)(_textDocPos.position, text);
    // Calculate which parameter is the active one
    const func = getCurrentMethodName(iStr);
    (0, console_1.debug)(func);
    if (func === "")
        return;
    const fstart = iStr.lastIndexOf(func);
    let wholeFunc = iStr.substring(fstart, iStr.length);
    let obj = /{.*?(}|$)/gm;
    //TODO: I THINK this will handle nested functions... test later
    // let obj = /(\w+\(.*\))|({.*?(}|$))/gm;
    let isClassMethodRes = (0, tokens_1.isClassMethod)(line, fstart);
    // Check for the current function name and get SignatureInformation for that function.
    /**The {@link SignatureInformation SignatureInformation} for this function. */
    let sig = cache.getSignatureOfMethod(func, isClassMethodRes);
    /** Here we get rid of some things that could cause parsing issues.
     We replace fstrings and nested functions with _, and anythnig within quotes to just empty quotes.
     This eliminates commas that mess with the current parameter, as well as functions etc in fstrings */
    wholeFunc = wholeFunc.replace(obj, "_").replace(/\".*?\"/, '""');
    const test = /(\w+)\=/m;
    /**The name of the current argument */
    let arg = "";
    const arr = wholeFunc.split(",");
    /** The current array index */
    const pNum = arr.length - 1;
    // Check if there's a named argument
    const match = arr[pNum].match(test);
    if (match) {
        // If a named arg is found, set the arg name
        arg = match[1];
    }
    else {
        sh.activeParameter = pNum;
        arg = arr[pNum];
    }
    /**The {@link Function Function} in question */
    let method = cache.getMethod(func);
    // TODO:
    // - Keep copy of arg list from param list
    // - If the arg is not yet named,
    // - remove any arg that is already used in the function def
    // - Use the index of the first arg as the active sig
    if (method) {
        sig = method.buildSignatureInformation();
        let usedArgs = [];
        for (const p of method.parameters) {
            if (wholeFunc.includes(p.name + "=") || wholeFunc.includes(p.name + " =")) {
                usedArgs.push(p.name);
            }
        }
        for (const p in method.parameters) {
            let found = false;
            for (const a of arr) {
                // Exclude already listed args
                (0, console_1.debug)(a);
                (0, console_1.debug)(p);
                if (a.split("=")[0].trim() === p) {
                    found = true;
                }
            }
            if (found)
                continue;
            const name = method.parameters[p].name;
            if (name === arg) {
                sh.activeParameter = parseInt(p);
                if (sig) {
                    sh.signatures.push(sig);
                    return sh;
                }
            }
        }
    }
    // debug(sig)
    if (sig !== undefined) {
        sh.signatures.push(sig);
    }
    //#region Testing
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
    //#endregion
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