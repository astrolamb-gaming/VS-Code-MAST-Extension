"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRootFolder = getRootFolder;
exports.findSubfolderByName = findSubfolderByName;
exports.getFolders = getFolders;
exports.parseTyping = parseTyping;
exports.getRegExMatch = getRegExMatch;
exports.debug = debug;
const path = require("path");
const fs = require("fs");
const node_1 = require("vscode-languageserver/node");
function getRootFolder() {
    // let initialDir = "./";
    // let dir = findSubfolderByName(initialDir,"__lib__");
    // if (dir === null) {
    // Need to be sure we're capturing the right folder - we don't know if the user
    // is using the root Artemis folder or the missions folder, or anything in between.
    let initialDir = "../../../../";
    let dir = findSubfolderByName(initialDir, "data");
    debug(dir + "\n");
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
function parseTyping(text) {
    let m;
    const typings = [];
    let testStr = 'def add_client_tag() -> None:\n    """stub; does nothing yet."""';
    let wholeFunction = /((def)(.+?)([\.]{3,3}|((\"){3,3}(.*?)(\"){3,3})))/gms;
    let functionName = /((def\s)(.+?)\()/gm; // Look for "def functionName(" to parse function names.
    let className = /class (.+?):/gm; // Look for "class ClassName:" to parse class names.
    let functionParam = /\((.*?)\)/gm; // Find parameters of function, if any.
    let returnValue = /->(.+?):/gm; // Get the return value (None, boolean, int, etc)
    let comment = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/gm;
    while ((m = wholeFunction.exec(text))) {
        // if (m[0] === testStr) {
        // 	debug("Strings idential");
        // }
        let name = getRegExMatch(m[0], functionName).replace("def ", "").replace("(", "");
        let params = getRegExMatch(m[0], functionParam).replace("(", "").replace(")", "");
        let retVal = getRegExMatch(m[0], returnValue).replace("->", "").trim();
        let comments = getRegExMatch(m[0], comment).replace("\"\"\"", "").replace("\"\"\"", "");
        let ci = {
            label: name,
            kind: node_1.CompletionItemKind.Text,
            command: { command: 'editor.action.triggerSuggest', title: 'Re-trigger completions...' },
            //documentation: comments,
            detail: comments
        };
        typings.push(ci);
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
function debug(str) {
    if (str === undefined) {
        str = "UNDEFINED";
    }
    str = "\n" + str;
    fs.writeFileSync('outputLog.txt', str, { flag: "a+" });
}
//# sourceMappingURL=fileFunctions.js.map