import * as path from 'path';
import * as fs from 'fs';
import { debug } from 'console';
import { CompletionItem, CompletionItemKind, CompletionItemLabelDetails, integer, Location, MarkupContent, ParameterInformation, Range, SignatureInformation } from 'vscode-languageserver';
import { LabelInfo, parseLabelsInFile } from './tokens/labels';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { fixFileName, getParentFolder } from './fileFunctions';
import exp = require('constants');
import { getCache } from './cache';
import { getGlobals } from './globals';
import { getInventoryKeysForFile, getRolesForFile } from './tokens/roles';
import { parsePrefabs } from './tokens/prefabs';
import { parseVariables, Variable } from './tokens/variables';
import { Function } from "./data/function";
import { ClassObject } from './data/class';
import { parseWords, Word } from './tokens/words';

/**
 * This accounts for classes that use a different name as a global than the class name. 
 * E.g. the sim global variable refers to the simulation class. Instead of simulation.functionName(), use sim.functionName().
 */
export const replaceNames = [
	['simulation','sim']
]
/**
 * This accounts for modules that are treated as classes instead of just adding the functions as default functions.
 * So instead of simply using the arc() function from scatter.py, you'd need to use scatter.arc()
 */
export const asClasses = ["sbs","scatter","faces"];
/**
 * This accounts for modules that prepend the class name to the function name.
 * E.g. names.random_kralien_name() would become names_random_kralien_name()
 */
export const prepend = ["ship_data","names","scatter"];

// TODO: Account for names_random_kralien() instead of names.random_kralien() or random_kralien()

export class FileCache {
	uri: string;
	parentFolder: string;
	variableNames: string[] = [];
	constructor(uri: string) {
		this.uri = fixFileName(uri);
		let parent = "sbs_utils";
		if (!uri.includes("sbs_utils") && !uri.includes("mastlib")) {
			parent = getParentFolder(uri);
		}
		this.parentFolder = parent;
	}
	parseVariables(contents: string) {
		let pattern = /^\s*?(\w+)\s*?=\s*?[^\s\+=-\\*\/].*$/gm;
		let m: RegExpExecArray | null;
		let catcher = 0;
		while (m = pattern.exec(contents)) {
			const variable = m[0];
			
			debug(variable);
			catcher++;
			if (catcher > 20) {
				continue;
			}
		}
	}
}


/**
 * Represents a mast file.  
 * Contains all the information about that specific file, including its referenced
 * labels, variables, roles, and prefabs.
 */
export class MastFile extends FileCache {
	labelNames : LabelInfo[] = [];
	// TODO: Add support for holding label information for all files listed in __init__.mast in a given folder.
	// TODO: Add system for tracking variables in a mast file
	variables: Variable[] = [];
	roles: string[] = [];
	keys: string[] = [];
	prefabs: LabelInfo[] = [];
	words: Word[] = [];
	
	constructor(uri: string, fileContents:string = "") {
		//debug("building mast file");
		super(uri);
		
		if (path.extname(uri) === ".mast") {
			// If the contents are aleady read, we parse and move on. Don't need to read or parse again.
			if (fileContents !== "") {
				//debug("parsing, has contents");
				this.parse(fileContents);
				return;
			} else {
				fs.readFile(uri, "utf-8", (err,data)=>{
					if (err) {
						debug("error reading file: " + uri + "\n" + err);
						throw err;
					} else {
						//debug("parsing, no error");
						this.parse(data);
					}
				});
			}
		} else if (path.extname(uri) === ".py") {
			// Shouldn't do anything, Py files are very different from mast
			debug("ERROR: Trying to parse a .py file as a .mast file: " + uri);
			// Send notification to client?
		}
	}

	parse(text: string) {
		// debug("parsing mast file: " + this.uri)
		const textDocument: TextDocument = TextDocument.create(this.uri, "mast", 1, text);
		this.labelNames = parseLabelsInFile(text, this.uri);
		this.prefabs = parsePrefabs(this.labelNames);
		// TODO: Parse variables, etc
		//this.variables = getVariableNamesInDoc(textDocument);
		this.variables = parseVariables(textDocument);//
		this.roles = getRolesForFile(text);		
		this.keys = getInventoryKeysForFile(text);
		this.words = parseWords(textDocument);
	}

