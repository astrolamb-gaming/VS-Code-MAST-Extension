import { CompletionItem, CompletionItemKind, CompletionItemLabelDetails, integer, Location, MarkupContent, MarkupKind, ParameterInformation, SignatureInformation } from 'vscode-languageserver';
import { getRegExMatch } from './class';
import { debug } from 'console';
import { NewlineTransformer } from 'python-shell';
import { getPreferredClassName } from '../data';

function getWidgetStylesForFunction(functionName: string): Array<{ function: string; name: string; docs: string }> {
	try {
		// Lazy import prevents test runs from bootstrapping the language server connection.
		const artemis = require('../artemisGlobals') as { getArtemisGlobals: () => { widget_stylestrings: Array<{ function: string; name: string; docs: string }> } };
		return (artemis.getArtemisGlobals()?.widget_stylestrings || []).filter((entry) => entry.function === functionName);
	} catch {
		return [];
	}
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

	constructor(raw: string, className: string, sourceFile: string, preParsed?: {
		name?: string;
		parameters?: IParameter[];
		rawParams?: string;
		returnType?: string;
		documentation?: string;
		functionType?: string;
		decorators?: string[];
		location?: Location;
		isAsync?: boolean;
	}) {
		this.className = getPreferredClassName(className);
		this.sourceFile = sourceFile;
		this.location = {uri:sourceFile,range: {start: {line:0,character:0},end: {line:0,character:1}}};
		
		// If pre-parsed data is provided, use it directly (avoids expensive regex parsing)
		if (preParsed) {
			this.name = preParsed.name || '';
			this.parameters = preParsed.parameters || [];
			this.rawParams = preParsed.rawParams || '';
			this.returnType = preParsed.returnType || '';
			const rawDocstring = preParsed.documentation || '';
			this.documentation = this.parseDocString(rawDocstring);
			this.functionType = preParsed.functionType || 'function';
			this.location = preParsed.location || this.location;
			this.applyDocstringTypes(rawDocstring);
			
			// Handle constructor naming
			if (this.name === "__init__" || this.functionType === "constructor") {
				this.name = className;
				this.functionType = "constructor";
			}
			
			return this;
		}
		
		// Otherwise, do traditional regex parsing
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

		const func : RegExp = /def (\w+?)\((.*?)\)/s;
		const definition = getRegExMatch(raw, func);

		this.name = getRegExMatch(definition, functionName).replace("def ","").replace("(","").trim();

		let params = getRegExMatch(definition, functionParam).replace(/\(|\)/g,"").replace(/self(.*?,|.*?$)/m,"").replace(/^[\t ]*#.*?(\n|$)/gm,"").replace(/\n\s*\n/g,"\n").trim();
		if (params.endsWith(",")) {
			params = params.substring(0,params.length-1);
		}
		this.rawParams = params;

		let comments = getRegExMatch(raw, comment).replace("\"\"\"","").replace("\"\"\"","").trim();
		const rawDocstring = comments;
		this.documentation = this.parseDocString(rawDocstring);

		this.returnType = getRegExMatch(raw, returnValue).replace(/(:|->)/g, "").trim();
		if (this.returnType === "") {
			let cLines = comments.split("\n");
			for (let i = 0; i < cLines.length; i++) {
				if (cLines[i].includes("Return")) {
					if (cLines[i+1] === undefined) {
						// debug(this)
						// debug(comments);
						break;
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
					} else if (retLine.startsWith("data_set")) {
						this.returnType = "sbs.object_data_set";
					} else {
						// We potentially modified retLine by replacing open parentheses, so we just use the source
						let line = cLines[i+1].trim();
						let end = line.indexOf(":");
						if (end > -1) {
							this.returnType = line.substring(0,end);
						} else {
							this.returnType = line;
						}
					}
					break;
				}
			}
		}

		const preNameStr = raw.substring(0, raw.indexOf("def "));
		// debug(preNameStr);

		let cik: CompletionItemKind = CompletionItemKind.Function;
		let cikStr: string = "function";
		if (isProperty.test(preNameStr)) {
			cik = CompletionItemKind.Property;
			cikStr = "property";
		}
		if (isClassMethod.test(preNameStr)) {
			cik = CompletionItemKind.Method;
			cikStr = "classmethod";
		}
		if (isSetter.test(preNameStr)) {
			cik = CompletionItemKind.Property;
			cikStr = "setter";
		}
		if (isPromise.test(preNameStr)) {
			cik = CompletionItemKind.Reference;
			cikStr = "awaitable";
		}
		if (isLabel.test(preNameStr)) {
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
		this.applyDocstringTypes(rawDocstring);
		// this.completionItem = this.buildCompletionItem();
		// this.signatureInformation = this.buildSignatureInformation();
		//debug(this);

		return this;
	}

	convertFunctionTypeToCompletionItemKind(type:string): CompletionItemKind {
		let cik: CompletionItemKind = CompletionItemKind.Function;
		if (type === "setter") return CompletionItemKind.Property;
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
		let classRef = ((this.className === "" || this.className === this.name) ? "" : this.className + ".");

		let paramList = "";
		if ((this.functionType !== 'property') && (this.functionType !== 'constant')) {
			const normalizedParams = (this.rawParams || '').replace(/\s*=\s*/g, '=').trim();
			paramList = "(" + normalizedParams + ")";
		}

		let retType = "";
		if (this.returnType !== "") {
			retType = " -> " + this.returnType;
		}

		let ci_details: string = "(" + this.functionType + ") " + classRef + this.name + paramList + retType;
		ci_details = "```javascript\n" + ci_details + "\n```   \n";
		return ci_details;
	}

	private normalizeParamName(name: string): string {
		return (name || '').replace(/^\*+/, '').trim();
	}

	private isLikelyType(typeName: string): boolean {
		const cleaned = (typeName || '').trim();
		if (!cleaned) return false;
		const normalized = cleaned.replace(/\s+/g, ' ');
		if (!/^[A-Za-z_][\w\[\]\.,| ]*$/.test(normalized)) {
			return false;
		}
		if (normalized.length > 32 && !/[\[\]|,]/.test(normalized)) {
			return false;
		}
		return true;
	}

	private extractDocstringParamInfo(docstring: string): Map<string, { type?: string; doc?: string }> {
		const info = new Map<string, { type?: string; doc?: string }>();
		const lines = (docstring || '').split(/\r?\n/);
		let inParams = false;
		const startSection = /^(args|arguments|parameters|params)\s*:?$/i;
		const endSection = /^(returns?|raises?|yield|yields|notes?|examples?|example|see also)\s*:?$/i;

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) {
				continue;
			}
			if (startSection.test(trimmed)) {
				inParams = true;
				continue;
			}
			if (endSection.test(trimmed)) {
				inParams = false;
				continue;
			}

			const candidate = line.replace(/^[\s*\-•]+/, '');
			let match = candidate.match(/^([A-Za-z_]\w*)\s*\(([^)]+)\)\s*:\s*(.*)$/);
			if (!match) {
				match = candidate.match(/^([A-Za-z_]\w*)\s*:\s*([^\-\n]+?)(?:\s*-\s*(.*))?$/);
			}
			if (!match) {
				continue;
			}
			if (!inParams && !/\(/.test(candidate) && !/\w+\s*:\s*\w+/.test(candidate)) {
				continue;
			}

			const name = this.normalizeParamName(match[1]);
			let typeVal: string | undefined;
			let docVal: string | undefined;
			if (match[0].includes('(')) {
				typeVal = match[2].trim();
				docVal = (match[3] || '').trim();
			} else {
				const candidateType = (match[2] || '').trim();
				if (this.isLikelyType(candidateType)) {
					typeVal = candidateType;
					docVal = (match[3] || '').trim();
				} else {
					docVal = [candidateType, match[3]].filter(Boolean).join(' - ').trim();
				}
			}

			if (name) {
				info.set(name, { type: typeVal, doc: docVal });
			}
		}

		return info;
	}

	private applyDocstringTypes(docstring: string): void {
		if (!docstring || this.parameters.length === 0) {
			return;
		}
		const info = this.extractDocstringParamInfo(docstring);
		if (info.size === 0) {
			return;
		}
		for (const param of this.parameters) {
			const name = this.normalizeParamName(param.name);
			const entry = info.get(name);
			if (!entry) {
				continue;
			}
			if ((!param.type || param.type === 'any?') && entry.type) {
				param.type = entry.type;
			}
			if ((!param.documentation || (typeof param.documentation === 'string' && param.documentation.trim() === '')) && entry.doc) {
				param.documentation = entry.doc;
			}
		}
	}


	private parseDocString(docstring: string): string {
		const newLines: string[] = [];
		const lines = docstring.split("\n");
		const param = /(\*)?[ \t]*([a-zA-Z_,][ \w|]*)(\([^\)]*\))?:(.*)?/;
		let m: RegExpMatchArray | null;
		for (let line of lines) {
			let found = false;
			// line = line.replace(/    |\t/g,"&ensp;&thinsp;");
			while (m = line.match(param)) {
				let l = "";
				if (m[4] && m[4].trim() !== "") { // If it's a param. 
					// debug(m[0])
					l = "**"+m[2].trim()+"**";
					if (m[3]) {
						l = l + " *" + m[3] + "*:  "
					} else {
						l = l + ":  "
					}
					l = l + m[4].trim();
					if (m[1]) { // If it's a list item
						l = "> " + l;
					} else {
						// Use blockquote formatting for indentation
						l = "> " + l;
					}
				} else if (m[4] === undefined) { // It's a header, like `Args:`
					l = "### " + m[2].trim();
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
		// this.documentation = comments;
		return newLines.join("\n");
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

		const line = this.location.range.start.line + 1;
		const col = this.location.range.start.character + 1;
		let uri = this.location.uri; // should already be a URI string (file://...)
		if (!uri.startsWith("file://")) {
			uri = "file:///" + uri;
		}
		// debug(uri);

		// Simple file link (works reliably)
		// const fileLink = `[Open source](${uri})`;

		// Line deep link (VS Code supports #L<line>; columns are not supported)
		const safeUri = encodeURI(uri);
		const locLink = `[Open Source](${safeUri}#L${line})`;


		const ret: MarkupContent = {
			kind: MarkupKind.Markdown,
			// value: "```javascript\n" + functionDetails + "\n```  \r\n" + docs + source
			value:[
				functionDetails,
				docs,
				locLink,
				source
			].join("\n\n")
			// value: functionDetails + "\n" + documentation + "\n\n" + source
		}
		// debug(ret.value);
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
			insertText: insert,
			data: {
				sourceFile: this.sourceFile,
				functionName: this.name,
				className: this.className
			}
		}
		return ci;
	}

	buildSignatureInformation(): SignatureInformation {
		const params:ParameterInformation[] = [];
		// const markup: MarkupContent = {
		// 	kind: "markdown",
		// 	value: "```javascript\n" + ci_details + "\n```\n```text\n" + this.documentation + "\n```\n"
		// }
		//debug(markup)
		let docs = this.buildMarkUpContent(this.documentation as string);
		const si: SignatureInformation = {
			label: this.buildFunctionDetails().replace(/^```javascript\n/, '').replace(/\n```\s*$/, ''),
			documentation: docs,//ci_details + "\n" + this.documentation,
			// TODO: Make this more Markup style instead of just text
			parameters: []
		}
		for (const i in this.parameters) {
			const pi: ParameterInformation = {
				label: this.parameters[i].name,
				documentation: ''
			}
			const paramType = this.parameters[i].type || 'any?';
			const paramDoc = this.parameters[i].documentation;
			let docText = `Type: ${paramType}`;
			if (paramDoc && typeof paramDoc === 'string') {
				docText += `\n${paramDoc}`;
			}
			pi.documentation = docText;
			if (pi.label === "style") {
				pi.documentation = pi.documentation + "\n\nStyle information:";
				for (const s of getWidgetStylesForFunction(this.name)) {
					let doc = s.name + ":\n"
					doc = doc + "    " + s.docs;
					pi.documentation = pi.documentation + "\n" + doc;
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

		// Split on first ':' only, to separate name[=default] from type[=default]
		const colonIdx = raw.search(/:\s*[^:=]/);
		let namePart: string;
		let typePart: string | undefined;
		if (colonIdx >= 0) {
			namePart = raw.substring(0, colonIdx).trim();
			typePart = raw.substring(colonIdx + 1).trim();
		} else {
			namePart = raw.trim();
			typePart = undefined;
		}

		// Extract default from the type annotation part first (e.g. "int = 5")
		let defaultVal: string | undefined;
		if (typePart !== undefined) {
			const typeEqIdx = typePart.indexOf('=');
			if (typeEqIdx >= 0) {
				defaultVal = typePart.substring(typeEqIdx + 1).trim();
				typePart = typePart.substring(0, typeEqIdx).trim();
			}
		}

		// Extract default from the name part (e.g. "x = None" or "x=None")
		const nameEqIdx = namePart.indexOf('=');
		if (nameEqIdx >= 0) {
			if (defaultVal === undefined) {
				defaultVal = namePart.substring(nameEqIdx + 1).trim();
			}
			namePart = namePart.substring(0, nameEqIdx).trim();
		}

		this.name = namePart;
		this.default = defaultVal ?? "";
		this.type = typePart ?? "any?";

		return this;
	}
}