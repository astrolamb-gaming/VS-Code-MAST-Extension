import { Location, Position, ReferenceParams } from 'vscode-languageserver';
import { getCache } from './cache';
import { getWordRangeAtPosition } from './tokens/words';
import { documents } from './server';
import { fileFromUri } from './fileFunctions';
import { debug } from 'console';

export function onReferences(params:ReferenceParams): Location[] | undefined {
	let locs: Location[] = [];
	const pos: Position = params.position;
	const doc = documents.get(params.textDocument.uri);
	if (doc === undefined) return [];
	const word = getWordRangeAtPosition(doc,pos);
	debug("Finding: " + word);
	const words = getCache(params.textDocument.uri).getWords();
	for (const w of words) {
		if (w.name !== word) continue;
		let loc: Location = {
			uri: fileFromUri(w.doc),
			range: w.range
		}
		locs.push(loc);
	}
	return locs;
}