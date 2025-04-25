import { CompletionItem, CompletionItemKind, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getCurrentLineFromTextDocument } from '../hover';
import { debug } from 'console';

// TODO: Add these to autocomplete and hover
export const variableModifiers: string[][] = [
	["default", "`Default` means that if the variable is not already defined, define it. Otherwise, skip. So it does not overwrite if it exists."],
	["shared","Variables with this modifier are used by the server and all clients"],
	// TODO: what do assigned and temp do to variables?
	["assigned",""],
	["client","Variables with the `client` modifier are only used by the client."],
	["temp",""]
]

interface Variable {
	name: string,
	range: Range,
	doc: string,
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

export function parseVariables(doc: TextDocument) {
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
		debug("Variable: " + v);
		debug(val);
		let var1: Variable = {
			name: v,
			range: range,
			doc: '',
			types: []
		}
		if (val.match(/-?\d+/)) {
			var1.types.push("number");
		}
		const match = val.match(/(\w+\.)?(\w+)\(/);
		if (match) {
			const func = match[2]
		}
	}
	ret = [...new Map(ret.map(v => [v.name, v])).values()]
	return ret;
}

export function getVariablesAsCompletionItem(vars: string[]) {
	const arr: CompletionItem[] = [];
	for (const v of vars) {
		const ci: CompletionItem = {
			label: v,
			kind: CompletionItemKind.Variable,
			//TODO: Check type of variable?
			labelDetails: {description: "var"}
		}
		arr.push(ci);
	}
	variables = arr;
	return arr;
} 