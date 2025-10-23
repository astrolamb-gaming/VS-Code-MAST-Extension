import { CompletionItem, CompletionItemKind, CompletionItemLabelDetails, integer, Location, MarkupContent, MarkupKind, ParameterInformation, SignatureInformation } from 'vscode-languageserver';
import { getRegExMatch } from './class';
import { getArtemisGlobals } from '../artemisGlobals';
import { debug } from 'console';
import { NewlineTransformer } from 'python-shell';


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
	documentation?: string | MarkupContent,
	default?: string
}

export class Function implements IFunction {
	name = "";
	documentation: string;
	functionType: string;
	className: string;
	rawParams: string;
	parameters: IParameter[];
	returnType: string;
	sourceFile: string;
	startIndex: integer = 0;
	location: Location;

	copy(): Function {
		const f: Function = new Function("","","");
		f.name = this.name;
		f.documentation = this.documentation;
		f.functionType = this.functionType;
		f.className = this.className;
		f.rawParams = this.rawParams;
		f.parameters = this.parameters;
		f.returnType = this.returnType;
		f.sourceFile = this.sourceFile;
		f.startIndex = this.startIndex;
		f.location = this.location;
		return f;
	}

	// completionItem: CompletionItem;
	// signatureInformation: SignatureInformation;

