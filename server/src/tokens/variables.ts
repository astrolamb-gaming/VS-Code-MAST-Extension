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

interface VariableDocLookup {
	namedDocsByScopedName: Map<string, string>;
	lineScopedDocs: Map<number, string>;
	labelDefinitionLines: number[];
}

export let variables: CompletionItem[] = [];

function isIdentifierStartChar(c: string): boolean {
	return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_';
}

function isIdentifierChar(c: string): boolean {
	return isIdentifierStartChar(c) || (c >= '0' && c <= '9');
}

function isLabelDefinitionToken(token: Token): boolean {
	if (token.modifier !== 'definition') {
		return false;
	}
	return token.type === 'label' || token.type === 'route-label' || token.type === 'media-label';
}

function getLabelScopeKeyForLine(line: number, labelDefinitionLines: number[]): string {
	let scopeLine = -1;
	for (const labelLine of labelDefinitionLines) {
		if (labelLine > line) {
			break;
		}
		scopeLine = labelLine;
	}
	return scopeLine >= 0 ? `L${scopeLine}` : 'global';
}

function isDefaultDefinitionPrefix(prefix: string): boolean {
	if (!prefix.startsWith('default')) {
		return false;
	}
	if (prefix.length === 'default'.length) {
		return false;
	}
	const next = prefix['default'.length];
	return next === ' ' || next === '\t';
}

function parseArgDirectiveFromComment(commentText: string): { name?: string; description: string } | null {
	const trimmed = commentText.trimStart();
	if (!trimmed.startsWith('#@arg')) {
		return null;
	}

	let i = '#@arg'.length;
	while (i < trimmed.length && (trimmed[i] === ' ' || trimmed[i] === '\t')) {
		i++;
	}

	if (i >= trimmed.length) {
		return null;
	}

	if (trimmed[i] === ':') {
		return { description: trimmed.substring(i + 1).trim() };
	}

	const nameStart = i;
	while (i < trimmed.length && isIdentifierChar(trimmed[i])) {
		i++;
	}
	const name = trimmed.substring(nameStart, i);
	if (!name || !isIdentifierStartChar(name[0])) {
		return null;
	}

	while (i < trimmed.length && (trimmed[i] === ' ' || trimmed[i] === '\t')) {
		i++;
	}
	if (i >= trimmed.length || trimmed[i] !== ':') {
		return null;
	}

	return {
		name,
		description: trimmed.substring(i + 1).trim()
	};
}

function buildVariableDocLookupFromTokens(tokens: Token[]): VariableDocLookup {
	const namedDocsByScopedName = new Map<string, string>();
	const lineScopedDocs = new Map<number, string>();
	const orderedTokens = [...tokens].sort((a, b) => {
		if (a.line !== b.line) {
			return a.line - b.line;
		}
		return a.character - b.character;
	});
	const labelDefinitionLines: number[] = [];

	let pendingAnonymous: string | undefined = undefined;
	let pendingScopeKey = 'global';
	let currentScopeKey = 'global';
	for (const token of orderedTokens) {
		if (isLabelDefinitionToken(token)) {
			currentScopeKey = `L${token.line}`;
			if (!labelDefinitionLines.includes(token.line)) {
				labelDefinitionLines.push(token.line);
			}
			pendingAnonymous = undefined;
			continue;
		}

		if (token.type === 'comment') {
			const directive = parseArgDirectiveFromComment(token.text);
			if (!directive) {
				continue;
			}
			if (directive.name) {
				namedDocsByScopedName.set(`${currentScopeKey}::${directive.name}`, directive.description);
			} else {
				pendingAnonymous = directive.description;
				pendingScopeKey = currentScopeKey;
			}
			continue;
		}

		if (pendingAnonymous && token.type === 'variable' && token.modifier === 'definition') {
			if (pendingScopeKey === currentScopeKey) {
				lineScopedDocs.set(token.line, pendingAnonymous);
			}
			pendingAnonymous = undefined;
		}
	}

	labelDefinitionLines.sort((a, b) => a - b);
	return { namedDocsByScopedName, lineScopedDocs, labelDefinitionLines };
}

