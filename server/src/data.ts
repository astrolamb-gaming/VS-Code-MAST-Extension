import * as path from 'path';
import * as fs from 'fs';
import { debug } from 'console';
import { CompletionItem, CompletionItemKind, CompletionItemLabelDetails, InlineValueRequest, integer, Location, MarkupContent, ParameterInformation, Range, SignatureInformation } from 'vscode-languageserver';
import { LabelInfo, parseLabelsInFile } from './tokens/labels';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { fixFileName, getParentFolder } from './fileFunctions';
import exp = require('constants');
import { getCache } from './cache';
import { getVariableNamesInDoc } from './tokens/variables';
import { getGlobals } from './globals';
import { getRolesForFile } from './roles';
import { CRange, parseComments, parseSquareBrackets, parseStrings, parseYamls } from './tokens/comments';
import { connection, sendToClient } from './server';
import { parsePrefabs } from './tokens/prefabs';

/**
 * This accounts for classes that use a different name as a global than the class name. 
 * E.g. the sim global variable refers to the simulation class. Instead of simulation.functionName(), use sim.functionName().
 */
const replaceNames = [
	['simulation','sim']
]
/**
 * This accounts for modules that are treated as classes instead of just adding the functions as default functions.
 * So instead of simply using the arc() function from scatter.py, you'd need to use scatter.arc()
 */
const asClasses = ["sbs.py","scatter.py","faces.py"];
/**
 * This accounts for modules that prepend the class name to the function name.
 * E.g. names.random_kralien_name() would become names_random_kralien_name()
 */
const prepend = ["ship_data.py","names.py","scatter.py"];

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

export interface Variable {
	name: string,
	/**
	 * Given that MAST and Python are not stronly typed, there are lots of possible types the variable could have.
	 */
	possibleTypes: string[],
	/**
	 * variable modifiers like "shared"
	 */
	modifiers: string[]

}

export class MastFile extends FileCache {
	labelNames : LabelInfo[] = [];
	// TODO: Add support for holding label information for all files listed in __init__.mast in a given folder.
	// TODO: Add system for tracking variables in a mast file
	variables: string[] = [];
	roles: string[] = [];

	prefabs: LabelInfo[] = [];
	