	constructor(raw: string, className: string, sourceFile: string) {
		this.location = {uri:sourceFile,range: {start: {line:0,character:0},end: {line:0,character:1}}}
		this.className = className;
		this.sourceFile = sourceFile;
		this.parameters = [];
		const functionName : RegExp = /(?:def)[ \t]*(\w+)[ \t]*(?:\()/g; ///((def\s)(.+?)\()/gm; // Look for "def functionName(" to parse function names.
		//let className : RegExp = /class (.+?):/gm; // Look for "class ClassName:" to parse class names.
		const functionParam : RegExp = /\((.*?)\)/ms; // Find parameters of function, if any.
		// Could replace functionParam regex with : (?:def\s.+?\()(.*?)(?:\)(:|\s*->))
		const returnValue : RegExp = /->(.+?):/gm; // Get the return value (None, boolean, int, etc)
		const comment : RegExp = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/gms;
		const isProperty : RegExp = /(@property)/;
		const isClassMethod: RegExp = /(@classmethod)|(@staticmethod)/;
		const isSetter : RegExp = /\.setter/;
		const isLabel: RegExp = /(@label)/;
		const isPromise: RegExp = /(@awaitable)/;

		this.name = getRegExMatch(raw, functionName).replace("def ","").replace("(","").trim();

		let params = getRegExMatch(raw, functionParam).replace(/\(|\)/g,"").replace(/self(.*?,|.*?$)/m,"").replace(/^[\t ]*#.*?(\n|$)/gm,"").replace(/\n\s*\n/g,"\n").trim();
		if (params.endsWith(",")) {
			params = params.substring(0,params.length-1);
		}
		this.rawParams = params;

		let comments = getRegExMatch(raw, comment).replace("\"\"\"","").replace("\"\"\"","");
		let lines = comments.split("\n");
		let newLines:string[] = [];
		let m: RegExpMatchArray|null;
		const oldParam = /:(param|type)(\w+):(.*)/;
		const param = /([ \w]+)(\([^\)]*\))?:(.*)?/;

		for (let line of lines) {
			let found = false;
			while (m = line.match(param)) {
				let l = "";
				if (m[3] && m[3].trim() !== "") { // If it's a param. 
					// debug(m[0])
					l = "**"+m[1].trim()+"**";
					if (m[2]) {
						l = l + " *" + m[2] + "*:  "
					} else {
						l = l + ":  "
					}
					l = l + m[3].trim();
				} else if (m[3] === undefined) { // It's a header, like `Args:`
					l = "### " + m[1].trim();
				} else { // Just a string
					l = line.trim() + "  ";
				}
				newLines.push(l + "  ");
				found = true;
				break;
			}
			if (found) continue;
			newLines.push(line.trim() + "  ");
		}
		// debug(newLines);

		this.documentation = newLines.join("\n");
		debug(this.documentation);

		let retVal = getRegExMatch(raw, returnValue).replace(/(:|->)/g, "").trim();
		if (retVal === "") {
			let cLines = comments.split("\n");
			for (let i = 0; i < cLines.length; i++) {
				if (cLines[i].includes("Return")) {
					if (cLines[i+1] === undefined) {
						// debug(this)
						// debug(comments);
						continue;
					}
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
		if (isPromise.test(raw)) {
			cik = CompletionItemKind.Reference;
			cikStr = "awaitable";
		}
		if (isLabel.test(raw)) {
			cik = CompletionItemKind.Event;
			cikStr = "label";
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
		// TODO: Only use these when really needed
		this.parameters = this.buildParams(params);
		// this.completionItem = this.buildCompletionItem();
		// this.signatureInformation = this.buildSignatureInformation();
		//debug(this);
		return this;
	}

	convertFunctionTypeToCompletionItemKind(type:string): CompletionItemKind {
		let cik: CompletionItemKind = CompletionItemKind.Function;
		if (type === "setter") return CompletionItemKind.Unit;
		if (type === "property") return CompletionItemKind.Property;
		if (type === "constructor") return CompletionItemKind.Constructor
		if (type === "classmethod") return CompletionItemKind.Method;
		if (type === "label") return CompletionItemKind.Event;
		if (type === "awaitable") return CompletionItemKind.Reference;
		return cik;
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
		if ((this.functionType !== 'property') && (this.functionType !== 'constant')) paramList = "(" + this.rawParams + ")" + paramList;
		let retType = "";
		if (this.returnType !== "") retType = " -> " + this.returnType;
		let ci_details: string = "(" + this.functionType + ") " + classRef + this.name + paramList + retType;
		ci_details = "```javascript\n" + ci_details + "\n```   \n";
		return ci_details;
	}

	/**
	 * 
	 * @returns a new {@link MarkupContent MarkupContent} representing the function and its documentation.
	 */
	buildMarkUpContent(docs: string = ""): MarkupContent {
		// if (this.sourceFile.includes("sbs.py")) debug("Generating an SBS function"); debug(this.sourceFile);
		/** 
		 * TODO: Fix this for CompletionItem in {@link buildCompletionItem buil6dCompletionItem}
		 */ 

		if (docs === "") {
			// if (this.documentation.value )
			docs = this.documentation;
		}

		// const functionDetails = "```javascript\n" + this.buildFunctionDetails() + "\n```";
		const documentation = "```text\n\n" + this.documentation + "```";
		// const documentation = (this.documentation as string).replace(/\t/g,"&emsp;").replace(/    /g,"&emsp;").replace(/\n/g,"\\\n");
		
		
		//                    artemis-sbs.LegendaryMissions.upgrades.v1.0.4.mastlib/upgrade.py
		// https://github.com/artemis-sbs/LegendaryMissions/blob/main/upgrades/upgrade.py

		//                  artemis-sbs.sbs_utils.v1.0.4.sbslib/sbs_utils/procedural/roles.py
		// https://github.com/artemis-sbs/sbs_utils/blob/master/sbs_utils/procedural/roles.py

		// https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/mock/sbs.py
		// https://github.com/artemis-sbs/sbs_utils/blob/master/mock/sbs.py

		

		let source = ""//this.determineSource(this.sourceFile);
		

		source = '';//"\nSource:  \n  " + source;
		// if (docs !== "") {
		// 	docs = "\n\n```text\n\n" + docs + "\n```";
		// }

		let functionDetails = this.buildFunctionDetails();
		// debug(functionDetails);
		// debug(docs);
		// debug(source);
		const ret: MarkupContent = {
			kind: MarkupKind.Markdown,
			// value: "```javascript\n" + functionDetails + "\n```  \r\n" + docs + source
			value:[
				functionDetails,
				docs,
				source
			].join("\n")
			// value: functionDetails + "\n" + documentation + "\n\n" + source
		}
		debug(ret.value);
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
	 * Using this instead of saving multiple copies of the same data. Also reduces load time.
	 * @returns The {@link CompletionItem CompletionItem} that represents this function.
	 */
	buildCompletionItem(): CompletionItem {
		//const ci: CompletionItem;
		const labelDetails: CompletionItemLabelDetails = {
			// Decided that this clutters up the UI too much. Same information is displayed in the CompletionItem details.
			//detail: "(" + params + ")",
			description: this.returnType
		}
		let label = this.name;
		let retType = this.returnType;
		let funcType = this.functionType;

		let cik: CompletionItemKind = this.convertFunctionTypeToCompletionItemKind(this.functionType);
		
		let classRef = ((this.className === "") ? "" : this.className + ".");
		// For constructor functions, we don't want something like vec2.vec2(args). We just want vec2(args).
		if (cik === CompletionItemKind.Constructor) { classRef = ""; }
		// let ci_details: string = "(" + this.functionType + ") " + classRef + this.name + "(" + this.rawParams + "): " + this.returnType;
		const functionDetails = "```javascript\n" + this.buildFunctionDetails() + "\n```";
		// const documentation = "```text\n\n" + this.documentation + "```";
		const documentation = (this.documentation as string).replace(/\t/g,"&emsp;").replace(/    /g,"&emsp;").replace(/\n/g,"\\\n");
		// debug(documentation)
		const source = "Source: " + this.determineSource(this.sourceFile);
		// let docs: MarkupContent = {
		// 	kind: 'markdown',
		// 	value: functionDetails + "  \n  " + documentation// + "  \n  " + source
		// }
		let docs = this.buildMarkUpContent(this.documentation as string);
		// docs.value = docs.value.replace(/\t/g,"&emsp;").replace(/    /g,"&emsp;").replace(/\n/g,"\\\n");
		let insert = this.name;
		if (this.parameters.length === 0 && this.functionType !== "property" && this.functionType !== "constant") {
			insert = this.name + "()"
		}
		let name = this.name;
		if (this.functionType !== "constant" && this.functionType !== "property") {
			name = name + "()";
		}

		let ci : CompletionItem = {
			label: name,
			kind: cik,
			//command: { command: 'editor.action.triggerSuggest', title: 'Re-trigger completions...' },
			documentation: docs,// this.documentation,
			detail: this.name,
			labelDetails: labelDetails,
			insertText: insert
		}
		return ci;
	}

	buildSignatureInformation(): SignatureInformation {
		let ci_details: string = "(" + this.functionType + ") " + ((this.className === "") ? "" : this.className + ".") + this.name + ((this.functionType === "constant") ? ": " : "(" + this.rawParams + "): ") + (this.functionType === "constructor") ? this.className : this.name;
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
				for (const s of getArtemisGlobals().widget_stylestrings) {
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
	default?: string;
	constructor(raw: string, pos: integer, docs?: string) {
		this.name = "";
		this.documentation = (docs === undefined) ? "" : docs;
		const pDef: string[] = raw.split(":");
		const test = /(\w+)\=(\w+)/;
		const match = pDef[0].trim().match(test);
		if (match) {
			this.name = match[1];
			this.default = match[2];
		} else {
			this.name = pDef[0].trim();
			this.default = "";
		}
		if (pDef.length === 1) {
			this.type = "any?";
		} else {
			this.type = pDef[1].trim();
		}
		return this;
	}
}