import { debug } from 'console';
import { CompletionItem, CompletionItemKind, integer, MarkupContent, TextDocumentPositionParams } from 'vscode-languageserver';
import { getMainLabelAtPos } from './labels';
import { getClassTypings, getPyTypings, getSupportedRoutes, labelNames } from './server';
import { TextDocument } from 'vscode-languageserver-textdocument';

// const classlessFunctions: Function[] = [];
// const classList: ClassObject[] = [];

export function onCompletion(_textDocumentPosition: TextDocumentPositionParams, text: TextDocument): CompletionItem[] {
	let ci : CompletionItem[] = [];
	const t = text?.getText();
	if (text === undefined) {
		debug("Document ref is undefined");
		return ci;
	}
	if (t === undefined) {
		debug("Document text is undefined");
		return ci;
	}
	// Calculate the position in the text's string value using the Position value.
	const pos : integer = text.offsetAt(_textDocumentPosition.position);
	const startOfLine : integer = pos - _textDocumentPosition.position.character;
	const iStr : string = t.substring(startOfLine,pos);
	//debug("" + startOfLine as string);
	//
	// debug(iStr);
	let items : string[] = [
		"sbs",
		"change_console",
		"MoreThings",
		"sbs.something",
		"sbs.target",
		"sbs.functions"
	]

	if(iStr.includes("//")) {
		let routes = getSupportedRoutes();
		for (const i in routes) {
			let r = routes[i].join("/").replace("*b","");
			if ((r + "//").includes(iStr.trim())) {
				ci.push({label: r, kind: CompletionItemKind.Event});
			}
		}
		return ci;
	}
	if (iStr.endsWith("-> ") || iStr.endsWith("jump ") || iStr.endsWith("task_schedule( ") || iStr.endsWith("task_schedule (")) {
		for (const i in labelNames) {
			ci.push({label: labelNames[i].name, kind: CompletionItemKind.Event});
		}
		const lbl = getMainLabelAtPos(startOfLine,labelNames).subLabels;
		for (const i in lbl) {
			ci.push({label: lbl[i], kind: CompletionItemKind.Event});
		}
		return ci;
	}
	if (iStr.includes("--") || iStr.includes("==")) {
		return ci;
	}

	if (iStr.endsWith("(")) {
		// const func: RegExp = /[\w. ]+?\(/g
		// let m: RegExpExecArray | null;
		// while (m = func.exec(iStr)) {

		// }
		return ci;
	}

	const ct: ClassTypings[] = getClassTypings();
	// First we check if it should be just stuff from a particular class
	for (const i in ct) {
		let found = false;
		if (iStr.endsWith(ct[i].name + ".")) {
			const cf: CompletionItem[] = ct[i].completionItems;
			for (const j in cf) {
				ci.push(cf[j]);
			}
			found = true;
		}
		if (found) {
			return ci;
		}
	}
	// If it doesn't belong to a particular class, add class name to the list of completion items
	for (const i in ct) {
		ci.push(ct[i].classCompItem);
	}

	// his was all just for testing really anyhow
	// items.forEach((i)=>{
	// 	//ci.push({label: "sbs: #" + _textDocumentPosition.position.character, kind: CompletionItemKind.Text});
	// 	if (i.indexOf(".")< _textDocumentPosition.position.character-1) {
	// 		ci.push({label: i, kind: CompletionItemKind.Text});
	// 	}
		
	// });

	// completionStrings.forEach((i)=>{
	// 	if (i.indexOf(".")< _textDocumentPosition.position.character-1) {
	// 		ci.push({label: i, kind: CompletionItemKind.Text});
	// 	}
	// })

	

	ci = ci.concat(getPyTypings());
	return ci;
}

// function buildCompletionItemFromClass(c: ClassTypings): CompletionItem {
// 	const ci: CompletionItem = {
// 		label: c.name,
// 		kind: CompletionItemKind.Class,
// 		command: { command: 'editor.action.triggerSuggest', title: 'Re-trigger completions...' },
// 		documentation: c.comments,
// 		detail: ci_details,
// 		labelDetails: labelDetails
// 	}
// 	return c.classCompItem;
// }
// function buildCompletionItemFromFunction(f: Function): CompletionItem {
// 	const ci: CompletionItem = {
// 		label: f.name
		
// 	}
// 	return ci;
// }
// function buildCompletionItemFromParam(p: IParameter) {
// 	const ci: CompletionItem = {
// 		label: p.name
// 	}
// }

// // export interface MastFile {
// // 	uri: string,

// // }

// // export interface PyFile {
// // 	uri: string,

// // }

export interface ClassTypings {
	name: string,
	classCompItem: CompletionItem,
	completionItems: CompletionItem[], // This will be converted into methods: Function[]
	documentation: string | MarkupContent, // https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-and-highlighting-code-blocks#syntax-highlighting
	//methods?: Function[]
}

// /**
//  * Object containing all relevant information regarding a function.
//  */
// export interface IFunction {
// 	/**
// 	 * the name of the function
// 	 */
// 	name: string,
// 	/**
// 	 * Function, Method, or Constructor
// 	 */
// 	functionType?: string,
// 	/**
// 	 * If this function is a class method, the class name goes here
// 	 */
// 	class?: string,
// 	/**
// 	 * Any documentation relevant to the function
// 	 */
// 	documentation?: string | MarkupContent,
// 	/**
// 	 * Parameters for the function
// 	 */
// 	parameters?: IParameter[],
// 	/**
// 	 * Return type of the function
// 	 */
// 	returnType?: string
// }

// export interface IParameter {
// 	name: string,
// 	type?: string,
// 	documentation?: string | MarkupContent
// }

// export class ClassObject implements ClassTypings {
// 	name ="";
// 	constructor(raw: string) {
// 		this.name = "";
// 	}
// 	//classCompItem: CompletionItem;
// 	//completionItems: CompletionItem[];
// 	documentation?: string | MarkupContent | undefined;
// 	methods?: Function[] | undefined;
// }

// export class Function implements IFunction {
// 	name = "";
// 	documentation?: string | MarkupContent
// 	constructor(raw: string) {
// 		this.name = "";
		
// 	}
// }

// export class Parameter implements IParameter {
// 	name = "";
// 	constructor(raw: string) {
// 		this.name = "";
// 	}
// }
