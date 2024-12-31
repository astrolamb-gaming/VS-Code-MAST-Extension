import { debug } from 'console';
import { CompletionItem, CompletionItemKind, CompletionItemLabelDetails, integer, MarkupContent, ParameterInformation, SignatureInformation } from 'vscode-languageserver';





export interface MastFile {
	uri: string,
	// TODO: Add support for holding label information for all files listed in __init__.mast in a given folder.
	// TODO: Add system for tracking variables in a mast file
}

export interface PyFile {
	uri: string,
	defaultFunctions: Function[],
	defaultFunctionCompletionItems: CompletionItem[],
	classes: IClassObject[]
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
	constructorFunction?: Function;
	documentation: string | MarkupContent;
	completionItem: CompletionItem;
	sourceFile: string;

	constructor(raw: string, sourceFile: string) {
		let className : RegExp = /^class .+?:/gm; // Look for "class ClassName:" to parse class names.
		const parentClass: RegExp = /\(\w*?\):/
		let comment : RegExp = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/m;
		
		// TODO: Could pull the class parent and interfaces (if any). Would this be useful?
		this.name = getRegExMatch(raw,className).replace("class ","").replace(/\(.*?\):/,"");
		if (this.name === "" && sourceFile === "sbs/__init__") {
			this.name = "sbs";
		}
		this.sourceFile = sourceFile;
		// Should just get the first set of comments, which would be the ones for the class itself
		this.documentation = getRegExMatch(raw, comment).replace(/\"\"\"/g,"");

		// Parse functions
		let functionSource = (this.name === "") ? sourceFile : this.name;
		this.methods = parseFunctions(raw, functionSource);
		for (const i in this.methods) {
			if (this.methods[i].functionType === "constructor") {
				this.constructorFunction = this.methods[i];
			}
			this.methodCompletionItems.push(this.methods[i].completionItem);
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

	completionItem: CompletionItem;
	signatureInformation: SignatureInformation;

	constructor(raw: string, className: string) {
		this.className = className;
		const functionName : RegExp = /((def\s)(.+?)\()/gm; // Look for "def functionName(" to parse function names.
		//let className : RegExp = /class (.+?):/gm; // Look for "class ClassName:" to parse class names.
		const functionParam : RegExp = /\((.*?)\)/m; // Find parameters of function, if any.
		const returnValue : RegExp = /->(.+?):/gm; // Get the return value (None, boolean, int, etc)
		const comment : RegExp = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/gms;
		const isProperty : RegExp = /(@property)/;
		let isClassMethod: RegExp = /@classmethod/;
		const isSetter : RegExp = /\.setter/;

		this.name = getRegExMatch(raw, functionName).replace("def ","").replace("(","").trim();

		let params = getRegExMatch(raw, functionParam).replace("(","").replace(")","");
		this.rawParams = params;

		let retVal = getRegExMatch(raw, returnValue).replace(/(:|->)/g, "").trim();
		this.returnType = retVal;

		let comments = getRegExMatch(raw, comment).replace("\"\"\"","").replace("\"\"\"","");
		this.documentation = comments;

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
	buildParams(raw: string) {
		const paramList: Parameter[] = [];
		switch (raw) {
			case "":
				return paramList
			case "self":
				return paramList
		}
		const arr: string[] = raw.split(",");
		for (const i in arr) {
			if (arr[i].trim().startsWith("self")) {
				continue;
			}
			const param: Parameter = new Parameter(arr[i]);
			paramList.push(param);
		}
		return paramList;
	}

	/**
	 * Helper function, should only be called by constructor.
	 * @returns 
	 */
	buildCompletionItem(cik: CompletionItemKind): CompletionItem {
		//const ci: CompletionItem;
		let labelDetails: CompletionItemLabelDetails = {
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
		let ci_details: string = "(" + this.functionType + ") " + classRef + label + "(" + this.rawParams + "): " + retType;
		let ci : CompletionItem = {
			label: this.name,
			kind: cik,
			//command: { command: 'editor.action.triggerSuggest', title: 'Re-trigger completions...' },
			documentation: this.documentation,
			detail: ci_details,
			labelDetails: labelDetails,
			insertText: this.name
		}
		return ci;
	}

	buildSignatureInformation(): SignatureInformation {
		let ci_details: string = "(" + this.functionType + ") " + ((this.className === "") ? "" : this.className + ".") + this.name + "(" + this.rawParams + "): " + (this.functionType === "constructor") ? this.className : this.name;
		const si: SignatureInformation = {
			label: ci_details,
			documentation: ci_details + "\n" + this.documentation,
			// TODO: Make this more Markup style instead of just text
			parameters: []
		}
		for (const i in this.parameters) {
			const pi: ParameterInformation = {
				label: this.parameters[i].name,
				documentation: this.documentation
			}
			si.parameters?.push(pi);
		}
		return si;
	}
	
}

export class Parameter implements IParameter {
	name: string;
	type?: string;
	documentation?: string | MarkupContent | undefined;
	constructor(raw: string, docs?: string) {
		this.name = "";
		this.documentation = docs;
		const pDef: string[] = raw.split(":");
		this.name = pDef[0];
		if (pDef.length === 1) {
			this.type = "any?";
		} else {
			this.type = pDef[1];
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

export function parseWholeFile(text: string, source: string): PyFile {
	let className : RegExp = /^class .+?:/gm; // Look for "class ClassName:" to parse class names.
	//const parentClass: RegExp = /\(\w*?\):/
	let comment : RegExp = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/m;
	let checkText: string;
	let classIndices : integer[] = [];
	let m: RegExpExecArray | null;

	// Iterate over all classes to get their indices
	//classIndices.push(0);
	while(m = className.exec(text)) {
		classIndices.push(m.index);
		//debug("" + m.index + ": " +m[0]);
	}
	classIndices.push(text.length-1);

	let len = classIndices.length; // How many indices there are - NOT the same as number of classes (should be # of classes - 1)

	const file: PyFile = {
		uri: source,
		defaultFunctions: [],
		defaultFunctionCompletionItems: [],
		classes: []
	}
	
	// Here we go over all the indices and get all functions between the last index (or 0) and the current index.
	// So if the file doesn't start with a class definition, all function prior to a class definition are added to the default functions
	// while class functions are addded to a ClassObject object.
	for (let i = 0; i < len; i++) {
		let t: string;
		if (i === 0) {
			t = text.substring(0,classIndices[0]);
		} else {
			t = text.substring(classIndices[i-1],classIndices[i]);
		}
		
		const co = new ClassObject(t,source);
		// Since sbs functions aren't part of a class, but do need a "sbs." prefix, we pretend sbs is its own class.
		if (co.name === "") {
			file.defaultFunctions = co.methods;
			for (const m in co.methods) {
				file.defaultFunctionCompletionItems.push(co.methods[m].completionItem);
			}
		} else {
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
function parseFunctions(raw: string, source: string) {
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
		const f: Function = new Function(m[0], source);
		fList.push(f);
	}
	return fList;
}