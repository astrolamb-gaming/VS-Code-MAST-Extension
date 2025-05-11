import { CompletionItem, CompletionItemKind, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getCurrentLineFromTextDocument } from '../hover';
import { debug } from 'console';
import { getCache } from '../cache';

// TODO: Add these to autocomplete and hover
export const variableModifiers: string[][] = [
	["default", "`default` means that if the variable is not already defined, define it. Otherwise, skip. So it does not overwrite if it exists."],
	["shared","Variables with this modifier are used by the server and all clients"],
	// TODO: what do assigned and temp do to variables?
	["assigned",""],
	["client","Variables with the `client` modifier are only used by the client."],
	["temp",""]
]

export interface Variable {
	name: string,
	range: Range,
	doc: string,
	equals: string,
	types: string[]
}

export let variables: CompletionItem[] = [];
export function getVariableNamesInDoc(doc: TextDocument) {
	let vars: string[] = [];
	const variableRX = /^[\t ]*(default[ \t]+)?((shared|assigned|client|temp)\s+)?[a-zA-Z_]\w*[\t ]*(?==[^=])/gm;
	const text = doc.getText();
	let m: RegExpExecArray | null;
	while (m = variableRX.exec(text)) {
		const v = m[0].replace(/(shared|assigned|client|temp|default)/g,"").trim();
		if (!vars.includes(v)) {
			vars.push(v);
		}
	}
	vars = [...new Set(vars)];
	return vars;
}

export function parseVariables(doc: TextDocument): Variable[] {
	let ret: Variable[] = [];
	const variableRX = /^[\t ]*(default[ \t]+)?((shared|assigned|client|temp)\s+)?[a-zA-Z_]\w*[\t ]*(?==[^=])/gm;
	const text = doc.getText();
	let m: RegExpExecArray | null;
	while (m = variableRX.exec(text)) {
		const v = m[0].replace(/(shared|assigned|client|temp|default)/g,"").trim();
		const start = m[0].indexOf(v) + m.index;
		const end = start + m[0].length;
		const range: Range = { start: doc.positionAt(start), end: doc.positionAt(end)}
		const line = getCurrentLineFromTextDocument(range.start,doc);
		let val = line.substring(line.indexOf("=")+1,line.length).trim();
		let var1: Variable = {
			name: v,
			range: range,
			doc: '',
			equals: val,
			types: []
		}
		// Instead of parsing the type every time an updated is made (super inefficient, loading takes forever),
		// we're instead going to parse just the applicable variable.
		ret.push(var1);
	}
	const randomTxtGen = /<var[ \t]+(\w+)>/g;
	while (m = randomTxtGen.exec(text)) {
		const v = m[1];
		const start = m.index + m[0].indexOf(v);
		const end = v.length + start;
		const range: Range = { start: doc.positionAt(start), end: doc.positionAt(end)}
		// const line = getCurrentLineFromTextDocument(range.start,doc);
		let var1: Variable = {
			name: v,
			range: range,
			doc: '',
			equals: "Random Text Option",
			types: ["string"]
		}
		ret.push(var1);
	}
	ret = [...new Map(ret.map(v => [v.range, v])).values()];
	// debug(ret);
	return ret;
}

export function getVariablesAsCompletionItem(vars: Variable[]) {
	const arr: CompletionItem[] = [];
	for (const v of vars) {
		const ci: CompletionItem = {
			label: v.name,
			kind: CompletionItemKind.Variable,
			//TODO: Check type of variable?
			labelDetails: {description: "var"},
			documentation: "Possible types:\n"
		}
		for (const d of v.types) {

		}
		arr.push(ci);
	}
	variables = arr;
	return arr;
} 

export function getVariableAsCompletionItem(vars: Variable): CompletionItem {
	const ci: CompletionItem = {
		label: vars.name,
		kind: CompletionItemKind.Variable,
		labelDetails: {description: "var"}
	}
	let doc: string = "Possible types:\n"
	for (const v of vars.types) {
		if (!doc.includes(v)) {
			doc = doc + "\n"
		}
	}
	ci.documentation = doc.trim();
	return ci;
}