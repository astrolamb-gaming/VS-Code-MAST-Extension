import { DefinitionParams, Location, Position, Range } from 'vscode-languageserver';
import { fixFileName } from './fileFunctions';
import { isInComment } from './tokens/comments';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { debug } from 'console';

export function onDefinition(params: DefinitionParams): Location | undefined{

	const pos = params.position;
	const uri = fixFileName(params.textDocument.uri)
	const td:TextDocument = TextDocument.create(uri,"text",1,"");
	// debug(isInComment(td, td.offsetAt(pos)));

	
	
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