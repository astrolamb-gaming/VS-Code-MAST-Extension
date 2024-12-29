"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRootFolder = getRootFolder;
exports.findSubfolderByName = findSubfolderByName;
exports.getFolders = getFolders;
exports.parseTyping = parseTyping;
exports.getRegExMatch = getRegExMatch;
const path = require("path");
const fs = require("fs");
const node_1 = require("vscode-languageserver/node");
const server_1 = require("./server");
const console_1 = require("console");
function getRootFolder() {
    // let initialDir = "./";
    // let dir = findSubfolderByName(initialDir,"__lib__");
    // if (dir === null) {
    // Need to be sure we're capturing the right folder - we don't know if the user
    // is using the root Artemis folder or the missions folder, or anything in between.
    let initialDir = "../../../../";
    let dir = findSubfolderByName(initialDir, "data");
    (0, console_1.debug)(dir + "\n");
    if (dir !== null) {
        dir = findSubfolderByName(dir, "missions");
        if (dir !== null) {
            dir = findSubfolderByName(dir, "__lib__");
            if (dir !== null) {
                //dir = dir.replace(/\.\.\\/g,"");
                return dir;
            }
        }
    }
    return null;
}
function findSubfolderByName(dir, folderName) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        if (file.isDirectory()) {
            if (file.name === folderName) {
                return path.join(dir, file.name);
            }
            else {
                const subfolderPath = findSubfolderByName(path.join(dir, file.name), folderName);
                if (subfolderPath) {
                    return subfolderPath;
                }
            }
        }
    }
    return null;
}
function getFolders(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
}
/**
 * Parses a section of code. Can't handle mixing classes with normal functions, so you need to parse each class separately.
 * @param text string to parse
 * @returns List of CompletionItems
 */
function parseTyping(text, className = "") {
    let m;
    const typings = [];
    let testStr = 'def add_client_tag() -> None:\n    """stub; does nothing yet."""';
    let wholeFunction = /((@property|\.setter)?([\n\t\r ]*?)(def)(.+?)([\.]{3,3}|((\"){3,3}(.*?)(\"){3,3})))/gms;
    let functionName = /((def\s)(.+?)\()/gm; // Look for "def functionName(" to parse function names.
    //let className : RegExp = /class (.+?):/gm; // Look for "class ClassName:" to parse class names.
    let functionParam = /\((.*?)\)/m; // Find parameters of function, if any.
    let returnValue = /->(.+?):/gm; // Get the return value (None, boolean, int, etc)
    let comment = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/gms;
    let isProperty = /(@property)/;
    let isSetter = /\.setter/;
    while ((m = wholeFunction.exec(text))) {
        // if (m[0] === testStr) {
        // 	debug("Strings idential");
        // }
        let name = getRegExMatch(m[0], functionName).replace("def ", "").replace("(", "").trim();
        //debug(name);
        let params = getRegExMatch(m[0], functionParam).replace("(", "").replace(")", "");
        let retVal = getRegExMatch(m[0], returnValue).replace(/(:|->)/g, "").trim();
        let comments = getRegExMatch(m[0], comment).replace("\"\"\"", "").replace("\"\"\"", "");
        let cik = node_1.CompletionItemKind.Method;
        let cikStr = "function";
        if (isProperty.test(m[0])) {
            cik = node_1.CompletionItemKind.Property;
            cikStr = "property";
        }
        if (name === "__init__") {
            cik = node_1.CompletionItemKind.Constructor;
            cikStr = "constructor";
        }
        let labelDetails = {
            // Decided that this clutters up the UI too much. Same information is displayed in the CompletionItem details.
            //detail: "(" + params + ")",
            description: retVal
        };
        let ci_details = "(" + cikStr + ") " + ((className === "") ? "" : className + ".") + name + "(" + params + "): " + retVal;
        let ci = {
            label: name,
            kind: cik,
            //command: { command: 'editor.action.triggerSuggest', title: 'Re-trigger completions...' },
            documentation: comments,
            detail: ci_details,
            labelDetails: labelDetails,
            insertText: name
        };
        typings.push(ci);
        const si = {
            label: ci_details,
            documentation: ci_details + "\n" + comments,
            // TODO: Make this more Markup style instead of just text
            parameters: []
        };
        if (name === "add_role") {
            (0, console_1.debug)(params);
        }
        if (params === "") {
            continue;
        }
        const paramArr = params.split(",");
        for (const i in paramArr) {
            if (paramArr[i].trim() === "self") {
                continue;
            }
            try {
                //debug(paramArr[i]);
                let paramDef = paramArr[i].split(":");
                // paramDef[0] is the name of the variable.
                // paramDef[1] is the type, which often is not specified in the function definition.
                // Usually the type is in the comments somewhere, but I don't want to try and parse comments which may not always have the same format.
                if (paramDef.length === 1) {
                    const pi = {
                        label: paramDef[0],
                        //documentation: comments
                    };
                    si.parameters?.push(pi);
                }
                else {
                    const pi = {
                        label: paramDef[0],
                        documentation: paramDef[1]
                    };
                    si.parameters?.push(pi);
                    si.parameters?.push();
                }
            }
            catch (e) {
                (0, console_1.debug)("Error parsing parameter for function " + name + ", Parameter: " + paramArr[i] + "\n" + e);
            }
        }
        (0, server_1.appendFunctionData)(si);
        //debug(JSON.stringify(si));
    }
    //debug(JSON.stringify(typings));
    return typings;
}
function getRegExMatch(sourceString, pattern) {
    let ret = "";
    let m;
    let count = 0;
    while ((m = pattern.exec(sourceString)) && count < 1) {
        ret += m[0];
        count++;
    }
    return ret;
}
// export function debug(str : string | undefined) {
// 	if (str === undefined) {
// 		str = "UNDEFINED";
// 	}
// 	str = "\n" + str;
// 	fs.writeFileSync('outputLog.txt', str, {flag: "a+"});
// }
//# sourceMappingURL=fileFunctions.js.map