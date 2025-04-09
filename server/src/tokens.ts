import { debug } from 'console';
import { Range, TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import { CompletionItem, CompletionItemKind, integer, Position } from 'vscode-languageserver';
import { ClassObject, getVariablesInFile } from './data';
import { CRange, getComments, getStrings } from './comments';

export function getAllTokens(textDocument: TextDocument) {
	let variables = getVariablesInFile(textDocument);
}

export interface Token {
	type: TokenType,
	range: CRange,
	text: string,
	value: string //TODO:? Use other types? e.g. string | ClassObject | Function
}

export enum TokenType {
	VARIABLE,
	STRING,
	FUNC,
	CLASS,
	KEYWORD,
	OPERATOR,
	LABEL,
	ROUTE_LABEL,
	RESOURCE_LABEL,
	MEDIA_LABEL,
	COMMENT
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



let tokens: Token[] = [];
export function getTokenInfo() {
	return tokens;
}
export function getTokenAt(pos: integer) {
	for (const t of tokens) {
		if (t.range.start < pos && t.range.end > pos) {
			return t;
		}
	}
}

export function getVariableTypeFromFunction(textDocument: TextDocument) {
	const text = textDocument.getText();
	const varFunc = /(\w+)[ \t]*=[ \t]*((\w+)\.)?(\w+)\(/g;
	let m: RegExpExecArray | null;
	while (m = varFunc.exec(text)) {
		
	}
}

export function updateTokensForLine(line: integer) {
	
}
function tokenizeDoc(doc: TextDocument) {
	const text = doc.getText();
	const lineTokens: Token[] = [];
	const tokens: Token[] = [];

	// Start with just strings
	const strings: CRange[] = getStrings(doc);
	for (const s of strings) {
		const token: Token = {
			type: TokenType.STRING,
			range: s,
			text: text.substring(s.start,s.end),
			value: text.substring(s.start,s.end)
		}
		tokens.push(token);
	}

	// Then we add comments
	const comments: CRange[] = getComments(doc);
	for (const c of comments) {
		const token: Token = {
			type: TokenType.COMMENT,
			range: c,
			text: text.substring(c.start,c.end),
			value: text.substring(c.start,c.end)
		}
		tokens.push(token);
	}

	// Next we check for keyworks
	const keywords = /(^|\s*)(def|async|on change|await|shared|import|if|else|match|case|yield)(\s*)/gm;
	let m: RegExpExecArray | null;
	while(m = keywords.exec(text)) {
		const kw = m[0].trim();
		const token:Token = {
			type: TokenType.KEYWORD,
			range: {start: m.index, end: m[0].length},
			text: kw,
			value: kw
		}
		tokens.push(token);
	}



}


export function isFunction(line:string,token:string) {
	const start = line.indexOf(token);
	const end = start + token.length;
	// debug(line.substring(end).trim());
	if (line.substring(end).trim().startsWith("(")) {
		// debug("TRUE")
		return true;
	}
	return false;
}

export function isClassMethod(line:string,token:string) {
	const start = line.indexOf(token);
	const end = start + token.length;
	if (isFunction(line,token)) {
		// debug(line.substring(0,start));
		if (line.substring(0,start).trim().endsWith(".")) {
			return true;
		}
	}
	return false;
}
export function getClassOfMethod(line:string,token:string) {
	const start = line.indexOf(token);
	const end = start + token.length;
	line = line.substring(0,start-1);
	const className = /[a-zA-Z_]\w*$/m;
	let m: RegExpExecArray | null;
	while(m = className.exec(line)) {
		const c = m[0];
		//debug(c);
		return c;
	}

}