	getVariableNames() {
		let arr: CompletionItem[] = [];
		debug("Getting variable names");
		for (const v of this.variables) {
			const ci: CompletionItem = {
				label: v.name,
				kind: CompletionItemKind.Variable,
				//TODO: Check type of variable?
				labelDetails: {description: path.basename(this.uri)+": var"},
				//detail: "From " + 
			}
			arr.push(ci);
		}
		const arrUniq = [...new Map(arr.map(v => [v.label, v])).values()]
		return arrUniq;
	} 
	getWordLocations(check:string): Location[] {
		for (const word of this.words) {
			if (word.name === check) {
				return word.locations;
			}
		}
		return [];
	}

}

export class PyFile extends FileCache {
	defaultFunctions: Function[] = [];
	classes: ClassObject[] = [];
	words: Word[] = [];
	constructor(uri: string, fileContents:string = "") {
		uri = fixFileName(uri);
		super(uri);
		// If fileContents is NOT an empty string (e.g. if it's from a zipped folder), then all we do is parse the contents
		
		if (path.extname(uri) === ".py") {
			// If file contents are included, we don't need to read, just go straight to parsing
			if (fileContents !== "") {
				this.parseWholeFile(fileContents);
			} else {
				//debug("File contents empty, so we need to load it.");
				fs.readFile(uri, "utf-8", (err,data)=>{
					if (err) {
						debug("error reading file: " + uri + "\n" + err);
					} else {
						this.parseWholeFile(data);
					}
				});
			}
		} else if (path.extname(uri) === ".mast") {
			debug("Can't build a MastFile from PyFile");
			// Shouldn't do anything, Py files are very different from mast
		}
	}

	parseWholeFile(text: string) {
		// Gotta clear old data
		this.classes = [];
		this.defaultFunctions = [];
		this.variableNames = [];
		//if (!source.endsWith("timers.py")) return;
		// super.parseVariables(text); We don't actually want to look for variable names in python files
		// Instead of just assuming that there is always another class following, it could be a function, so we need to account for this.
		let blockStart : RegExp = /^(class|def) .+?$/gm; 
		//const parentClass: RegExp = /\(\w*?\):/
		let comment : RegExp = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/m;
		let checkText: string;
		let blockIndices : integer[] = [];
		let m: RegExpExecArray | null;

		const doc: TextDocument = TextDocument.create(this.uri, "py", 1, text);
		this.words = parseWords(doc);
		// Iterate over all classes to get their indices
		//classIndices.push(0);
		while(m = blockStart.exec(text)) {
			blockIndices.push(m.index);
			//debug("" + m.index + ": " +m[0]);
		}
		blockIndices.push(text.length-1);
	
		let len = blockIndices.length; // How many indices there are - NOT the same as number of classes (should be # of classes - 1)
		
		// Here we go over all the indices and get all functions between the last index (or 0) and the current index.
		// So if the file doesn't start with a class definition, all function prior to a class definition are added to the default functions
		// while class functions are addded to a ClassObject object.
		for (let i = 0; i < len; i++) {
			let t: string;
			let start = blockIndices[0];
			if (i === 0) {
				t = text.substring(0,start);
			} else {
				start = blockIndices[i-1]
				t = text.substring(start,blockIndices[i]);
			}

			if (t.startsWith("class")) {
				const co = new ClassObject(t,this.uri);
				co.startPos = start + t.indexOf(co.name);
				const r: Range = {
					start: doc.positionAt(co.startPos),
					end: doc.positionAt(co.startPos + co.name.length)
				}
				co.location = {
					uri: this.uri,
					range: r
				}
				// Since sbs functions aren't part of a class, but do need a "sbs." prefix, we pretend sbs is its own class. 
				// PyFile handles that.
				if (co.name === "") {
					this.defaultFunctions = co.methods;
					for (const m of co.methods) {
						m.startIndex = start + t.indexOf("def " + m.name)+4;
						m.location = {
							uri: this.uri,
							range: {
								start: doc.positionAt(m.startIndex),
								end: doc.positionAt(m.startIndex + m.name.length)
							}
						}
					}
				} else {
					// Only add to class list if it's actually a class (or sbs)
					if (co.methods.length !== 0) this.classes.push(co);
					for (const m of co.methods) {
						m.startIndex = start + t.indexOf("def " + m.name)+4;
						m.location = {
							uri: this.uri,
							range: {
								start: doc.positionAt(m.startIndex),
								end: doc.positionAt(m.startIndex + m.name.length)
							}
						}
					}
					//debug(co);
				}
			} else if (t.startsWith("def")) {
				// if (source.includes("sbs.py")) debug("TYRING ANOTHER SBS FUNCTION"); debug(source);
				const m = new Function(t, "", this.uri);
				m.startIndex = start + t.indexOf("def " + m.name)+4;
				m.location = {
					uri: this.uri,
					range: {
						start: doc.positionAt(m.startIndex),
						end: doc.positionAt(m.startIndex + m.name.length)
					}
				}
				this.defaultFunctions.push(m);
			}
		}
		
		for (const o of asClasses) {
			if (path.basename(this.uri).replace(".py","") === o) {
				const c = new ClassObject("", path.basename(this.uri));
				c.name = o;
				c.methods = this.defaultFunctions;
				this.classes.push(c);
				if (c.name !== "scatter") {
					this.defaultFunctions = [];
				} else {
					debug(this.defaultFunctions);
					debug(c.methods);
				}
			}
		}

		// This checks if the module name should be prepended to the function names in this module
		let prefix = "";
		for (const o of prepend) {
			if (path.basename(this.uri).replace(".py","") === o) {
				prefix = o + "_";//o.replace(".py","_");
				const newDefaults: Function[] = [];
				for (const m of this.defaultFunctions) {
					// const n = Object.assign({},m);
					const n = m.copy();
					n.name = prefix + n.name;
					newDefaults.push(n);
				}
				this.defaultFunctions = newDefaults;
				if (o === "scatter") {
					debug(this.defaultFunctions);
				}
			}
			
		}
		
	}

