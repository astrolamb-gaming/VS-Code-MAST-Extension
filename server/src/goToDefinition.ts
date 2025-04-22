import { DefinitionParams, Location, Position, Range } from 'vscode-languageserver';

export function onDefinition(params: DefinitionParams): Location {
	
	let start: Position = {line: 1, character: 1}
	let end: Position = {line: 1, character: 5}
	let range: Range = {
		start: start,
		end: end
	}
	let def: Location = {
		uri: params.textDocument.uri,
		range: range
	}
	return def;
}