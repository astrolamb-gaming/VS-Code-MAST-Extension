import { Location, Position, ReferenceParams } from 'vscode-languageserver';
import { getCache } from './cache';
import { getWordRangeAtPosition } from './tokens/words';
import { documents } from './server';
import { fileFromUri } from './fileFunctions';
import { debug } from 'console';

export async function onReferences(params:ReferenceParams): Promise<Location[] | undefined> {
	debug("Trying to find word...");
	let locs: Location[] = [];
	const pos: Position = params.position;
	const doc = documents.get(params.textDocument.uri);
	if (doc === undefined) {
		debug("Undefined doc..."); 
		return [];
	}
	const word = getWordRangeAtPosition(doc,pos);
	debug("Finding: " + word);
	const wordLocs = getCache(params.textDocument.uri).getWordLocations(word);
	for (const loc of wordLocs) {
		locs = locs.concat(loc);
	}
	return locs;
}