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
const variables_1 = require("./variables");
const globals_1 = require("./globals");
const roles_1 = require("./roles");
const comments_1 = require("./comments");
const prefabs_1 = require("./prefabs");
/**
 * This accounts for classes that use a different name as a global than the class name.
 * E.g. the sim global variable refers to the simulation class. Instead of simulation.functionName(), use sim.functionName().
 */
const replaceNames = [
    ['simulation', 'sim']
];
/**
 * This accounts for modules that are treated as classes instead of just adding the functions as default functions.
 * So instead of simply using the arc() function from scatter.py, you'd need to use scatter.arc()
 */
const asClasses = ["sbs.py", "scatter.py", "faces.py"];
/**
 * This accounts for modules that prepend the class name to the function name.
 * E.g. names.random_kralien_name() would become names_random_kralien_name()
 */
const prepend = ["ship_data.py", "names.py", "scatter.py"];
// TODO: Account for names_random_kralien() instead of names.random_kralien() or random_kralien()
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
    constructor(uri, fileContents = "") {
        //debug("building mast file");
        super(uri);
        this.labelNames = [];
        // TODO: Add support for holding label information for all files listed in __init__.mast in a given folder.
        // TODO: Add system for tracking variables in a mast file
        this.variables = [];
        this.roles = [];
        this.prefabs = [];
        this.strings = [];
        this.comments = [];
        this.yamls = [];
        this.squareBrackets = [];
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
                        //debug("parsing, no error");
                        this.parse(data);
                    }
                });
            }
        }
        else if (path.extname(uri) === ".py") {
            // Shouldn't do anything, Py files are very different from mast
            (0, console_1.debug)("ERROR: Trying to parse a .py file as a .mast file: " + uri);
            // Send notification to client?
        }
    }
    parse(text) {
        const textDocument = vscode_languageserver_textdocument_1.TextDocument.create(this.uri, "mast", 1, text);
        this.labelNames = (0, labels_1.parseLabelsInFile)(text, this.uri);
        this.prefabs = (0, prefabs_1.parsePrefabs)(this.labelNames);
        // TODO: Parse variables, etc
        this.variables = (0, variables_1.getVariableNamesInDoc)(textDocument);
        this.roles = (0, roles_1.getRolesForFile)(text);
        this.comments = (0, comments_1.parseComments)(textDocument);
        this.strings = (0, comments_1.parseStrings)(textDocument);
        this.yamls = (0, comments_1.parseYamls)(textDocument);
        this.squareBrackets = (0, comments_1.parseSquareBrackets)(textDocument);
    }
    getVariableNames() {
        let arr = [];
        (0, console_1.debug)("Getting variable names");
        for (const v of this.variables) {
            const ci = {
                label: v,
                kind: vscode_languageserver_1.CompletionItemKind.Variable,
                //TODO: Check type of variable?
                labelDetails: { description: path.basename(this.uri) + ": var" },
                //detail: "From " + 
            };
            arr.push(ci);
        }
        const arrUniq = [...new Map(arr.map(v => [v.label, v])).values()];
        return arrUniq;
    }
}
exports.MastFile = MastFile;
class PyFile extends FileCache {
    constructor(uri, fileContents = "") {
        uri = (0, fileFunctions_1.fixFileName)(uri);
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
        //if (!source.endsWith("timers.py")) return;
        // super.parseVariables(text); We don't actually want to look for variable names in python files
        // Instead of just assuming that there is always another class following, it could be a function, so we need to account for this.
        let blockStart = /^(class|def) .+?$/gm;
        //const parentClass: RegExp = /\(\w*?\):/
        let comment = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/m;
        let checkText;
        let blockIndices = [];
        let m;
        // Iterate over all classes to get their indices
        //classIndices.push(0);
        while (m = blockStart.exec(text)) {
            blockIndices.push(m.index);
            //debug("" + m.index + ": " +m[0]);
        }
        blockIndices.push(text.length - 1);
        let len = blockIndices.length; // How many indices there are - NOT the same as number of classes (should be # of classes - 1)
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
                t = text.substring(0, blockIndices[0]);
            }
            else {
                t = text.substring(blockIndices[i - 1], blockIndices[i]);
            }
            if (t.startsWith("class")) {
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
                    if (co.methods.length !== 0)
                        this.classes.push(co);
                    //debug(co);
                }
            }
            else if (t.startsWith("def")) {
                // if (source.includes("sbs.py")) debug("TYRING ANOTHER SBS FUNCTION"); debug(source);
                const f = new Function(t, "", source);
                this.defaultFunctions.push(f);
                this.defaultFunctionCompletionItems.push(f.completionItem);
                //debug(f);
            }
        }
        for (const o of asClasses) {
            if (path.basename(this.uri) === o) {
                const c = new ClassObject("", o);
                c.name = o.replace(".py", "");
                c.completionItem = c.buildCompletionItem();
                c.methods = this.defaultFunctions;
                c.methodCompletionItems = this.defaultFunctionCompletionItems;
                for (const f of c.methods) {
                    c.methodSignatureInformation.push(f.signatureInformation);
                }
                this.classes.push(c);
                this.defaultFunctionCompletionItems = [];
                this.defaultFunctions = [];
            }
        }
        // This checks if the module name should be prepended to the function names in this module
        let prefix = "";
        for (const o of prepend) {
            if (path.basename(this.uri) === o) {
                prefix = o.replace(".py", "_");
                for (const m of this.defaultFunctions) {
                    m.name = prefix + m.name;
                }
                for (const c of this.defaultFunctionCompletionItems) {
                    c.label = prefix + c.label;
                    c.insertText = prefix + c.insertText;
                }
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
        this.name = getRegExMatch(raw, className).replace("class ", "").replace(/(\(.*?\))?:/, "");
        for (const n of replaceNames) {
            if (this.name === n[0]) {
                this.name = n[1];
            }
        }
        // if (this.name === "" && sourceFile.endsWith("sbs.py")) {
        // 	this.name = "sbs";
        // }
        this.parent = getRegExMatch(raw, parentClass).replace(/.*\(/, "").replace(/\):?/, "");
        this.sourceFile = sourceFile;
        // Should just get the first set of comments, which would be the ones for the class itself
        this.documentation = getRegExMatch(raw, comment).replace(/\"\"\"/g, "");
        // Parse functions
        let functionSource = (this.name === "") ? sourceFile : this.name;
        // debug(this.sourceFile)
        this.methods = parseFunctions(raw, functionSource, this.sourceFile);
        for (const i in this.methods) {
            if (this.methods[i].functionType === "constructor") {
                this.constructorFunction = this.methods[i];
            }
            this.methodCompletionItems.push(this.methods[i].completionItem);
            this.methodSignatureInformation.push(this.methods[i].signatureInformation); //.buildSignatureInformation());
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
    constructor(raw, className, sourceFile) {
        this.name = "";
        this.className = className;
        this.sourceFile = sourceFile;
        this.parameters = [];
        const functionName = /(?:def\s)(.+?)(?:\()/gm; ///((def\s)(.+?)\()/gm; // Look for "def functionName(" to parse function names.
        //let className : RegExp = /class (.+?):/gm; // Look for "class ClassName:" to parse class names.
        const functionParam = /\((.*?)\)/m; // Find parameters of function, if any.
        // Could replace functionParam regex with : (?:def\s.+?\()(.*?)(?:\)(:|\s*->))
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
        // if (params.includes('art')) {
        // 	debug("NEW ART")
        // 	debug(params)
        // 	debug(this.className + "." + this.name)
        // }
        this.parameters = this.buildParams(params);
        this.completionItem = this.buildCompletionItem(cik);
        this.signatureInformation = this.buildSignatureInformation();
        //debug(this);
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
     * Helper function, returns information about the function in the format of
     * "(function) ClassName.functionName(params): returnType"
     * @returns
     */
    buildFunctionDetails() {
        let classRef = ((this.className === "") ? "" : this.className + ".");
        if (this.functionType === 'constructor') {
            classRef = "";
        }
        let paramList = "";
        if (this.functionType !== 'property')
            paramList = "(" + this.rawParams + ")" + paramList;
        let retType = "";
        if (this.returnType !== "")
            retType = " -> " + this.returnType;
        let ci_details = "(" + this.functionType + ") " + classRef + this.name + paramList + retType;
        return ci_details;
    }
    /**
     *
     * @returns a new {@link MarkupContent MarkupContent} representing the function and its documentation.
     */
    buildMarkUpContent(docs = "") {
        if (this.sourceFile.includes("sbs.py"))
            (0, console_1.debug)("Generating an SBS function");
        (0, console_1.debug)(this.sourceFile);
        /**
         * TODO: Fix this for CompletionItem in {@link buildCompletionItem buildCompletionItem}
         */
        if (docs === "") {
            docs = this.documentation.toString();
        }
        const functionDetails = "```javascript\n" + this.buildFunctionDetails() + "\n```";
        const documentation = "```text\n\n" + this.documentation + "```";
        // const documentation = (this.documentation as string).replace(/\t/g,"&emsp;").replace(/    /g,"&emsp;").replace(/\n/g,"\\\n");
        //                    artemis-sbs.LegendaryMissions.upgrades.v1.0.4.mastlib/upgrade.py
        // https://github.com/artemis-sbs/LegendaryMissions/blob/main/upgrades/upgrade.py
        //                  artemis-sbs.sbs_utils.v1.0.4.sbslib/sbs_utils/procedural/roles.py
        // https://github.com/artemis-sbs/sbs_utils/blob/master/sbs_utils/procedural/roles.py
        // https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/mock/sbs.py
        // https://github.com/artemis-sbs/sbs_utils/blob/master/mock/sbs.py
        // Convert the source to reference the applicable sbs_utils or legendarymissions github page
        const regex = /\.v((\d+)\.(\d+)\.(\d+))\.(\d+\.)*(((mast|sbs)lib)|(zip))/;
        let source = this.sourceFile;
        if (this.sourceFile.includes("sbs.py"))
            (0, console_1.debug)("Generating an SBS MarkupContent");
        let url = "";
        (0, console_1.debug)(source);
        if (source.includes("LegendaryMissions")) {
            source = "https://github.com/" + source.replace(regex, "").replace("LegendaryMissions.", "LegendaryMissions/blob/main/");
        }
        else if (source.includes("githubusercontent")) {
            (0, console_1.debug)("Githubusercontent foudn");
            source = source.replace("raw.githubusercontent", "github").replace("/master", "/blob/master");
        }
        else if (source.includes("sbs_utils")) {
            source = "https://github.com/" + source.replace(regex, "/blob/master").replace(".", "/");
        }
        source = "\nSource:  \n  " + source;
        if (docs !== "") {
            docs = "\n\n```text\n\n" + docs + "\n```";
        }
        const ret = {
            kind: "markdown",
            value: "```javascript\n" + this.buildFunctionDetails() + "\n```" + docs + source
            // value: functionDetails + "\n" + documentation + "\n\n" + source
        };
        return ret;
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
        // let ci_details: string = "(" + this.functionType + ") " + classRef + this.name + "(" + this.rawParams + "): " + this.returnType;
        const functionDetails = "```javascript\n" + this.buildFunctionDetails() + "\n```";
        // const documentation = "```text\n\n" + this.documentation + "```";
        const documentation = this.documentation.replace(/\t/g, "&emsp;").replace(/    /g, "&emsp;").replace(/\n/g, "\\\n");
        // debug(documentation)
        const source = "Source: " + this.sourceFile;
        let docs = {
            kind: 'markdown',
            value: functionDetails + "  \n  " + documentation + "  \n  " + source
        };
        // let docs = this.buildMarkUpContent(documentation);
        // docs.value = docs.value.replace(/\t/g,"&emsp;").replace(/    /g,"&emsp;").replace(/\n/g,"\\\n");
        let insert = this.name;
        if (this.parameters.length === 0 && this.functionType !== "property") {
            insert = this.name + "()";
        }
        let ci = {
            label: this.name,
            kind: cik,
            //command: { command: 'editor.action.triggerSuggest', title: 'Re-trigger completions...' },
            documentation: docs, // this.documentation,
            // detail: ci_details,
            labelDetails: labelDetails,
            insertText: insert
        };
        return ci;
    }
    buildSignatureInformation() {
        let ci_details = "(" + this.functionType + ") " + ((this.className === "") ? "" : this.className + ".") + this.name + "(" + this.rawParams + "): " + (this.functionType === "constructor") ? this.className : this.name;
        //debug(ci_details)
        const params = [];
        // const markup: MarkupContent = {
        // 	kind: "markdown",
        // 	value: "```javascript\n" + ci_details + "\n```\n```text\n" + this.documentation + "\n```\n"
        // }
        //debug(markup)
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
            if (pi.label === "style") {
                pi.documentation = pi.documentation + "\n\nStyle information:";
                for (const s of (0, globals_1.getGlobals)().widget_stylestrings) {
                    if (s.function === this.name) {
                        let doc = s.name + ":\n";
                        doc = doc + "    " + s.docs;
                        pi.documentation = pi.documentation + "\n" + doc;
                    }
                }
            }
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
        this.name = pDef[0].trim();
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
function parseFunctions(raw, source, sourceFile) {
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
        const f = new Function(m[0], source, sourceFile);
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
function getLabelDescription(td, pos) {
    const labelLoc = td.positionAt(pos);
    const text = td.getText();
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
            const t = getVariableTypes(typeEvalStr, textDocument.uri);
            (0, console_1.debug)(t);
            // Check if the variable is already found
            let found = false;
            for (const _var of variables) {
                if (_var.name === v) {
                    found = true;
                    // If it's already part of the list, then do this:
                    for (const varType of t) {
                        if (!_var.possibleTypes.includes(varType)) {
                            _var.possibleTypes.push(varType);
                        }
                    }
                    break;
                }
            }
            if (!found) {
                const variable = {
                    name: v,
                    possibleTypes: t,
                    modifiers: []
                };
            }
        }
    }
    return variables;
}
function getVariableTypes(typeEvalStr, uri) {
    let types = [];
    const test = "to_object(amb_id)" === typeEvalStr;
    const isNumberType = (s) => !isNaN(+s) && isFinite(+s) && !/e/i.test(s);
    const cache = (0, cache_1.getCache)(uri);
    //let type: string = "any";
    // Check if it's a string
    if (typeEvalStr.startsWith("\"") || typeEvalStr.startsWith("'")) {
        types.push("string");
        // Check if its an f-string
    }
    else if (typeEvalStr.startsWith("f\"") || typeEvalStr.startsWith("f'")) {
        types.push("string");
        // Check if it's a multiline string
    }
    else if (typeEvalStr.startsWith("\"\"\"") || typeEvalStr.startsWith("'''")) {
        types.push("string");
    }
    else if (typeEvalStr === "True" || typeEvalStr === "False") {
        types.push("boolean");
    }
    else if (isNumberType(typeEvalStr)) {
        // Check if it's got a decimal
        if (typeEvalStr.includes(".")) {
            types.push("float");
        }
        // Default to integer
        types.push("int");
    }
    // Check over all default functions
    for (const f of cache.missionDefaultFunctions) {
        if (typeEvalStr.startsWith(f.name)) {
            if (test)
                (0, console_1.debug)(f);
            types.push(f.returnType);
        }
    }
    // Is this a class, or a class function?
    for (const co of cache.missionClasses) {
        if (typeEvalStr.startsWith(co.name)) {
            // Check if it's a static method of the class
            for (const func of co.methods) {
                if (typeEvalStr.startsWith(co.name + "." + func.name)) {
                    if (test)
                        (0, console_1.debug)(co.name + "." + func.name);
                    types.push(func.returnType);
                }
            }
            // If it's not a static method, then just return the class
            if (test)
                (0, console_1.debug)(co);
            types.push(co.name);
        }
    }
    // If it's none of the above, then it's probably an object, or a parameter of that object
    if (test)
        (0, console_1.debug)(types);
    return types;
}
//# sourceMappingURL=data.js.map