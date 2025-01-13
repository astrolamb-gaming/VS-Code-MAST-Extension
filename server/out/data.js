"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Parameter = exports.Function = exports.ClassObject = void 0;
exports.getRegExMatch = getRegExMatch;
exports.parseWholeFile = parseWholeFile;
const vscode_languageserver_1 = require("vscode-languageserver");
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
        if (this.name === "" && sourceFile === "sbs/__init__") {
            this.name = "sbs";
        }
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
        let isClassMethod = /@classmethod/;
        const isSetter = /\.setter/;
        this.name = getRegExMatch(raw, functionName).replace("def ", "").replace("(", "").trim();
        let params = getRegExMatch(raw, functionParam).replace(/\(|\)/g, "").replace(/self(.*?,|.*?$)/m, "").trim();
        this.rawParams = params;
        let retVal = getRegExMatch(raw, returnValue).replace(/(:|->)/g, "").trim();
        this.returnType = retVal;
        let comments = getRegExMatch(raw, comment).replace("\"\"\"", "").replace("\"\"\"", "");
        this.documentation = comments;
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
function parseWholeFile(text, source) {
    let className = /^class .+?:/gm; // Look for "class ClassName:" to parse class names.
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
    const file = {
        uri: source,
        defaultFunctions: [],
        defaultFunctionCompletionItems: [],
        classes: []
    };
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
        if (co.name === "") {
            file.defaultFunctions = co.methods;
            for (const m in co.methods) {
                file.defaultFunctionCompletionItems.push(co.methods[m].completionItem);
            }
        }
        else {
            // Only add to class list if it's actually a class (or sbs)
            file.classes.push(co);
        }
    }
    return file;
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
//# sourceMappingURL=data.js.map