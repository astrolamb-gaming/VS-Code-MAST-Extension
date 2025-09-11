"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClassObject = void 0;
exports.getRegExMatch = getRegExMatch;
const vscode_languageserver_1 = require("vscode-languageserver");
const data_1 = require("../data");
const function_1 = require("./function");
const console_1 = require("console");
class ClassObject {
    constructor(raw, sourceFile) {
        this.methods = [];
        this.properties = [];
        this.startPos = 0;
        this.location = { uri: sourceFile, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } };
        let className = /^class .+?:/gm; // Look for "class ClassName:" to parse class names.
        // debug(className);
        const parentClass = /\(([\w\"]*?)\):/;
        let comment = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/m;
        // TODO: Could pull the class parent and interfaces (if any). Would this be useful?
        this.name = getRegExMatch(raw, className).replace("class ", "").replace(/(\(.*?\))?:/, "");
        (0, console_1.debug)(this.name);
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
        this.methods = this.parseFunctions(raw, functionSource, this.sourceFile);
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
    /**
     * Gets all functions within a particular module or class.
     * Really it's all functions defined within the provided text, so you need to be careful that only what you want is in here.
     * @param raw The raw text contents, as a string
     * @returns List of {@link Function Function} items
     */
    parseFunctions(raw, source, sourceFile) {
        let m;
        let fList = [];
        let testStr = '    @label\n    def add_client_tag() -> None:\n    """stub; does nothing yet."""';
        let wholeFunction = /((@property|\.setter|@classmethod|@staticmethod|@label|@awaitable)([\n\t\r ]))?[\t ]*?(def[ \t])/g;
        let functionName = /((def\s)(.+?)\()/gm; // Look for "def functionName(" to parse function names.
        //let className : RegExp = /class (.+?):/gm; // Look for "class ClassName:" to parse class names.
        let functionParam = /\((.*?)\)/m; // Find parameters of function, if any.
        let returnValue = /->(.+?):/gm; // Get the return value (None, boolean, int, etc)
        let comment = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/gms;
        let isProperty = /(@property)/;
        let isClassMethod = /@classmethod/;
        let isSetter = /\.setter/;
        let blockIndices = [];
        while (m = wholeFunction.exec(raw)) {
            blockIndices.push(m.index);
        }
        (0, console_1.debug)(blockIndices);
        if (blockIndices.length === 0) {
            return fList;
        }
        blockIndices.push(raw.length - 1);
        let len = blockIndices.length; // How many indices there are - NOT the same as number of classes (should be # of classes - 1)
        for (let i = 0; i < len; i++) {
            let t;
            let start = blockIndices[0];
            if (i === 0) {
                t = raw.substring(0, start);
            }
            else {
                start = blockIndices[i - 1];
                t = raw.substring(start, blockIndices[i]);
            }
            const f = new function_1.Function(t, source, sourceFile);
            if (f.name === "") {
                // This is all the stuff between the class def and first function def
                // debug(t);
                continue;
            }
            // f.startIndex = f.startIndex + this.startPos;
            fList.push(f);
        }
        // debug(source);
        // TODO: Doing this seems to cause some issues.....
        // But there do seem to be multiple copies of some functions. Might need to check if these are just getters and setters
        // fList = [...new Map(fList.map(v => [v.startIndex, v])).values()]
        // if (fList.length >= 0) debug(fList);
        return fList;
    }
}
exports.ClassObject = ClassObject;
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
//# sourceMappingURL=class.js.map