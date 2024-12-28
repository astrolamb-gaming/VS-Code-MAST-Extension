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
function parseTyping(text, partOfClass = false) {
    let m;
    const typings = [];
    let testStr = 'def add_client_tag() -> None:\n    """stub; does nothing yet."""';
    let wholeFunction = /((@property|\.setter)?([\n\t\r ]*?)(def)(.+?)([\.]{3,3}|((\"){3,3}(.*?)(\"){3,3})))/gms;
    let functionName = /((def\s)(.+?)\()/gm; // Look for "def functionName(" to parse function names.
    let className = /class (.+?):/gm; // Look for "class ClassName:" to parse class names.
    let functionParam = /\((.*?)\)/m; // Find parameters of function, if any.
    let returnValue = /->(.+?):/gm; // Get the return value (None, boolean, int, etc)
    let comment = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/gm;
    let isProperty = /(@property)/;
    let isSetter = /\.setter/;
    while ((m = wholeFunction.exec(text))) {
        // if (m[0] === testStr) {
        // 	debug("Strings idential");
        // }
        let name = getRegExMatch(m[0], functionName).replace("def ", "").replace("(", "");
        let params = getRegExMatch(m[0], functionParam).replace("(", "").replace(")", "");
        let retVal = getRegExMatch(m[0], returnValue).replace(/(:|->)/g, "").trim();
        let comments = getRegExMatch(m[0], comment).replace("\"\"\"", "").replace("\"\"\"", "");
        let cik = node_1.CompletionItemKind.Method;
        if (isProperty.test(m[0])) {
            cik = node_1.CompletionItemKind.Property;
        }
        if (name === "__init__") {
            cik = node_1.CompletionItemKind.Constructor;
        }
        let labelDetails = {
            detail: "(" + params + ")",
            description: retVal
        };
        let ci = {
            label: name,
            kind: cik,
            command: { command: 'editor.action.triggerSuggest', title: 'Re-trigger completions...' },
            //documentation: comments,
            detail: comments,
            labelDetails: labelDetails
        };
        typings.push(ci);
        const si = {
            label: name,
            documentation: comments,
            parameters: []
        };
        //debug(name);
        //debug(params);
        if (params === "") {
            continue;
        }
        const paramArr = params.split(",");
        for (const i in paramArr) {
            try {
                if (paramArr[i].includes("*args") || paramArr[i].includes("**kwargs")) {
                    const pi = {
                        label: paramArr[i].trim(),
                        documentation: comments
                    };
                    si.parameters?.push(pi);
                    continue;
                }
                const paramDef = paramArr[i].split(":");
                const pi = {
                    label: paramDef[0].trim(),
                    documentation: (paramDef.length === 2) ? paramDef[1].trim() : comments
                };
                si.parameters?.push(pi);
            }
            catch (e) {
                (0, console_1.debug)("Error parsing parameter for function " + name + ", Parameter: " + paramArr[i] + "\n" + e);
            }
        }
        (0, server_1.appendFunctionData)(si);
        //debug(JSON.stringify(ci));
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