import { CompletionItem, CompletionItemKind, Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getCurrentLineFromTextDocument } from '../requests/hover';
import { debug } from 'console';
import { getCache } from '../cache';
import { Token } from './tokenBasedExtractor';

// TODO: Add these to autocomplete and hover
export const variableModifiers: string[][] = [
	["default", "`default` means that if the variable is not already defined, define it. Otherwise, skip. So it does not overwrite if it exists."],
	["shared","Variables with this modifier are used by the server and all clients. It is a per MAST instance"],
	// TODO: what do assigned and temp do to variables? See mast_node.py, class Scope for deets on these
	["assigned",""],
	["client","Variables with the `client` modifier are only used by the client, as handled by the scheduler."],
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
/**
 * 
 * @param doc 
 * @returns A list of strings, each string is a variable name.
 */
export function getVariableNamesInDoc(doc: TextDocument): string[] {
	let vars: string[] = [];
	const variableRX = /^[\t ]*(default[ \t]+)?((shared|assigned|client|temp)[ \t]+)?([a-zA-Z_]\w*)[\t ]*(?==[^=])/gm;
	const text = doc.getText();
	let m: RegExpExecArray | null;
	while (m = variableRX.exec(text)) {
		const v = m[4];//.replace(/(shared|assigned|client|temp|default)/g,"").trim();
		if (!vars.includes(v)) {
			vars.push(v);
		}
	}
	vars = [...new Set(vars)];
	return vars;
}

export function getDefaultVariableNamesInRange(doc: TextDocument, startOffset: number = 0, endOffset?: number): string[] {
	const fullText = doc.getText();
	const safeStart = Math.max(0, startOffset);
	const safeEnd = Math.min(endOffset ?? fullText.length, fullText.length);
	if (safeEnd <= safeStart) {
		return [];
	}

	const text = fullText.substring(safeStart, safeEnd);
	const variableRX = /^[\t ]*(default[ \t]+)((shared|assigned|client|temp)[ \t]+)?([a-zA-Z_]\w*)[\t ]*(?==[^=])/gm;
	const vars: string[] = [];
	let m: RegExpExecArray | null;
	while (m = variableRX.exec(text)) {
		const v = m[4];
		if (!vars.includes(v)) {
			vars.push(v);
		}
	}
	return vars;
}

/**
 * 
 * @param doc 
 * @returns A list of {@link Variable Variable}s
 */
export function parseVariables(doc: TextDocument): Variable[] {
	let ret: Variable[] = [];
	const variableRX = /^[\t ]*(default[ \t]+)?((shared|assigned|client|temp)[ \t]+)?([a-zA-Z_]\w*)[\t ]*(?==[^=])/gm;
	const text = doc.getText();
	let m: RegExpExecArray | null;
	while (m = variableRX.exec(text)) {
		const v = m[4];//.replace(/(shared|assigned|client|temp|default)/g,"").trim();
		const start = m[0].indexOf(v) + m.index;
		const end = start + m[0].length-1;
		const range: Range = { start: doc.positionAt(start), end: doc.positionAt(end)}
		const line = getCurrentLineFromTextDocument(range.start,doc);
		let val = line.substring(line.indexOf("=")+1,line.length-1).trim();
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
	const buttonStyles = /=(\$\w+)[\t ](.*?)$/gm;
	while (m = buttonStyles.exec(text)) {
		const v = m[1];
		const start = m.index + m[0].indexOf(v);
		const end = v.length + start;
		const range: Range = { start: doc.positionAt(start), end: doc.positionAt(end)}
		// const line = getCurrentLineFromTextDocument(range.start,doc);
		let var1: Variable = {
			name: v,
			range: range,
			doc: m[2],
			equals: "Button Style",
			types: ["string"]
		}
		ret.push(var1);
	}
	const guiVar = /var[ \t]*=[ \t]*[\"\'](\w+)[\"\']/g;
	while (m = guiVar.exec(text)) {
		const v = m[1];
		const start = m.index + m[0].indexOf(v);
		const end = v.length + start;
		const range: Range = { start: doc.positionAt(start), end: doc.positionAt(end)}
		// const line = getCurrentLineFromTextDocument(range.start,doc);
		let var1: Variable = {
			name: v,
			range: range,
			doc: '',
			equals: "GUI Element Value",
			types: []
		}
		ret.push(var1);
	}

	ret = [...new Map(ret.map(v => [v.range, v])).values()];
	// debug(ret);
	return ret;
}

/**
 * Token-based variable parser for MAST docs.
 * This uses semantic tokens produced by the lexer and avoids regex rescans.
 */
export function parseVariablesFromTokens(doc: TextDocument, tokens: Token[]): Variable[] {
	const text = doc.getText();
	const ret: Variable[] = [];

	for (const token of tokens) {
		if (token.type !== 'variable' || token.modifier !== 'definition') {
			continue;
		}

		const start = doc.offsetAt({ line: token.line, character: token.character });
		const end = start + token.length;
		const range: Range = {
			start: { line: token.line, character: token.character },
			end: { line: token.line, character: token.character + token.length }
		};

		const lineStartOffset = doc.offsetAt({ line: token.line, character: 0 });
		const lineEndOffset = token.line + 1 < doc.lineCount
			? doc.offsetAt({ line: token.line + 1, character: 0 })
			: text.length;
		const line = text.substring(lineStartOffset, lineEndOffset);
		const eq = line.indexOf('=');
		const equalsValue = eq > -1 ? line.substring(eq + 1).trim() : '';

		ret.push({
			name: token.text,
			range,
			doc: '',
			equals: equalsValue,
			types: []
		});
	}

	// Keep support for <var some_name> placeholders (tokenized as stringOption).
	for (const token of tokens) {
		if (token.type !== 'stringOption') {
			continue;
		}
		const m = token.text.match(/^<var[ \t]+([a-zA-Z_]\w*)>$/);
		if (!m) {
			continue;
		}
		const varName = m[1];
		const relStart = token.text.indexOf(varName);
		const absStart = doc.offsetAt({ line: token.line, character: token.character }) + relStart;
		const range: Range = {
			start: doc.positionAt(absStart),
			end: doc.positionAt(absStart + varName.length)
		};
		ret.push({
			name: varName,
			range,
			doc: '',
			equals: 'Random Text Option',
			types: ['string']
		});
	}

	// De-duplicate by name + start location.
	const uniq = new Map<string, Variable>();
	for (const v of ret) {
		const key = `${v.name}:${v.range.start.line}:${v.range.start.character}`;
		if (!uniq.has(key)) {
			uniq.set(key, v);
		}
	}

	return Array.from(uniq.values());
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

export function checkForAssignmentsToScopeName(vars:Variable[]):Diagnostic[] {

	let ret:Diagnostic[] = [];
	for (const v of vars) {
		for (const scope of variableModifiers) {
			if (v.name === scope[0]) {
				// if (v.doc.endsWith(".mast")) { // python files could use this
					let d:Diagnostic = {
						range: v.range,
						message: "Cannot assign a value to " + v.name + ". " + v.name + " is a scope declaration keyword.",
						severity: DiagnosticSeverity.Error
					}
					ret.push(d);
				// }
			}
		}
	}

	return ret;
}
