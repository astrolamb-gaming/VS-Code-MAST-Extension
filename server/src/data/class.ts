import { MarkupContent, CompletionItem, integer, Location, CompletionItemLabelDetails, CompletionItemKind } from 'vscode-languageserver';
import { replaceNames } from '../data';
import { Function } from './function';

export class ClassObject {
	name: string;
	parent?: string;
	methods: Function[] = [];
	constructorFunction?: Function;
	documentation: string | MarkupContent;
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

		this.parent = getRegExMatch(raw,parentClass).replace(/.*\(/,"").replace(/\):?/,"");
		this.sourceFile = sourceFile;
		// Should just get the first set of comments, which would be the ones for the class itself
		this.documentation = getRegExMatch(raw, comment).replace(/\"\"\"/g,"");

		// Parse functions
		let functionSource = (this.name === "") ? sourceFile : this.name;
		this.methods = parseFunctions(raw, functionSource, this.sourceFile);
		for (const i in this.methods) {
			// debug(this.methods[i]);
			if (this.methods[i].functionType === "constructor") {
				this.constructorFunction = this.methods[i];
			}
		}
		return this;
	}

	getMethodCompletionItems(): CompletionItem[] {
		let ci: CompletionItem[] = [];
		for (const m of this.methods) {
			ci.push(m.buildCompletionItem());
		}
		return ci;
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

	let fList : Function[] = [];

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
	// debug(source);
	// TODO: Doing this seems to cause some issues.....
	// But there do seem to be multiple copies of some functions. Might need to check if these are just getters and setters
	// fList = [...new Map(fList.map(v => [v.startIndex, v])).values()]
	// if (fList.length >= 0) debug(fList);
	return fList;
}