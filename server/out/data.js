"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PyFile = exports.MastFile = exports.FileCache = exports.prepend = exports.asClasses = exports.replaceNames = void 0;
exports.getLabelDescription = getLabelDescription;
const path = require("path");
const fs = require("fs");
const console_1 = require("console");
const vscode_languageserver_1 = require("vscode-languageserver");
const labels_1 = require("./tokens/labels");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const fileFunctions_1 = require("./fileFunctions");
const cache_1 = require("./cache");
const roles_1 = require("./roles");
const prefabs_1 = require("./tokens/prefabs");
const variables_1 = require("./tokens/variables");
const function_1 = require("./data/function");
const class_1 = require("./data/class");
/**
 * This accounts for classes that use a different name as a global than the class name.
 * E.g. the sim global variable refers to the simulation class. Instead of simulation.functionName(), use sim.functionName().
 */
exports.replaceNames = [
    ['simulation', 'sim']
];
/**
 * This accounts for modules that are treated as classes instead of just adding the functions as default functions.
 * So instead of simply using the arc() function from scatter.py, you'd need to use scatter.arc()
 */
exports.asClasses = ["sbs", "scatter", "faces"];
/**
 * This accounts for modules that prepend the class name to the function name.
 * E.g. names.random_kralien_name() would become names_random_kralien_name()
 */