	getDefaultMethodCompletionItems(): CompletionItem[] {
		let ci:CompletionItem[] = [];
		for (const f of this.defaultFunctions) {
			ci.push(f.buildCompletionItem());
		}
		return ci;
	}
}


/**
 * 
 * @param text 
 * @param pos 
 * @returns 
 */
export function getLabelDescription(td: TextDocument, pos:integer) {
	const labelLoc = td.positionAt(pos);
	const text = td.getText();
	let check = labelLoc.line + 1;
	let labelDesc: string = "";
	let multiLineComment: boolean = false;
	while (check < td.lineCount) {
		const lineStart = td.offsetAt({line: check, character:0});
		const str = text.substring(lineStart,text.indexOf("\n",lineStart));
		debug(str);
		if (multiLineComment) {
			if (str.endsWith("*/")) {
				multiLineComment = false;
				labelDesc = labelDesc + str.replace("*/","");
			} else {
				labelDesc = labelDesc + str;
			}
		}
		if (str.trim().startsWith("/*")) {
				multiLineComment = true;
				labelDesc = labelDesc + str.replace("/*","");
		} else {
			if (str.trim().startsWith("\"") || str.trim().startsWith("#")) {
				debug(str);
				labelDesc = labelDesc + str.replace("\"","").replace("#","");
			} else {
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



function getVariableTypes(typeEvalStr:string, uri:string): string[] {
	let types: string[] = [];
	const test:boolean = "to_object(amb_id)" === typeEvalStr;
	const isNumberType = (s: string) => !isNaN(+s) && isFinite(+s) && !/e/i.test(s)
	const cache = getCache(uri);
	//let type: string = "any";
	// Check if it's a string
	if (typeEvalStr.startsWith("\"") || typeEvalStr.startsWith("'")) {
		types.push("string");
	// Check if its an f-string
	} else if (typeEvalStr.startsWith("f\"") || typeEvalStr.startsWith("f'")) {
		types.push("string");
	// Check if it's a multiline string
	} else if (typeEvalStr.startsWith("\"\"\"") || typeEvalStr.startsWith("'''")) {
		types.push("string");
	} else if (typeEvalStr === "True" || typeEvalStr === "False") {
		types.push("boolean");
	} else if (isNumberType(typeEvalStr)) {
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
			if (test) debug(f);
			types.push(f.returnType);
		}
	}

	// Is this a class, or a class function?
	for (const co of cache.missionClasses) {
		if (typeEvalStr.startsWith(co.name)) {
			// Check if it's a static method of the class
			for (const func of co.methods) {
				if (typeEvalStr.startsWith(co.name + "." + func.name)) {
					if (test) debug(co.name + "." + func.name);
					types.push(func.returnType);
				}
			}
			// If it's not a static method, then just return the class
			if (test) debug(co);
			types.push(co.name);
		}
	}

	// If it's none of the above, then it's probably an object, or a parameter of that object
	if (test)  debug(types);
	return types;

}
