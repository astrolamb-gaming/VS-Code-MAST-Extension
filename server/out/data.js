"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Parameter = exports.Function = exports.ClassObject = exports.PyFile = exports.MastFile = exports.FileCache = void 0;
exports.getRegExMatch = getRegExMatch;
exports.getLabelDescription = getLabelDescription;
exports.getVariablesInFile = getVariablesInFile;
const path = require("path");
const fs = require("fs");
const console_1 = require("console");
const vscode_languageserver_1 = require("vscode-languageserver");
const labels_1 = require("./labels");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const fileFunctions_1 = require("./fileFunctions");
const cache_1 = require("./cache");
class FileCache {
    constructor(uri) {
        this.variableNames = [];
        this.uri = uri;
        let parent = "sbs_utils";
        if (!uri.includes("sbs_utils") && !uri.includes("mastlib")) {
            parent = (0, fileFunctions_1.getParentFolder)(uri);
        }
        this.parentFolder = parent;
    }
    parseVariables(contents) {
        let pattern = /^\s*?(\w+)\s*?=\s*?[^\s\+=-\\*\/].*$/gm;
        let m;
        let catcher = 0;
        while (m = pattern.exec(contents)) {
            const variable = m[0];
            (0, console_1.debug)(variable);
            catcher++;
            if (catcher > 20) {
                continue;
            }
        }
    }
}
exports.FileCache = FileCache;
class MastFile extends FileCache {
    // TODO: Add support for holding label information for all files listed in __init__.mast in a given folder.
    // TODO: Add system for tracking variables in a mast file
    constructor(uri, fileContents = "") {
        //debug("building mast file");
        super(uri);
        this.labelNames = [];
        if (path.extname(uri) === ".mast") {
            // If the contents are aleady read, we parse and move on. Don't need to read or parse again.
            if (fileContents !== "") {
                //debug("parsing, has contents");
                this.parse(fileContents);
                return;
            }
            else {
                fs.readFile(uri, "utf-8", (err, data) => {
                    if (err) {
                        (0, console_1.debug)("error reading file: " + uri + "\n" + err);
                        throw err;
                    }
                    else {
                        (0, console_1.debug)("parsing, no error");
                        this.parse(data);
                    }
                });
            }
        }
        else if (path.extname(uri) === ".py") {
            // Shouldn't do anything, Py files are very different from mast
        }
    }
    parse(text) {
        const textDocument = vscode_languageserver_textdocument_1.TextDocument.create(this.uri, "mast", 1, text);
        this.labelNames = (0, labels_1.getLabelsInFile)(text, this.uri);
        //debug(this.labelNames);
        // TODO: Parse variables, etc
    }
}
exports.MastFile = MastFile;
class PyFile extends FileCache {
    constructor(uri, fileContents = "") {
        super(uri);
        this.defaultFunctions = [];
        this.defaultFunctionCompletionItems = [];
        this.classes = [];
        // If fileContents is NOT an empty string (e.g. if it's from a zipped folder), then all we do is parse the contents
        if (path.extname(uri) === ".py") {
            // If file contents are included, we don't need to read, just go straight to parsing
            if (fileContents !== "") {
                this.parseWholeFile(fileContents, uri);
            }
            else {
                //debug("File contents empty, so we need to load it.");
                fs.readFile(uri, "utf-8", (err, data) => {
                    if (err) {
                        (0, console_1.debug)("error reading file: " + uri + "\n" + err);
                    }
                    else {
                        this.parseWholeFile(data, uri);
                    }
                });
            }
        }
        else if (path.extname(uri) === ".mast") {
            (0, console_1.debug)("Can't build a MastFile from PyFile");
            // Shouldn't do anything, Py files are very different from mast
        }
    }
    parseWholeFile(text, source) {
        if (!source.endsWith("timers.py"))
            return;
        // super.parseVariables(text); We don't actually want to look for variable names in python files
        //let className : RegExp = /^class .+?:/gm; 
        let className = /^class.*?(?=^[^\s])/gms; // Look for "class ClassName:" to parse class names.
        let functions = /^def.*?(?=^[^\s])/gms;
        let m;
        // Iterate over all classes to get their indices
        //classIndices.push(0);
        while (m = className.exec(text)) {
            const t = text.substring(m.index, m[0].length);
            const co = new ClassObject(t, source);
        }
        while (m = functions.exec(text)) {
        }
    }
    parseWholeFileOld(text, source) {
        if (!source.endsWith("timers.py"))
            return;
        // super.parseVariables(text); We don't actually want to look for variable names in python files
        //let className : RegExp = /^class .+?:/gm; 
        let className = /^class.*?(?=^[^\s])/gms; // Look for "class ClassName:" to parse class names.
        //const parentClass: RegExp = /\(\w*?\):/
        let comment = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/m;
        let checkText;
        let classIndices = [];
        let m;
        // Iterate over all classes to get their indices
        //classIndices.push(0);
        while (m = className.exec(text)) {
            classIndices.push(m.index);
            //debug("" + m.index + ": " +m[0]);
        }
        classIndices.push(text.length - 1);
        let len = classIndices.length; // How many indices there are - NOT the same as number of classes (should be # of classes - 1)
        // const file: PyFile = {
        // 	uri: source,
        // 	defaultFunctions: [],
        // 	defaultFunctionCompletionItems: [],
        // 	classes: []
        // }
        // Here we go over all the indices and get all functions between the last index (or 0) and the current index.
        // So if the file doesn't start with a class definition, all function prior to a class definition are added to the default functions
        // while class functions are addded to a ClassObject object.
        for (let i = 0; i < len; i++) {
            let t;
            if (i === 0) {
                t = text.substring(0, classIndices[0]);
            }
            else {
                t = text.substring(classIndices[i - 1], classIndices[i]);
            }
            const co = new ClassObject(t, source);
            // Since sbs functions aren't part of a class, but do need a "sbs." prefix, we pretend sbs is its own class. 
            // PyFile handles that.
            if (co.name === "") {
                this.defaultFunctions = co.methods;
                for (const m in co.methods) {
                    this.defaultFunctionCompletionItems.push(co.methods[m].completionItem);
                }
            }
            else {
                // Only add to class list if it's actually a class (or sbs)
                this.classes.push(co);
            }
        }
    }
}
exports.PyFile = PyFile;
class ClassObject {
    constructor(raw, sourceFile) {
        this.methods = [];
        this.methodCompletionItems = [];
        this.methodSignatureInformation = [];
        let className = /^class .+?:/gm; // Look for "class ClassName:" to parse class names.
        const parentClass = /\(\w*?\):/;
        let comment = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/m;
        // TODO: Could pull the class parent and interfaces (if any). Would this be useful?
        this.name = getRegExMatch(raw, className).replace("class ", "").replace(/\(.*?\):/, "");
        if (this.name === "" && sourceFile.endsWith("sbs.py")) {
            this.name = "sbs";
        }
        this.parent = getRegExMatch(raw, parentClass).replace(/.*\(/, "").replace(/\):?/, "");
        this.sourceFile = sourceFile;
        // Should just get the first set of comments, which would be the ones for the class itself
        this.documentation = getRegExMatch(raw, comment).replace(/\"\"\"/g, "");
        // Parse functions
        let functionSource = (this.name === "") ? sourceFile : this.name;
        this.methods = parseFunctions(raw, functionSource);
        for (const i in this.methods) {
            if (this.methods[i].functionType === "constructor") {
                this.constructorFunction = this.methods[i];
            }
            this.methodCompletionItems.push(this.methods[i].completionItem);
            this.methodSignatureInformation.push(this.methods[i].buildSignatureInformation());
        }
        this.completionItem = this.buildCompletionItem();
        return this;
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
}
exports.ClassObject = ClassObject;
class Function {
    constructor(raw, className) {
        this.name = "";
        this.className = className;
        this.parameters = [];
        const functionName = /((def\s)(.+?)\()/gm; // Look for "def functionName(" to parse function names.
        //let className : RegExp = /class (.+?):/gm; // Look for "class ClassName:" to parse class names.
        const functionParam = /\((.*?)\)/m; // Find parameters of function, if any.
        const returnValue = /->(.+?):/gm; // Get the return value (None, boolean, int, etc)
        const comment = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/gms;
        const isProperty = /(@property)/;
        const isClassMethod = /(@classmethod)|(@staticmethod)/;
        const isSetter = /\.setter/;
        this.name = getRegExMatch(raw, functionName).replace("def ", "").replace("(", "").trim();
        let params = getRegExMatch(raw, functionParam).replace(/\(|\)/g, "").replace(/self(.*?,|.*?$)/m, "").trim();
        this.rawParams = params;
        let comments = getRegExMatch(raw, comment).replace("\"\"\"", "").replace("\"\"\"", "");
        this.documentation = comments;
        let retVal = getRegExMatch(raw, returnValue).replace(/(:|->)/g, "").trim();
        if (retVal === "") {
            let cLines = comments.split("\n");
            for (let i = 0; i < cLines.length; i++) {
                if (cLines[i].includes("Return")) {
                    let retLine = cLines[i + 1].trim().replace("(", "");
                    if (retLine.startsWith("bool")) {
                        this.returnType = "boolean";
                    }
                    else if (retLine.startsWith("id") || retLine.startsWith("agent id")) {
                        this.returnType = "int";
                    }
                    else if (retLine.startsWith("list")) {
                        this.returnType = "list";
                    }
                    else if (retLine.startsWith("str")) {
                        this.returnType = "string";
                    }
                    else {
                        // We potentially modified retLine by replacing open parentheses, so we just use the source
                        this.returnType = cLines[i + 1].trim();
                    }
                    break;
                }
            }
        }
        this.returnType = retVal;
        let cik = vscode_languageserver_1.CompletionItemKind.Function;
        let cikStr = "function";
        if (isProperty.test(raw)) {
            cik = vscode_languageserver_1.CompletionItemKind.Property;
            cikStr = "property";
        }
        if (isClassMethod.test(raw)) {
            cik = vscode_languageserver_1.CompletionItemKind.Method;
            cikStr = "classmethod";
        }
        if (isSetter.test(raw)) {
            cik = vscode_languageserver_1.CompletionItemKind.Unit;
            cikStr = "setter";
        }
        if (this.name === "__init__") {
            cik = vscode_languageserver_1.CompletionItemKind.Constructor;
            cikStr = "constructor";
            this.name = className;
        }
        this.functionType = cikStr;
        this.parameters = this.buildParams(params);
        this.completionItem = this.buildCompletionItem(cik);
        this.signatureInformation = this.buildSignatureInformation();
        return this;
    }
    /**
     * Helper function, should only be called by constructor.
     * @param raw
     * @returns
     */
    buildParams(raw) {
        //debug("buildParams: " + this.name + "\n" + raw);
        const paramList = [];
        switch (raw) {
            case "":
                return paramList;
            case "self":
                return paramList;
        }
        const arr = raw.split(",");
        let parameterCounter = 0;
        for (const i in arr) {
            if (arr[i].trim().startsWith("self")) {
                continue;
            }
            const param = new Parameter(arr[i], 0);
            parameterCounter += 1;
            paramList.push(param);
        }
        //debug(paramList);
        return paramList;
    }
    /**
     * Helper function, should only be called by constructor.
     * @returns
     */
    buildCompletionItem(cik) {
        //const ci: CompletionItem;
        const labelDetails = {
            // Decided that this clutters up the UI too much. Same information is displayed in the CompletionItem details.
            //detail: "(" + params + ")",
            description: this.returnType
        };
        let label = this.name;
        let retType = this.returnType;
        let funcType = this.functionType;
        let classRef = ((this.className === "") ? "" : this.className + ".");
        // For constructor functions, we don't want something like vec2.vec2(args). We just want vec2(args).
        if (cik === vscode_languageserver_1.CompletionItemKind.Constructor) {
            classRef = "";
        }
        let ci_details = "(" + this.functionType + ") " + classRef + label + "(" + this.rawParams + "): " + retType;
        let ci = {
            label: this.name,
            kind: cik,
            //command: { command: 'editor.action.triggerSuggest', title: 'Re-trigger completions...' },
            documentation: this.documentation,
            detail: ci_details,
            labelDetails: labelDetails,
            insertText: this.name
        };
        return ci;
    }
    buildSignatureInformation() {
        let ci_details = "(" + this.functionType + ") " + ((this.className === "") ? "" : this.className + ".") + this.name + "(" + this.rawParams + "): " + (this.functionType === "constructor") ? this.className : this.name;
        const params = [];
        const si = {
            label: this.name,
            documentation: ci_details + "\n" + this.documentation,
            // TODO: Make this more Markup style instead of just text
            parameters: []
        };
        for (const i in this.parameters) {
            const pi = {
                label: this.parameters[i].name,
                documentation: this.parameters[i].name + "\nType: " + this.parameters[i].type
            };
            params.push(pi);
        }
        si.parameters = params;
        //debug(si);
        return si;
    }
}
exports.Function = Function;
class Parameter {
    constructor(raw, pos, docs) {
        this.name = "";
        this.documentation = (docs === undefined) ? "" : docs;
        const pDef = raw.split(":");
        this.name = pDef[0];
        if (pDef.length === 1) {
            this.type = "any?";
        }
        else {
            this.type = pDef[1].trim();
        }
        return this;
    }
}
exports.Parameter = Parameter;
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
function parseFunctions(raw, source) {
    let m;
    const fList = [];
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
        const f = new Function(m[0], source);
        fList.push(f);
    }
    return fList;
}
/**
 *
 * @param text
 * @param pos
 * @returns
 */
function getLabelDescription(text, pos) {
    const td = vscode_languageserver_textdocument_1.TextDocument.create("temp", "mast", 0, text);
    const labelLoc = td.positionAt(pos);
    let check = labelLoc.line + 1;
    let labelDesc = "";
    let multiLineComment = false;
    while (check < td.lineCount) {
        const lineStart = td.offsetAt({ line: check, character: 0 });
        const str = text.substring(lineStart, text.indexOf("\n", lineStart));
        (0, console_1.debug)(str);
        if (multiLineComment) {
            if (str.endsWith("*/")) {
                multiLineComment = false;
                labelDesc = labelDesc + str.replace("*/", "");
            }
            else {
                labelDesc = labelDesc + str;
            }
        }
        if (str.trim().startsWith("/*")) {
            multiLineComment = true;
            labelDesc = labelDesc + str.replace("/*", "");
        }
        else {
            if (str.trim().startsWith("\"") || str.trim().startsWith("#")) {
                (0, console_1.debug)(str);
                labelDesc = labelDesc + str.replace("\"", "").replace("#", "");
            }
            else {
                break;
            }
        }
        check++;
    }
    return labelDesc;
}
function getVariablesInFile(textDocument) {
    const text = textDocument.getText();
    const cache = (0, cache_1.getCache)(textDocument.uri);
    (0, console_1.debug)("Trying to get variables");
    let variables = [];
    const pattern = /^\s*?\w+(?=\s*=[^=]\s*?)/gm;
    const lines = text.split("\n");
    (0, console_1.debug)("Done getting variables");
    let m;
    let found = false;
    for (const line of lines) {
        const match = line.match(pattern);
        if (match) {
            const v = match[0];
            (0, console_1.debug)(v);
            // Get the variable type at this point
            const equal = line.indexOf("=") + 1;
            const typeEvalStr = line.substring(equal).trim();
            (0, console_1.debug)(typeEvalStr);
            const t = getVariableType(typeEvalStr, textDocument.uri);
            (0, console_1.debug)(t);
            // Check if the variable is already found
            for (const _var of variables) {
                if (_var.name === v) {
                    // If it's already part of the list, then do this:
                    break;
                }
            }
            const variable = {
                name: v,
                possibleTypes: [],
                modifiers: []
            };
        }
    }
    return variables;
}
function getVariableType(typeEvalStr, uri) {
    const test = "to_object(amb_id)" === typeEvalStr;
    const isNumberType = (s) => !isNaN(+s) && isFinite(+s) && !/e/i.test(s);
    const cache = (0, cache_1.getCache)(uri);
    let type = "any";
    // Check if it's a string
    if (typeEvalStr.startsWith("\"") || typeEvalStr.startsWith("'")) {
        return "string";
        // Check if its an f-string
    }
    else if (typeEvalStr.startsWith("f\"") || typeEvalStr.startsWith("f'")) {
        return "string";
        // Check if it's a multiline string
    }
    else if (typeEvalStr.startsWith("\"\"\"") || typeEvalStr.startsWith("'''")) {
        return "string";
    }
    else if (typeEvalStr === "True" || typeEvalStr === "False") {
        return "boolean";
    }
    else if (isNumberType(typeEvalStr)) {
        // Check if it's got a decimal
        if (typeEvalStr.includes(".")) {
            return "float";
        }
        // Default to integer
        return "int";
    }
    // Check over all default functions
    for (const f of cache.missionDefaultFunctions) {
        if (typeEvalStr.startsWith(f.name)) {
            if (test)
                (0, console_1.debug)(f);
            return f.returnType;
        }
    }
    // Is this a class, or a class function?
    for (const co of cache.missionClasses) {
        if (typeEvalStr.startsWith(co.name)) {
            type = co.name;
            // Check if it's a static method of the class
            for (const func of co.methods) {
                if (typeEvalStr.startsWith(co.name + "." + func.name)) {
                    if (test)
                        (0, console_1.debug)(co.name + "." + func.name);
                    return func.returnType;
                }
            }
            // If it's not a static method, then just return the class
            if (test)
                (0, console_1.debug)(co);
            return type;
        }
    }
    // If it's none of the above, then it's probably an object, or a parameter of that object
    if (test)
        (0, console_1.debug)(type);
    return type;
}
//# sourceMappingURL=data.js.map