exports.prepend = ["ship_data", "names", "scatter"];
// TODO: Account for names_random_kralien() instead of names.random_kralien() or random_kralien()
class FileCache {
    constructor(uri) {
        this.variableNames = [];
        this.uri = (0, fileFunctions_1.fixFileName)(uri);
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
// export interface Variable {
// 	name: string,
// 	/**
// 	 * Given that MAST and Python are not stronly typed, there are lots of possible types the variable could have.
// 	 */
// 	possibleTypes: string[],
// 	/**
// 	 * variable modifiers like "shared"
// 	 */
// 	modifiers: string[]
// }
class MastFile extends FileCache {
    // strings: CRange[] = [];
    // comments: CRange[] = [];
    // yamls: CRange[] = [];
    // squareBrackets: CRange[] = [];
    constructor(uri, fileContents = "") {
        //debug("building mast file");
        super(uri);
        this.labelNames = [];
        // TODO: Add support for holding label information for all files listed in __init__.mast in a given folder.
        // TODO: Add system for tracking variables in a mast file
        this.variables = [];
        this.roles = [];
        this.prefabs = [];
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
        // debug("parsing mast file: " + this.uri)
        const textDocument = vscode_languageserver_textdocument_1.TextDocument.create(this.uri, "mast", 1, text);
        this.labelNames = (0, labels_1.parseLabelsInFile)(text, this.uri);
        this.prefabs = (0, prefabs_1.parsePrefabs)(this.labelNames);
        // TODO: Parse variables, etc
        //this.variables = getVariableNamesInDoc(textDocument);
        this.variables = (0, variables_1.parseVariables)(textDocument); //
        this.roles = (0, roles_1.getRolesForFile)(text);
    }
    getVariableNames() {
        let arr = [];
        (0, console_1.debug)("Getting variable names");
        for (const v of this.variables) {
            const ci = {
                label: v.name,
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
        // defaultFunctionCompletionItems: CompletionItem[] = [];
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
        // Gotta clear old data
        // this.defaultFunctionCompletionItems = [];
        this.classes = [];
        this.defaultFunctions = [];
        this.variableNames = [];
        //if (!source.endsWith("timers.py")) return;
        // super.parseVariables(text); We don't actually want to look for variable names in python files
        // Instead of just assuming that there is always another class following, it could be a function, so we need to account for this.
        let blockStart = /^(class|def) .+?$/gm;
        //const parentClass: RegExp = /\(\w*?\):/
        let comment = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/m;
        let checkText;
        let blockIndices = [];
        let m;
        const doc = vscode_languageserver_textdocument_1.TextDocument.create(source, "py", 1, text);
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
            let start = blockIndices[0];
            if (i === 0) {
                t = text.substring(0, start);
            }
            else {
                start = blockIndices[i - 1];
                t = text.substring(start, blockIndices[i]);
            }
            if (t.startsWith("class")) {
                const co = new class_1.ClassObject(t, source);
                co.startPos = start + t.indexOf(co.name);
                const r = {
                    start: doc.positionAt(co.startPos),
                    end: doc.positionAt(co.startPos + co.name.length)
                };
                co.location = {
                    uri: source,
                    range: r
                };
                // Since sbs functions aren't part of a class, but do need a "sbs." prefix, we pretend sbs is its own class. 
                // PyFile handles that.
                if (co.name === "") {
                    this.defaultFunctions = co.methods;
                    for (const m of co.methods) {
                        m.startIndex = start + t.indexOf("def " + m.name) + 4;
                        m.location = {
                            uri: source,
                            range: {
                                start: doc.positionAt(m.startIndex),
                                end: doc.positionAt(m.startIndex + m.name.length)
                            }
                        };
                        // this.defaultFunctionCompletionItems.push(m.completionItem);
                    }
                }
                else {
                    // Only add to class list if it's actually a class (or sbs)
                    if (co.methods.length !== 0)
                        this.classes.push(co);
                    for (const m of co.methods) {
                        m.startIndex = start + t.indexOf("def " + m.name) + 4;
                        m.location = {
                            uri: source,
                            range: {
                                start: doc.positionAt(m.startIndex),
                                end: doc.positionAt(m.startIndex + m.name.length)
                            }
                        };
                    }
                    //debug(co);
                }
            }
            else if (t.startsWith("def")) {
                // if (source.includes("sbs.py")) debug("TYRING ANOTHER SBS FUNCTION"); debug(source);
                const m = new function_1.Function(t, "", source);
                m.startIndex = start + t.indexOf("def " + m.name) + 4;
                m.location = {
                    uri: source,
                    range: {
                        start: doc.positionAt(m.startIndex),
                        end: doc.positionAt(m.startIndex + m.name.length)
                    }
                };
                this.defaultFunctions.push(m);
                // this.defaultFunctionCompletionItems.push(m.completionItem);
                //debug(f);
            }
        }
        for (const o of exports.asClasses) {
            if (path.basename(this.uri).replace(".py", "") === o) {
                const c = new class_1.ClassObject("", path.basename(this.uri));
                c.name = o;
                // c.name = o.replace(".py","");
                c.completionItem = c.buildCompletionItem();
                c.methods = this.defaultFunctions;
                // Good here
                (0, console_1.debug)("Class methods: " + c.name);
                (0, console_1.debug)(c.methods);
                // c.methodCompletionItems = this.defaultFunctionCompletionItems;
                // for (const f of c.methods) {
                // 	c.methodSignatureInformation.push(f.signatureInformation);
                // }
                this.classes.push(c);
                if (c.name !== "scatter") {
                    // this.defaultFunctionCompletionItems = [];
                    this.defaultFunctions = [];
                }
            }
        }
        // This checks if the module name should be prepended to the function names in this module
        let prefix = "";
        for (const o of exports.prepend) {
            if (path.basename(this.uri).replace(".py", "") === o) {
                prefix = o + "_"; //o.replace(".py","_");
                for (const m of this.defaultFunctions) {
                    m.name = prefix + m.name;
                }
                // for (const c of this.defaultFunctionCompletionItems) {
                // 	c.label = prefix + c.label;
                // 	c.insertText = prefix + c.insertText;
                // }
            }
        }
    }
    getDefaultMethodCompletionItems() {
        let ci = [];
        for (const f of this.defaultFunctions) {
            ci.push(f.buildCompletionItem());
        }
        return ci;
    }
}
exports.PyFile = PyFile;
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
// export function getVariablesInFile(textDocument:TextDocument) {
// 	const text = textDocument.getText();
// 	const cache = getCache(textDocument.uri);
// 	debug("Trying to get variables");
// 	let variables: Variable[] = [];
// 	const pattern: RegExp = /^\s*?\w+(?=\s*=[^=]\s*?)/gm;
// 	const lines = text.split("\n");
// 	debug("Done getting variables");
// 	let m: RegExpExecArray | null;
// 	let found = false;
// 	for (const line of lines) {
// 		const match = line.match(pattern);
// 		if (match) {
// 			const v = match[0];
// 			debug(v);
// 			// Get the variable type at this point
// 			const equal = line.indexOf("=")+1;
// 			const typeEvalStr = line.substring(equal).trim();
// 			debug(typeEvalStr);
// 			const t = getVariableTypes(typeEvalStr,textDocument.uri);
// 			debug(t);
// 			// Check if the variable is already found
// 			let found = false;
// 			for (const _var of variables) {
// 				if (_var.name === v) {
// 					found = true;
// 					// If it's already part of the list, then do this:
// 					for (const varType of t) {
// 						if (!_var.possibleTypes.includes(varType)) {
// 							_var.possibleTypes.push(varType);
// 						}
// 					}
// 					break;
// 				}
// 			}
// 			if (!found) {
// 				const variable:Variable = {
// 					name: v,
// 					possibleTypes: t,
// 					modifiers: []
// 				}
// 			}
// 		}
// 	}
// 	return variables;
// }
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