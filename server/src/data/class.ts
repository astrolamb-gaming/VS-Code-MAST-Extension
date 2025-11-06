import { MarkupContent, CompletionItem, integer, Location, CompletionItemLabelDetails, CompletionItemKind, Range } from 'vscode-languageserver';
import { replaceNames } from '../data';
import { Function } from './function';
import { Variable } from '../tokens/variables';
import { debug } from 'console';
import { block } from 'sharp';

export class ClassObject {
	name: string;
	parent?: string;
	methods: Function[] = [];
	properties: Variable[] = [];
	constructorFunction?: Function;
	documentation: string | MarkupContent;
	sourceFile: string;
	startPos: integer;
	location: Location;

	constructor(raw: string, sourceFile: string) {
		this.startPos = 0;
		this.location = {uri:sourceFile,range: {start: {line:0,character:0},end: {line:0,character:1}}}
		let className : RegExp = /^class .+?:/gm; // Look for "class ClassName:" to parse class names.
		// debug(className);
		const parentClass: RegExp = /\(([\w\"]*?)\):/
		let comment : RegExp = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/m;
		
		// TODO: Could pull the class parent and interfaces (if any). Would this be useful?
		this.name = getRegExMatch(raw,className).replace("class ","").replace(/(\(.*?\))?:/,"");
		// debug(this.name);
		
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
		this.methods = this.parseFunctions(raw, functionSource, this.sourceFile);
		this.properties = parseVariables(raw, functionSource, this.sourceFile);
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

	buildVariableCompletionItemList():CompletionItem[] {
		let ret: CompletionItem[] = [];
		for (const v of this.properties) {
			const ci: CompletionItem = {
				label: "[" + this.name + "]." + v.name,
				kind: CompletionItemKind.Property,
				insertText: v.name
			}
			ret.push(ci);
		}
		return ret;
	}

	/**
	 * Gets all functions within a particular module or class.
	 * Really it's all functions defined within the provided text, so you need to be careful that only what you want is in here.
	 * @param raw The raw text contents, as a string
	 * @returns List of {@link Function Function} items
	 */
	parseFunctions(raw: string, source: string, sourceFile: string) {
		let m: RegExpExecArray | null;

		let fList : Function[] = [];

		let testStr = '    @label\n    def add_client_tag() -> None:\n    """stub; does nothing yet."""';

		let wholeFunction : RegExp = /((@property|\.setter|@classmethod|@staticmethod|@label|@awaitable)[ \t]*([\n\t\r ]))?[\t ]*?(def[ \t])/g;

		let functionName : RegExp = /((def\s)(.+?)\()/gm; // Look for "def functionName(" to parse function names.
		//let className : RegExp = /class (.+?):/gm; // Look for "class ClassName:" to parse class names.
		let functionParam : RegExp = /\((.*?)\)/m; // Find parameters of function, if any.
		let returnValue : RegExp = /->(.+?):/gm; // Get the return value (None, boolean, int, etc)
		let comment : RegExp = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/gms;
		let isProperty : RegExp = /(@property)/;
		let isClassMethod: RegExp = /@classmethod/;
		let isSetter : RegExp = /\.setter/;

		let mods : RegExp = /(@property|\.setter|@classmethod|@staticmethod|@label|@awaitable)/;

		let spaces: RegExp = /^([ \t]*)./gm;

		let blockIndices: integer[] = [];

		let lines:string[] = raw.split("\n");

		let blockLineIndices: integer [] = [];
		
		let currentStart = 0;
		let isFunctionDef = false;
		for (const i in lines) {
			let line = lines[i]
			let m = line.match(spaces);
			if (m) {
				// Check if it's a function definition
				if (functionName.test(line) || mods.test(line)) {
					// Check if it's still part of the function def
					if (!isFunctionDef) {
						blockLineIndices.push(parseInt(i));
						isFunctionDef = true;
					}
					continue;
				}
				isFunctionDef = false;
			}
		}
		blockLineIndices.push(lines.length);
		let start = 0;
		for (const index of blockLineIndices) {
			let funcLines = [];
			// let str = ""
			for (let i = start; i < index; i++){
				funcLines.push(lines[i]);
				// str = str + "\n" + lines[i];
				start = i;
			}
			// debug(str);
			let str = funcLines.join("\n");
			const f: Function = new Function(str, source, sourceFile);
			if (f.name === "") continue;
			fList.push(f);
		}
		return fList;



		// while (m = wholeFunction.exec(raw)) {
		// 	blockIndices.push(m.index);
		// }
		// // debug(blockIndices)
		// if (blockIndices.length === 0) {
		// 	return fList;
		// }
		// blockIndices.push(raw.length - 1);
		// let len = blockIndices.length; // How many indices there are - NOT the same as number of classes (should be # of classes - 1)
		// for (let i = 0; i < len; i++) {
		// 	let t: string;
		// 	let start = blockIndices[0];
		// 	if (i === 0) {
		// 		t = raw.substring(0, start);
		// 	} else {
		// 		start = blockIndices[i - 1];
		// 		t = raw.substring(start, blockIndices[i]);
		// 	}
		// 	const f: Function = new Function(t, source, sourceFile);
		// 	if (f.name=== "") {
		// 		// This is all the stuff between the class def and first function def
		// 		// debug(t);
		// 		continue;
		// 	}
		// 	// f.startIndex = f.startIndex + this.startPos;
		// 	fList.push(f);
		// }
		// // debug(source);
		// // TODO: Doing this seems to cause some issues.....
		// // But there do seem to be multiple copies of some functions. Might need to check if these are just getters and setters
		// // fList = [...new Map(fList.map(v => [v.startIndex, v])).values()]
		// // if (fList.length >= 0) debug(fList);
		// return fList;
	}
}

function parseVariables(raw:string, source:string, sourceFile:string):Variable[] {
	let ret: Variable[] =[];
	let def = raw.indexOf("def");
	raw = raw.substring(0,def);
	let v = /^\s*(\w+)\s*(:\s*(\w+))?=.*$/gm;
	let m: RegExpExecArray | null;
	
	while (m = v.exec(raw)) {
		let type = ""
		if (m[3]) type = m[3];
		const newVar:Variable = {
			name: m[1],
			range: {
				start: {
					line: 0,
					character: 0
				},
				end: {
					line: 0,
					character: 0
				}
			},
			doc: '',
			equals: '',
			types: [type]
		}
		ret.push(newVar)
	}

	v = /self\.(\w+)\b/g;
	while (m = v.exec(raw)) {
		const newVar:Variable = {
			name: m[1],
			range: {
				start: {
					line: 0,
					character: 0
				},
				end: {
					line: 0,
					character: 0
				}
			},
			doc: '',
			equals: '',
			types: []
		}
		ret.push(newVar)
	}
	return ret;
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
