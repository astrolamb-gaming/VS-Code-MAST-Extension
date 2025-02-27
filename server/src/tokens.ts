import { debug } from 'console';
import { Range, TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import { CompletionItem, CompletionItemKind, integer } from 'vscode-languageserver';
import { getVariablesInFile } from './data';

export function getAllTokens(textDocument: TextDocument) {
	let variables = getVariablesInFile(textDocument);
}

export interface Token {
	type: TokenType,
	start: integer,
	end: integer,
	children: Token[]
}

export enum TokenType {
	VARIABLE,
	STRING,
	FUNC,
	CLASS,
	OPERATOR,
	LABEL,
	ROUTE_LABEL,
	RESOURCE_LABEL,
	MEDIA_LABEL
}
function getTokenTypeRegex(type: TokenType) {
	switch (type) {
		case TokenType.STRING:
			return /\".*?\"/;
		case TokenType.VARIABLE:
			return /\b\w+\b/;
		default:
			return /test/;
	}
}

export let variables: CompletionItem[] = [];
export function getVariableNamesInDoc(textDocument: TextDocument) {
	debug("Getting variable names");
	const vars: string[] = [];
	const arr: CompletionItem[] = [];
	const variableRX = /^\s*[a-zA-Z_]\w*\s*(?==[^=])/gm;
	const text = textDocument.getText();
	let m: RegExpExecArray | null;
	while (m = variableRX.exec(text)) {
		const v = m[0].trim();
		debug(m[0])
		if (!vars.includes(v)) {
			vars.push(v);
		}
	}

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