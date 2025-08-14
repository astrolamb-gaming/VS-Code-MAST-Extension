import { Location, Position, ReferenceParams } from 'vscode-languageserver';
import { getCache } from './../cache';
import { debug } from 'console';
import { getCurrentLineFromTextDocument, getHoveredSymbol } from './hover';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { isInComment, isInString, isInYaml } from './../tokens/comments';

export async function onReferences(doc: TextDocument, params:ReferenceParams): Promise<Location[] | undefined> {
	debug("Trying to find word...");
	let locs: Location[] = [];
	const pos: Position = params.position;
	// debug(doc);
	if (doc === undefined) {
		debug("Undefined doc..."); 
		return locs;
	}

	// If it's in a comment, or in a string but not in metadata, then return empty
	if (isInComment(doc, doc.offsetAt(pos))) return locs;
	const word = getHoveredSymbol(getCurrentLineFromTextDocument(pos, doc),pos.character);  //getWordRangeAtPosition(doc,pos);
	// Check signals - which can be in a string.
	let signals = getCache(doc.uri).getSignals();
	for (const s of signals) {
		if (word === s.name) {
			locs = s.emit.concat(s.triggered);
			return locs;
		}
	}
	if (isInString(doc,doc.offsetAt(pos)) && !isInYaml(doc,doc.offsetAt(pos))) return locs;
	// debug("getWOrdRange")
	
	// debug("Finding: " + word);
	const wordLocs = getCache(params.textDocument.uri).getWordLocations(word);
	for (const loc of wordLocs) {
		locs = locs.concat(loc);
	}
	return locs;
}