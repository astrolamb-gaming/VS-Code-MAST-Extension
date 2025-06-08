"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PyFile = void 0;
const console_1 = require("console");
const fs = require("fs");
const path = require("path");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const data_1 = require("../data");
const class_1 = require("../data/class");
const function_1 = require("../data/function");
const fileFunctions_1 = require("../fileFunctions");
const words_1 = require("../tokens/words");
class PyFile extends data_1.FileCache {
    constructor(uri, fileContents = "") {
        // if (fileContents === "") debug("pyFile Contents empty for " + uri)
        uri = (0, fileFunctions_1.fixFileName)(uri);
        super(uri);
        this.defaultFunctions = [];
        this.classes = [];
        this.words = [];
        this.globalFiles = [];
        this.globals = [];
        this.isGlobal = false;
        // If fileContents is NOT an empty string (e.g. if it's from a zipped folder), then all we do is parse the contents
        if (path.extname(uri) === ".py") {
            // If file contents are included, we don't need to read, just go straight to parsing
            if (fileContents !== "") {
                this.parseWholeFile(fileContents);
            }
            else {
                //debug("File contents empty, so we need to load it.");
                fs.readFile(uri, "utf-8", (err, data) => {
                    if (err) {
                        (0, console_1.debug)("error reading file: " + uri + "\n" + err);
                    }
                    else {
                        this.parseWholeFile(data);
                    }
                });
            }
        }
        else if (path.extname(uri) === ".mast") {
            (0, console_1.debug)("Can't build a MastFile from PyFile");
            // Shouldn't do anything, Py files are very different from mast
        }
    }
    parseWholeFile(text) {
        // Gotta clear old data
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
        const doc = vscode_languageserver_textdocument_1.TextDocument.create(this.uri, "py", 1, text);
        this.words = (0, words_1.parseWords)(doc);
        // Iterate over all classes to get their indices
        //classIndices.push(0);
        while (m = blockStart.exec(text)) {
            blockIndices.push(m.index);
            //debug("" + m.index + ": " +m[0]);
        }
        blockIndices.push(text.length - 1);
        let len = blockIndices.length; // How many indices there are - NOT the same as number of classes (should be # of classes - 1)
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
                const co = new class_1.ClassObject(t, this.uri);
                co.startPos = start + t.indexOf(co.name);
                const r = {
                    start: doc.positionAt(co.startPos),
                    end: doc.positionAt(co.startPos + co.name.length)
                };
                co.location = {
                    uri: this.uri,
                    range: r
                };
                // Since sbs functions aren't part of a class, but do need a "sbs." prefix, we pretend sbs is its own class. 
                // PyFile handles that.
                if (co.name === "") {
                    this.defaultFunctions = co.methods;
                    for (const m of co.methods) {
                        m.startIndex = start + t.indexOf("def " + m.name) + 4;
                        m.location = {
                            uri: this.uri,
                            range: {
                                start: doc.positionAt(m.startIndex),
                                end: doc.positionAt(m.startIndex + m.name.length)
                            }
                        };
                    }
                }
                else {
                    // Only add to class list if it's actually a class (or sbs)
                    if (co.methods.length !== 0)
                        this.classes.push(co);
                    for (const m of co.methods) {
                        m.startIndex = start + t.indexOf("def " + m.name) + 4;
                        m.location = {
                            uri: this.uri,
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
                const m = new function_1.Function(t, "", this.uri);
                m.startIndex = start + t.indexOf("def " + m.name) + 4;
                m.location = {
                    uri: this.uri,
                    range: {
                        start: doc.positionAt(m.startIndex),
                        end: doc.positionAt(m.startIndex + m.name.length)
                    }
                };
                this.defaultFunctions.push(m);
            }
            // if (this.uri.endsWith("ship_data.py")) {
            // 	debug(this.defaultFunctions)
            // }
        }
        /**
         * This refers to MAST globals, NOT extension globals
         */
        let globalRegEx = /MastGlobals\.import_python_module\((["']([\w_\.]+)["'])(,[ \t]['"](\w+)['"])?\)/g;
        // Here we find all the instances of import_python_module() in the file.
        while (m = globalRegEx.exec(text)) {
            // debug(m[0])
            let mod = m[2];
            let name = m[4];
            let g = [mod];
            if (name === undefined) {
                name = "";
            }
            g.push(name);
            // debug(g);
            this.globalFiles.push(g);
        }
        // debug("GLOBALS")
        // debug(this.globals);
        let findMastGlobals = /class MastGlobals:.*?globals = {(.*?)}/ms;
        let n = text.match(findMastGlobals);
        // debug(n);
        if (n !== null) {
            const globals = n[1].split("\n");
            const newGlobals = [];
            // debug("NOT NULL")
            for (let g of globals) {
                if (g.trim().startsWith("#"))
                    continue;
                g = g.replace(/#.*/, "");
                // debug(g)
                let arr = g.match(/[\"']([\w]+)[\"'][\t ]*:[\t ]*(.*?)[,#\n]/);
                // debug(arr);
                if (arr !== null) {
                    const globalRef = arr[1];
                    const globalVar = arr[2];
                    if (globalVar.includes("scatter") || globalVar.includes("faces") || globalVar.includes("__build_class__"))
                        continue; // This leaves scatter and faces out of it. These are already parsed anyway. Also __build_class__ probably doesn't need exposed to the user.
                    newGlobals.push([globalRef, globalVar]);
                }
            }
            // for (let g of globals) {
            // 	// g = g.replace(/#.*/, "");
            // 	// let start = g.indexOf(":")+1;
            // 	// let end = g.indexOf(",");
            // 	// if (end === -1) end = g.length-1;
            // 	// let global = g.substring(start, end).trim();
            // 	// if (global !== "") {
            // 	// 	newGlobals.push(global);
            // 	// }
            // }
            (0, console_1.debug)(newGlobals);
            this.globals = newGlobals;
            (0, console_1.debug)("^^^ GLOBALS!");
        }
        // debug("asClasses stuff...")
        for (const o of data_1.asClasses) {
            if (path.basename(this.uri).replace(".py", "") === o) {
                const c = new class_1.ClassObject("", path.basename(this.uri));
                c.name = o;
                c.methods = this.defaultFunctions;
                this.classes.push(c);
                if (c.name !== "scatter") {
                    this.defaultFunctions = [];
                }
                else {
                    // debug(this.defaultFunctions);
                    // debug(c.methods);
                }
            }
        }
        // // This checks if the module name should be prepended to the function names in this module
        // let prefix = "";
        // for (const o of prepend) {
        // 	if (path.basename(this.uri).replace(".py", "") === o) {
        // 		prefix = o + "_"; //o.replace(".py","_");
        // 		const newDefaults: Function[] = [];
        // 		for (const m of this.defaultFunctions) {
        // 			// const n = Object.assign({},m);
        // 			const n = m.copy();
        // 			n.name = prefix + n.name;
        // 			newDefaults.push(n);
        // 		}
        // 		this.defaultFunctions = newDefaults;
        // 		if (o === "scatter") {
        // 			debug(this.defaultFunctions);
        // 		}
        // 	}
        // }
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
//# sourceMappingURL=PyFile.js.map