	// strings: CRange[] = [];
	// comments: CRange[] = [];
	// yamls: CRange[] = [];
	// squareBrackets: CRange[] = [];
	
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
		this.variables = getVariableNamesInDoc(textDocument);
		this.roles = getRolesForFile(text);		
	}

	getVariableNames() {
		let arr: CompletionItem[] = [];
		debug("Getting variable names");
		for (const v of this.variables) {
			const ci: CompletionItem = {
				label: v,
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

}

export class PyFile extends FileCache {
	defaultFunctions: Function[] = [];
	defaultFunctionCompletionItems: CompletionItem[] = [];
	classes: IClassObject[] = [];
	constructor(uri: string, fileContents:string = "") {
		uri = fixFileName(uri);
		super(uri);
		// If fileContents is NOT an empty string (e.g. if it's from a zipped folder), then all we do is parse the contents
		
		if (path.extname(uri) === ".py") {
			// If file contents are included, we don't need to read, just go straight to parsing
			if (fileContents !== "") {
				this.parseWholeFile(fileContents, uri);
			} else {
				//debug("File contents empty, so we need to load it.");
				fs.readFile(uri, "utf-8", (err,data)=>{
					if (err) {
						debug("error reading file: " + uri + "\n" + err);
					} else {
						this.parseWholeFile(data,uri);
					}
				});
			}
		} else if (path.extname(uri) === ".mast") {
			debug("Can't build a MastFile from PyFile");
			// Shouldn't do anything, Py files are very different from mast
		}
	}

	parseWholeFile(text: string, source: string) {
		//if (!source.endsWith("timers.py")) return;
		// super.parseVariables(text); We don't actually want to look for variable names in python files
		// Instead of just assuming that there is always another class following, it could be a function, so we need to account for this.
		let blockStart : RegExp = /^(class|def) .+?$/gm; 
		//const parentClass: RegExp = /\(\w*?\):/
		let comment : RegExp = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/m;
		let checkText: string;
		let blockIndices : integer[] = [];
		let m: RegExpExecArray | null;

		const doc: TextDocument = TextDocument.create(source, "py", 1, text);
	
		// Iterate over all classes to get their indices
		//classIndices.push(0);
		while(m = blockStart.exec(text)) {
			blockIndices.push(m.index);
			//debug("" + m.index + ": " +m[0]);
		}
		blockIndices.push(text.length-1);
	
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
			let t: string;
			let start = blockIndices[0];
			if (i === 0) {
				t = text.substring(0,start);
			} else {
				start = blockIndices[i-1]
				t = text.substring(start,blockIndices[i]);
			}

			if (t.startsWith("class")) {
				const co = new ClassObject(t,source);
				co.startPos = start + t.indexOf(co.name);
				const r: Range = {
					start: doc.positionAt(co.startPos),
					end: doc.positionAt(co.startPos + co.name.length)
				}
				co.location = {
					uri: source,
					range: r
				}
				// Since sbs functions aren't part of a class, but do need a "sbs." prefix, we pretend sbs is its own class. 
				// PyFile handles that.
				if (co.name === "") {
					this.defaultFunctions = co.methods;
					for (const m of co.methods) {
						m.startIndex = start + t.indexOf("def " + m.name)+4;
						m.location = {
							uri: source,
							range: {
								start: doc.positionAt(m.startIndex),
								end: doc.positionAt(m.startIndex + m.name.length)
							}
						}
						this.defaultFunctionCompletionItems.push(m.completionItem);
					}
				} else {
					// Only add to class list if it's actually a class (or sbs)
					if (co.methods.length !== 0) this.classes.push(co);
					for (const m of co.methods) {
						m.startIndex = start + t.indexOf("def " + m.name)+4;
						m.location = {
							uri: source,
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
				const m = new Function(t, "", source);
				m.startIndex = start + t.indexOf("def " + m.name)+4;
				m.location = {
					uri: source,
					range: {
						start: doc.positionAt(m.startIndex),
						end: doc.positionAt(m.startIndex + m.name.length)
					}
				}
				this.defaultFunctions.push(m);
				this.defaultFunctionCompletionItems.push(m.completionItem);
				//debug(f);
			}
		}
		
		for (const o of asClasses) {
			if (path.basename(this.uri) === o) {
				const c = new ClassObject("", o);
				c.name = o.replace(".py","");
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
				prefix = o.replace(".py","_");
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

export interface ClassTypings {
	name: string,
	classCompItem: CompletionItem,
	completionItems: CompletionItem[], // This will be converted into methods: Function[]
	documentation: string | MarkupContent, // https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-and-highlighting-code-blocks#syntax-highlighting
	methods?: Function[]
}

export interface IClassObject {
	name: string,
	parent?: string,
	methods: Function[],
	methodCompletionItems: CompletionItem[],
	methodSignatureInformation: SignatureInformation[],
	constructorFunction?: Function,
	documentation: string | MarkupContent,
	completionItem: CompletionItem,
	sourceFile: string
}

/**
 * Object containing all relevant information regarding a function.
 */
export interface IFunction {
	/**
	 * the name of the function
	 */
	name: string,
	/**
	 * Function, Method, or Constructor
	 */
	functionType: string,
	/**
	 * If this function is a class method, the class name goes here
	 */
	className: string,
	/**
	 * Any documentation relevant to the function
	 */
	documentation: string | MarkupContent,
	/**
	 * Parameters for the function
	 */
	parameters: IParameter[],
	/**
	 * Return type of the function
	 */
	returnType: string
}

export interface IParameter {
	name: string,
	type?: string,
	documentation?: string | MarkupContent
}

export class ClassObject implements IClassObject {
	name: string;
	parent?: string;
	methods: Function[] = [];
	methodCompletionItems: CompletionItem[] = [];
	methodSignatureInformation: SignatureInformation[] = [];
	constructorFunction?: Function;
	documentation: string | MarkupContent;
	completionItem: CompletionItem;
	sourceFile: string;
	startPos: integer;
	location: Location;

	constructor(raw: string, sourceFile: string) {
		this.startPos = 0;
		this.location = {uri:sourceFile,range: {start: {line:0,character:0},end: {line:0,character:1}}}
		let className : RegExp = /^class .+?:/gm; // Look for "class ClassName:" to parse class names.
		const parentClass: RegExp = /\(\w*?\):/
		let comment : RegExp = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/m;
		
		// TODO: Could pull the class parent and interfaces (if any). Would this be useful?
		this.name = getRegExMatch(raw,className).replace("class ","").replace(/(\(.*?\))?:/,"");
		
		for (const n of replaceNames) {
			if (this.name === n[0]) {
				this.name = n[1];
			}
		}

		// if (this.name === "" && sourceFile.endsWith("sbs.py")) {
		// 	this.name = "sbs";
		// }
		this.parent = getRegExMatch(raw,parentClass).replace(/.*\(/,"").replace(/\):?/,"");
		this.sourceFile = sourceFile;
		// Should just get the first set of comments, which would be the ones for the class itself
		this.documentation = getRegExMatch(raw, comment).replace(/\"\"\"/g,"");

		// Parse functions
		let functionSource = (this.name === "") ? sourceFile : this.name;
		// debug(this.sourceFile)
		this.methods = parseFunctions(raw, functionSource, this.sourceFile);
		for (const i in this.methods) {
			if (this.methods[i].functionType === "constructor") {
				this.constructorFunction = this.methods[i];
			}
			this.methodCompletionItems.push(this.methods[i].completionItem);
			this.methodSignatureInformation.push(this.methods[i].signatureInformation)//.buildSignatureInformation());
		}
		this.completionItem = this.buildCompletionItem();
		return this;
	}
	

	/**
	 * Helper function, should only be called by constructor.
	 * @returns A {@link CompletionItem CompletionItem} object representing the class object.
	 */
	buildCompletionItem(): CompletionItem {
		//const ci: CompletionItem;
		let labelDetails: CompletionItemLabelDetails = {
			// Decided that this clutters up the UI too much. Same information is displayed in the CompletionItem details.
			//detail: "(" + params + ")",
			description: this.name
		}
		let cik: CompletionItemKind = CompletionItemKind.Class;
		let ci_details: string = this.name + "(" + ((this.constructorFunction === undefined) ? "" : this.constructorFunction?.rawParams) + "): " + this.name;
		let ci : CompletionItem = {
			label: this.name,
			kind: cik,
			//command: { command: 'editor.action.triggerSuggest', title: 'Re-trigger completions...' },
			documentation: this.documentation,
			detail: ci_details, //(this.constructorFunction) ? this.constructorFunction.documentation : this.documentation, //this.documentation as string,
			labelDetails: labelDetails,
			insertText: this.name
		}
		return ci;
	}

	
	
}

export class Function implements IFunction {
	name = "";
	documentation: string | MarkupContent;
	functionType: string;
	className: string;
	rawParams: string;
	parameters: IParameter[];
	returnType: string;
	sourceFile: string;
	startIndex: integer = 0;
	location: Location;

	completionItem: CompletionItem;
	signatureInformation: SignatureInformation;

	constructor(raw: string, className: string, sourceFile: string) {
		this.location = {uri:sourceFile,range: {start: {line:0,character:0},end: {line:0,character:1}}}
		this.className = className;
		this.sourceFile = sourceFile;
		this.parameters = [];
		const functionName : RegExp = /(?:def\s)(.+?)(?:\()/gm; ///((def\s)(.+?)\()/gm; // Look for "def functionName(" to parse function names.
		//let className : RegExp = /class (.+?):/gm; // Look for "class ClassName:" to parse class names.
		const functionParam : RegExp = /\((.*?)\)/m; // Find parameters of function, if any.
		// Could replace functionParam regex with : (?:def\s.+?\()(.*?)(?:\)(:|\s*->))
		const returnValue : RegExp = /->(.+?):/gm; // Get the return value (None, boolean, int, etc)
		const comment : RegExp = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/gms;
		const isProperty : RegExp = /(@property)/;
		const isClassMethod: RegExp = /(@classmethod)|(@staticmethod)/;
		const isSetter : RegExp = /\.setter/;

		this.name = getRegExMatch(raw, functionName).replace("def ","").replace("(","").trim();

		let params = getRegExMatch(raw, functionParam).replace(/\(|\)/g,"").replace(/self(.*?,|.*?$)/m,"").trim();
		this.rawParams = params;

		let comments = getRegExMatch(raw, comment).replace("\"\"\"","").replace("\"\"\"","");
		this.documentation = comments;

		let retVal = getRegExMatch(raw, returnValue).replace(/(:|->)/g, "").trim();
		if (retVal === "") {
			let cLines = comments.split("\n");
			for (let i = 0; i < cLines.length; i++) {
				if (cLines[i].includes("Return")) {
					let retLine = cLines[i+1].trim().replace("(","");
					if (retLine.startsWith("bool")) {
						this.returnType = "boolean";
					} else if (retLine.startsWith("id") || retLine.startsWith("agent id")) {
						this.returnType = "int";
					} else if (retLine.startsWith("list")) {
						this.returnType = "list";
					} else if (retLine.startsWith("str")) {
						this.returnType = "string";
					} else {
						// We potentially modified retLine by replacing open parentheses, so we just use the source
						this.returnType = cLines[i+1].trim();
					}
					break;
				}
			}
		}
		this.returnType = retVal;

		

		let cik: CompletionItemKind = CompletionItemKind.Function;
		let cikStr: string = "function";
		if (isProperty.test(raw)) {
			cik = CompletionItemKind.Property;
			cikStr = "property";
		}
		if (isClassMethod.test(raw)) {
			cik = CompletionItemKind.Method;
			cikStr = "classmethod";
		}
		if (isSetter.test(raw)) {
			cik = CompletionItemKind.Unit;
			cikStr = "setter";
		}
		if (this.name === "__init__") {
			cik = CompletionItemKind.Constructor;
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
	buildParams(raw: string) {
		//debug("buildParams: " + this.name + "\n" + raw);
		const paramList: Parameter[] = [];
		switch (raw) {
			case "":
				return paramList
			case "self":
				return paramList
		}
		const arr: string[] = raw.split(",");
		let parameterCounter = 0;
		for (const i in arr) {
			if (arr[i].trim().startsWith("self")) {
				continue;
			}
			const param: Parameter = new Parameter(arr[i], 0);
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
	buildFunctionDetails() : string {
		let classRef = ((this.className === "") ? "" : this.className + ".");
		if (this.functionType === 'constructor') { classRef = ""; }
		let paramList = "";
		if (this.functionType !== 'property') paramList = "(" + this.rawParams + ")" + paramList;
		let retType = "";
		if (this.returnType !== "") retType = " -> " + this.returnType;
		let ci_details: string = "(" + this.functionType + ") " + classRef + this.name + paramList + retType;
		return ci_details;
	}

	/**
	 * 
	 * @returns a new {@link MarkupContent MarkupContent} representing the function and its documentation.
	 */
	buildMarkUpContent(docs: string = ""): MarkupContent {
		if (this.sourceFile.includes("sbs.py")) debug("Generating an SBS function"); debug(this.sourceFile);
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

		

		let source = this.determineSource(this.sourceFile);
		

		source = "\nSource:  \n  " + source;
		if (docs !== "") {
			docs = "\n\n```text\n\n" + docs + "\n```";
		}
		const ret: MarkupContent = {
			kind: "markdown",
			value: "```javascript\n" + this.buildFunctionDetails() + "\n```" + docs + source
			// value: functionDetails + "\n" + documentation + "\n\n" + source
		}
		return ret;
	}

	determineSource(source: string): string {
		// if (this.sourceFile.includes("sbs.py")) debug("Generating an SBS MarkupContent");
		let url = ""
		// Convert the source to reference the applicable sbs_utils or legendarymissions github page
		const regex: RegExp = /\.v((\d+)\.(\d+)\.(\d+))\.(\d+\.)*(((mast|sbs)lib)|(zip))/;
		// debug(source)
		if (source.includes("LegendaryMissions")) {
			source = "https://github.com/" + source.replace(regex, "").replace("LegendaryMissions.","LegendaryMissions/blob/main/");
		} else if (source.includes("githubusercontent")) {
			// debug("Githubusercontent foudn");
			source = source.replace("raw.githubusercontent","github").replace("/master","/blob/master");
		} else if (source.includes("sbs_utils")) {
			source = "https://github.com/" + source.replace(regex, "/blob/master").replace(".","/");
		} 
		return source;
	}

	/**
	 * Helper function, should only be called by constructor.
	 * @returns 
	 */
	buildCompletionItem(cik: CompletionItemKind): CompletionItem {
		//const ci: CompletionItem;
		const labelDetails: CompletionItemLabelDetails = {
			// Decided that this clutters up the UI too much. Same information is displayed in the CompletionItem details.
			//detail: "(" + params + ")",
			description: this.returnType
		}
		let label = this.name;
		let retType = this.returnType;
		let funcType = this.functionType;
		
		let classRef = ((this.className === "") ? "" : this.className + ".");
		// For constructor functions, we don't want something like vec2.vec2(args). We just want vec2(args).
		if (cik === CompletionItemKind.Constructor) { classRef = ""; }
		// let ci_details: string = "(" + this.functionType + ") " + classRef + this.name + "(" + this.rawParams + "): " + this.returnType;
		const functionDetails = "```javascript\n" + this.buildFunctionDetails() + "\n```";
		// const documentation = "```text\n\n" + this.documentation + "```";
		const documentation = (this.documentation as string).replace(/\t/g,"&emsp;").replace(/    /g,"&emsp;").replace(/\n/g,"\\\n");
		// debug(documentation)
		const source = "Source: " + this.determineSource(this.sourceFile);
		let docs: MarkupContent = {
			kind: 'markdown',
			value: functionDetails + "  \n  " + documentation + "  \n  " + source
		}
		// let docs = this.buildMarkUpContent(documentation);
		// docs.value = docs.value.replace(/\t/g,"&emsp;").replace(/    /g,"&emsp;").replace(/\n/g,"\\\n");
		let insert = this.name;
		if (this.parameters.length === 0 && this.functionType !== "property") {
			insert = this.name + "()"
		}

		let ci : CompletionItem = {
			label: this.name,
			kind: cik,
			//command: { command: 'editor.action.triggerSuggest', title: 'Re-trigger completions...' },
			documentation: docs,// this.documentation,
			// detail: ci_details,
			labelDetails: labelDetails,
			insertText: insert
		}
		return ci;
	}

	buildSignatureInformation(): SignatureInformation {
		let ci_details: string = "(" + this.functionType + ") " + ((this.className === "") ? "" : this.className + ".") + this.name + "(" + this.rawParams + "): " + (this.functionType === "constructor") ? this.className : this.name;
		//debug(ci_details)
		const params:ParameterInformation[] = [];
		// const markup: MarkupContent = {
		// 	kind: "markdown",
		// 	value: "```javascript\n" + ci_details + "\n```\n```text\n" + this.documentation + "\n```\n"
		// }
		//debug(markup)
		const si: SignatureInformation = {
			label: this.name,
			documentation: ci_details + "\n" + this.documentation,
			// TODO: Make this more Markup style instead of just text
			parameters: []
		}
		for (const i in this.parameters) {
			const pi: ParameterInformation = {
				label: this.parameters[i].name,
				documentation: this.parameters[i].name + "\nType: " + this.parameters[i].type
			}
			if (pi.label === "style") {
				pi.documentation = pi.documentation + "\n\nStyle information:";
				for (const s of getGlobals().widget_stylestrings) {
					if (s.function === this.name) {
						let doc = s.name + ":\n"
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

export class Parameter implements IParameter {
	name: string;
	type?: string;
	documentation?: string | MarkupContent | undefined;
	constructor(raw: string, pos: integer, docs?: string) {
		this.name = "";
		this.documentation = (docs === undefined) ? "" : docs;
		const pDef: string[] = raw.split(":");
		this.name = pDef[0].trim();
		if (pDef.length === 1) {
			this.type = "any?";
		} else {
			this.type = pDef[1].trim();
		}
		return this;
	}
}

export function getRegExMatch(sourceString : string, pattern : RegExp) : string {
	let ret = "";
	let m: RegExpExecArray | null;
	let count = 0;
	while ((m = pattern.exec(sourceString)) && count < 1) {
		ret += m[0];
		count++
	}
	return ret;
}


/**
 * Gets all functions within a particular module or class.
 * Really it's all functions defined within the provided text, so you need to be careful that only what you want is in here.
 * @param raw The raw text contents, as a string
 * @returns List of {@link Function Function} items
 */
function parseFunctions(raw: string, source: string, sourceFile: string) {
	let m: RegExpExecArray | null;

	const fList : Function[] = [];

	let testStr = 'def add_client_tag() -> None:\n    """stub; does nothing yet."""';

	let wholeFunction : RegExp = /((@property|\.setter|@classmethod)?([\n\t\r ]*?)(def)(.+?)([\.]{3,3}|((\"){3,3}(.*?)(\"){3,3})))/gms;

	let functionName : RegExp = /((def\s)(.+?)\()/gm; // Look for "def functionName(" to parse function names.
	//let className : RegExp = /class (.+?):/gm; // Look for "class ClassName:" to parse class names.
	let functionParam : RegExp = /\((.*?)\)/m; // Find parameters of function, if any.
	let returnValue : RegExp = /->(.+?):/gm; // Get the return value (None, boolean, int, etc)
	let comment : RegExp = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/gms;
	let isProperty : RegExp = /(@property)/;
	let isClassMethod: RegExp = /@classmethod/;
	let isSetter : RegExp = /\.setter/;

	while ((m = wholeFunction.exec(raw))) {
		const f: Function = new Function(m[0], source, sourceFile);
		fList.push(f);
	}
	return fList;
}

export interface LabelDescInfo {
	description: string,
	startPos: integer,
	endPos: integer
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

export function getVariablesInFile(textDocument:TextDocument) {
	const text = textDocument.getText();
	const cache = getCache(textDocument.uri);
	debug("Trying to get variables");
	let variables: Variable[] = [];
	const pattern: RegExp = /^\s*?\w+(?=\s*=[^=]\s*?)/gm;
	const lines = text.split("\n");
	debug("Done getting variables");
	let m: RegExpExecArray | null;
	let found = false;
	for (const line of lines) {
		const match = line.match(pattern);
		if (match) {
			const v = match[0];
			debug(v);
			// Get the variable type at this point

			const equal = line.indexOf("=")+1;
			const typeEvalStr = line.substring(equal).trim();
			debug(typeEvalStr);
			const t = getVariableTypes(typeEvalStr,textDocument.uri);
			debug(t);

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
				const variable:Variable = {
					name: v,
					possibleTypes: t,
					modifiers: []
				}
			}
		}
	}
	return variables;
}



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