function buildVariableDocLookup(doc: TextDocument, tokens?: Token[]): VariableDocLookup {
	if (tokens && tokens.length > 0) {
		return buildVariableDocLookupFromTokens(tokens);
	}

	const namedDocsByScopedName = new Map<string, string>();
	const lineScopedDocs = new Map<number, string>();
	const text = doc.getText();
	const lines = text.split(/\r?\n/);
	const varDefLineRX = /^[\t ]*(default[ \t]+)?((shared|assigned|client|temp)[ \t]+)?([a-zA-Z_]\w*)[\t ]*(?==[^=])/;
	const argAnonRX = /^[\t ]*#@arg:[\t ]*(.*?)\s*$/;
	const argNamedRX = /^[\t ]*#@arg[ \t]+([a-zA-Z_]\w*)[\t]*:[\t]*(.*?)\s*$/;

	let pendingAnonymous: string | undefined = undefined;
	for (let line = 0; line < lines.length; line++) {
		const current = lines[line] || '';

		let m = current.match(argNamedRX);
		if (m) {
			namedDocsByScopedName.set(`global::${m[1]}`, m[2]);
			continue;
		}

		m = current.match(argAnonRX);
		if (m) {
			pendingAnonymous = m[1];
			continue;
		}

		if (pendingAnonymous && varDefLineRX.test(current)) {
			lineScopedDocs.set(line, pendingAnonymous);
			pendingAnonymous = undefined;
		}
	}

	return { namedDocsByScopedName, lineScopedDocs, labelDefinitionLines: [] };
}
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

	let tokens: Token[] = [];
	try {
		tokens = getCache(doc.uri).getMastFile(doc.uri).tokens || [];
	} catch {
		tokens = [];
	}

	if (tokens.length > 0) {
		const vars: string[] = [];
		for (const token of tokens) {
			if (token.type !== 'variable' || token.modifier !== 'definition') {
				continue;
			}

			const tokenOffset = doc.offsetAt({ line: token.line, character: token.character });
			if (tokenOffset < safeStart || tokenOffset >= safeEnd) {
				continue;
			}

			const lineStartOffset = doc.offsetAt({ line: token.line, character: 0 });
			const prefix = fullText.substring(lineStartOffset, tokenOffset).trimStart();
			if (!isDefaultDefinitionPrefix(prefix)) {
				continue;
			}

			if (!vars.includes(token.text)) {
				vars.push(token.text);
			}
		}
		return vars;
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
 * Token-based variable parser for MAST docs.
 * This uses semantic tokens produced by the lexer and avoids regex rescans.
 */
export function parseVariablesFromTokens(doc: TextDocument, tokens: Token[]): Variable[] {
	const text = doc.getText();
	const ret: Variable[] = [];
	const docLookup = buildVariableDocLookup(doc, tokens);

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
		const scopeKey = getLabelScopeKeyForLine(token.line, docLookup.labelDefinitionLines);
		const scopedNamedDoc = docLookup.namedDocsByScopedName.get(`${scopeKey}::${token.text}`);
		const globalNamedDoc = docLookup.namedDocsByScopedName.get(`global::${token.text}`);

		ret.push({
			name: token.text,
			range,
			doc: scopedNamedDoc || docLookup.lineScopedDocs.get(token.line) || globalNamedDoc || '',
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
		const scopeKey = getLabelScopeKeyForLine(token.line, docLookup.labelDefinitionLines);
		const scopedNamedDoc = docLookup.namedDocsByScopedName.get(`${scopeKey}::${varName}`);
		const globalNamedDoc = docLookup.namedDocsByScopedName.get(`global::${varName}`);
		ret.push({
			name: varName,
			range,
			doc: scopedNamedDoc || globalNamedDoc || '',
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
	let finalDoc = doc.trim();
	if (vars.doc && vars.doc.trim() !== '') {
		finalDoc = `Description:\n${vars.doc.trim()}\n\n${finalDoc}`;
	}
	ci.documentation = finalDoc;
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
