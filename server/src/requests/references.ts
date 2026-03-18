import { Location, Position, ReferenceParams } from 'vscode-languageserver';
import { getCache } from './../cache';
import { debug } from 'console';
import { getCurrentLineFromTextDocument, getHoveredSymbol } from './hover';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getTokenContextAtPosition, getTokenTypeAtPosition, isInComment, isInString } from './../tokens/comments';
import { fileFromUri } from '../fileFunctions';
import path = require('path');
import { convertWordsToLocations } from '../tokens/words';

export async function onReferences(doc: TextDocument, params:ReferenceParams): Promise<Location[] | undefined> {
	debug("Trying to find word...");
	let locs: Location[] = [];
	const pos: Position = params.position;
	// debug(doc);
	if (doc === undefined) {
		debug("Undefined doc..."); 
		return locs;
	}
	const cache = getCache(doc.uri);
	const tokens = cache.getMastFile(doc.uri)?.tokens || [];
	const tokenContext = getTokenContextAtPosition(doc, tokens, params.position);
	if (!tokenContext.token) {
		debug("No token found at position");
		return undefined;
	}

	// If it's in a comment, or in a string but not in metadata, then return empty
	const isInComment = tokenContext.inComment;
	if (isInComment) return locs;
	// let word = getHoveredSymbol(getCurrentLineFromTextDocument(pos, doc),pos.character);  //getWordRangeAtPosition(doc,pos);
	let word = tokenContext.token?.text || "";
	if (word.startsWith("/")) {
		word = word.substring(1,word.length);
	}
	// Check signals - which can be in a string.
	debug(word);
	let signals = getCache(doc.uri).getSignals();
	for (const s of signals) {
		if (word === s.name) {
			locs = s.emit.concat(s.triggered);
			return locs;
		}
	}

	let blob_keys = getCache(doc.uri).getBlobKeys();
	for (const k of blob_keys) {
		if (k.name === word) {
			locs = convertWordsToLocations([k]);
		}
	}

	let inventory_keys = getCache(doc.uri).getInventoryKeys(doc.uri);
	for (const k of inventory_keys) {
		if (k.name === word) {
			locs = convertWordsToLocations([k]);
		}
	}

	let links = getCache(doc.uri).getLinks();
	for (const l of links) {
		if (l.name === word) {
			locs = convertWordsToLocations([l]);
		}
	}

	let roles = getCache(doc.uri).getRoles(doc.uri);
	for (const r of roles) {
		if (r.name === word) {
			locs = convertWordsToLocations([r]);
		}
	}


	// Get references for labels
	// TODO: Refactor labels to use a similar system as Signals
	// let labels = getCache(doc.uri).getLabels(doc, false);
	// for (const label of labels) {

	// }

	const isInYaml = tokenContext.inYaml;
	const isInString = tokenContext.inString;
	if (isInString && !isInYaml) return locs;

	// Now we'll check for any instance where it COULD be a function name. Because Python.
	let func = getCache(doc.uri).getMethod(word);
	if (func) {
		const loc:Location = func.location;
		loc.uri = fileFromUri(loc.uri);
		locs.push(loc);
	}

	// debug("getWOrdRange")
	
	// debug("Finding: " + word);
	const wordLocs = getCache(params.textDocument.uri).getWordLocations(word);
	for (const loc of wordLocs) {
		locs = locs.concat(loc);
	}
	return locs;
}