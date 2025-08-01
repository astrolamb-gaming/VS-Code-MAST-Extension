"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClassObject = void 0;
exports.getRegExMatch = getRegExMatch;
const vscode_languageserver_1 = require("vscode-languageserver");
const data_1 = require("../data");
const function_1 = require("./function");
class ClassObject {
    constructor(raw, sourceFile) {
        this.methods = [];
        this.properties = [];
        this.startPos = 0;
        this.location = { uri: sourceFile, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } };
        let className = /^class .+?:/gm; // Look for "class ClassName:" to parse class names.
        const parentClass = /\(\w*?\):/;
        let comment = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/m;
        // TODO: Could pull the class parent and interfaces (if any). Would this be useful?
        this.name = getRegExMatch(raw, className).replace("class ", "").replace(/(\(.*?\))?:/, "");
        for (const n of data_1.replaceNames) {
            if (this.name === n[0]) {
                this.name = n[1];
            }
        }
        this.parent = getRegExMatch(raw, parentClass).replace(/.*\(/, "").replace(/\):?/, "");
        this.sourceFile = sourceFile;
        // Should just get the first set of comments, which would be the ones for the class itself
        this.documentation = getRegExMatch(raw, comment).replace(/\"\"\"/g, "");
        // Parse functions
        let functionSource = (this.name === "") ? sourceFile : this.name;
        this.methods = parseFunctions(raw, functionSource, this.sourceFile);
        this.properties = parseVariables(raw, functionSource, this.sourceFile);
        for (const i in this.methods) {
            // debug(this.methods[i]);
            if (this.methods[i].functionType === "constructor") {
                this.constructorFunction = this.methods[i];
            }
        }
        return this;
    }
    getMethodCompletionItems() {
        let ci = [];
        for (const m of this.methods) {
            ci.push(m.buildCompletionItem());
        }
        return ci;
    }
    /**
     * Helper function, should only be called by constructor.
     * @returns A {@link CompletionItem CompletionItem} object representing the class object.
     */
    buildCompletionItem() {
        //const ci: CompletionItem;
        let labelDetails = {
            // Decided that this clutters up the UI too much. Same information is displayed in the CompletionItem details.
            //detail: "(" + params + ")",
            description: this.name
        };
        let cik = vscode_languageserver_1.CompletionItemKind.Class;
        let ci_details = this.name + "(" + ((this.constructorFunction === undefined) ? "" : this.constructorFunction?.rawParams) + "): " + this.name;
        let ci = {
            label: this.name,
            kind: cik,
            //command: { command: 'editor.action.triggerSuggest', title: 'Re-trigger completions...' },
            documentation: this.documentation,
            detail: ci_details, //(this.constructorFunction) ? this.constructorFunction.documentation : this.documentation, //this.documentation as string,
            labelDetails: labelDetails,
            insertText: this.name
        };
        return ci;
    }
    buildVariableCompletionItemList() {
        let ret = [];
        for (const v of this.properties) {
            const ci = {
                label: "[" + this.name + "]." + v.name,
                kind: vscode_languageserver_1.CompletionItemKind.Property,
                insertText: v.name
            };
            ret.push(ci);
        }
        return ret;
    }
}
exports.ClassObject = ClassObject;
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
/**
 * Gets all functions within a particular module or class.
 * Really it's all functions defined within the provided text, so you need to be careful that only what you want is in here.
 * @param raw The raw text contents, as a string
 * @returns List of {@link Function Function} items
 */
function parseFunctions(raw, source, sourceFile) {
    let m;
    let fList = [];
    let testStr = 'def add_client_tag() -> None:\n    """stub; does nothing yet."""';
    let wholeFunction = /((@property|\.setter|@classmethod)?([\n\t\r ]*?)(def)(.+?)([\.]{3,3}|((\"){3,3}(.*?)(\"){3,3})))/gms;
    let functionName = /((def\s)(.+?)\()/gm; // Look for "def functionName(" to parse function names.
    //let className : RegExp = /class (.+?):/gm; // Look for "class ClassName:" to parse class names.
    let functionParam = /\((.*?)\)/m; // Find parameters of function, if any.
    let returnValue = /->(.+?):/gm; // Get the return value (None, boolean, int, etc)
    let comment = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/gms;
    let isProperty = /(@property)/;
    let isClassMethod = /@classmethod/;
    let isSetter = /\.setter/;
    while ((m = wholeFunction.exec(raw))) {
        const f = new function_1.Function(m[0], source, sourceFile);
        fList.push(f);
    }
    // debug(source);
    // TODO: Doing this seems to cause some issues.....
    // But there do seem to be multiple copies of some functions. Might need to check if these are just getters and setters
    // fList = [...new Map(fList.map(v => [v.startIndex, v])).values()]
    // if (fList.length >= 0) debug(fList);
    return fList;
}
function parseVariables(raw, source, sourceFile) {
    let ret = [];
    let def = raw.indexOf("def");
    raw = raw.substring(0, def);
    let v = /^\s*(\w+)\s*(:\s*(\w+))?=.*$/gm;
    let m;
    while (m = v.exec(raw)) {
        let type = "";
        if (m[3])
            type = m[3];
        const newVar = {
            name: m[1],
            range: {
                start: {
                    line: 0,
                    character: 0
                },
                end: {
                    line: 0,
                    character: 0
                }
            },
            doc: '',
            equals: '',
            types: [type]
        };
        ret.push(newVar);
    }
    v = /self\.(\w+)\b/g;
    while (m = v.exec(raw)) {
        const newVar = {
            name: m[1],
            range: {
                start: {
                    line: 0,
                    character: 0
                },
                end: {
                    line: 0,
                    character: 0
                }
            },
            doc: '',
            equals: '',
            types: []
        };
        ret.push(newVar);
    }
    return ret;
}
//# sourceMappingURL=class.js.map