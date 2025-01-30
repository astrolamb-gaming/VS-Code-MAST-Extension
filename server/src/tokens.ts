import { debug } from 'console';
import { Range, TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import { integer } from 'vscode-languageserver';

export function getAllTokens(textDocument: TextDocument) {

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