import { integer, Location, Position, Range } from 'vscode-languageserver';
import { fileFromUri, readFile } from '../fileFunctions';
import { getTokenContextAtPosition, getTokenTypeAtOffset, getTokenTypeAtPosition, isInComment, isInString } from '../tokens/comments';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { debug } from 'console';
import { getCurrentLineFromTextDocument, getHoveredSymbol, getHoveredWordRange } from './hover';
import { getCache } from '../cache';
import { URI } from 'vscode-uri';
import { getLabelLocation } from '../tokens/labels';
import { asClasses } from '../data';

function toFileLocation(loc: Location): Location {
	return {
		uri: fileFromUri(loc.uri),
		range: loc.range
	};
}

function isCandidateClass(name: string): boolean {
	if (asClasses.includes(name)) return false;
	if (name.includes('Route')) return false;
	if (name === 'event') return false;
	return true;
}

function collectMethodCandidates(docUri: string, methodName: string): Location[] {
	const cache = getCache(docUri);
	const seen = new Set<string>();
	const ret: Location[] = [];

	const addLoc = (loc: Location | undefined) => {
		if (!loc) return;
		const key = `${loc.uri}:${loc.range.start.line}:${loc.range.start.character}:${loc.range.end.line}:${loc.range.end.character}`;
		if (seen.has(key)) return;
		seen.add(key);
		ret.push(toFileLocation(loc));
	};

	for (const c of cache.getClasses()) {
		if (!isCandidateClass(c.name)) continue;
		for (const m of c.methods) {
			if (m.functionType === 'constructor') continue;
			if (m.name === methodName) {
				addLoc(m.location);
			}
		}
	}

	for (const p of cache.missionPyModules) {
		for (const c of p.classes) {
			if (!isCandidateClass(c.name)) continue;
			for (const m of c.methods) {
				if (m.functionType === 'constructor') continue;
				if (m.name === methodName) {
					addLoc(m.location);
				}
			}
		}
	}

	return ret;
}

export async function onDefinition(doc:TextDocument,pos:Position): Promise<Location | undefined> {
	// parseVariables(doc);
	// return;
	const cache = getCache(doc.uri);
	const isMastDoc = doc.languageId === 'mast';
	const tokens = isMastDoc ? (cache.getMastFile(doc.uri)?.tokens || []) : [];
	const tokenContext = isMastDoc ? getTokenContextAtPosition(doc, tokens, pos) : undefined;
	if (isMastDoc && !tokenContext?.token) {
		debug("No token found at position");
		return undefined;
	}
	const isInComment = tokenContext?.inComment || false;
	const isInString = tokenContext?.inString || false;
	
	// First, let's check if it's in a comment or string
	// TODO: Check if it's a styestring or blob string, in which case we should open the applicable file?
	if(isInComment) {
		debug("Is a comment, string, or metadata");
		return undefined;
	}

	const text = doc.getText();

	let hoveredLine = getCurrentLineFromTextDocument(pos, doc);
	debug(hoveredLine);
	const range = getHoveredWordRange(hoveredLine, pos.character);
	// const symbol = hoveredLine.substring(range.start,range.end);
	const symbol = tokenContext?.token?.text || hoveredLine.substring(range.start,range.end);
	debug(symbol);

	// For quoted label references, allow lookup from both mast and python files.
	if (isInString || !isMastDoc) {
		const labelLoc = getLabelLocation(symbol, doc, pos);
		if (labelLoc) {
			return labelLoc;
		}
		if (!isMastDoc) {
			return undefined;
		}
	}
	// Now we determine what type of symbol it is.
	// TODO: Expand on this.
	// NOTE:
	// At this point, we're NOT going to get stuff from sbs or sbs_utils.
	// Even LegendaryMissions can be a later thing.
	// We're going to focus on just stuff within the current mission folder.

	// First, let's check if it has a period in front of it
	const s = tokenContext?.token?.character || 0;//hoveredLine.indexOf(symbol);
	// const icm = isClassMethod(hoveredLine,pos.character);
	const icm = tokenContext?.type === "method";
	debug("Is class method: " + icm);
	// const isFunc = isFunction(hoveredLine,symbol);
	const isFunc = tokenContext?.type === "function" || icm
	// Apparently the given position is based off of the last character
	// if (s <= pos.character && pos.character <= s + symbol.length) {
	if (icm) {
		// First, try exact class resolution from the token context line.
		const className = s >= 2 ? getHoveredSymbol(hoveredLine, s - 2) : '';
		debug(className);
		const cache = getCache(doc.uri);

		if (className) {
			for (const c of cache.getClasses()) {
				if (c.name !== className) continue;
				for (const f of c.methods) {
					if (f.name === symbol) {
						return toFileLocation(f.location);
					}
				}
			}
			for (const p of cache.missionPyModules) {
				for (const c of p.classes) {
					if (c.name !== className) continue;
					for (const f of c.methods) {
						if (f.name === symbol) {
							return toFileLocation(f.location);
						}
					}
				}
			}
		}

		// If class extraction failed or no exact class match, only return when unambiguous.
		const candidates = collectMethodCandidates(doc.uri, symbol);
		if (candidates.length === 1) {
			return candidates[0];
		}
		if (candidates.length > 1) {
			debug(`Ambiguous method definition for '${symbol}' (${candidates.length} candidates), skipping.`);
		}
		return undefined;
	}
	if (isFunc) {
		// Constructor/class call, e.g. Vec3()
		for (const c of getCache(doc.uri).getClasses()) {
			if (c.name === symbol) {
				if (c.constructorFunction?.location) {
					return toFileLocation(c.constructorFunction.location);
				}
				return toFileLocation(c.location);
			}
		}

		// Check if this is a function in a .py file within the current mission.
		for (const p of getCache(doc.uri).pyFileCache) {
			let uri = URI.parse(p.uri).toString()
			for (const f of p.defaultFunctions) {
				if (f.name === symbol) {
					// Now we know which file we need to parse
					// await sendToClient("showFile",uri); // Probably not how to do this, though I'll keep this around for now, just in case.
					return toFileLocation(f.location);
				}
			}
		}
		for (const p of getCache(doc.uri).missionPyModules) {
			for (const f of p.defaultFunctions) {
				if (f.name === symbol) {
					return toFileLocation(f.location);
				}
			}
		}
	}
	debug(symbol);
	let loc = getLabelLocation(symbol, doc, pos);
	debug(loc);
	if (loc) return loc;

	// Now we'll check for any instance where it COULD be a function name. Because Python.
	let func = getCache(doc.uri).getMethod(symbol);
	if (func) {
		return toFileLocation(func.location);
	}

	// Constructor/class fallback when token classification does not identify callable type.
	for (const c of getCache(doc.uri).getClasses()) {
		if (c.name === symbol) {
			if (c.constructorFunction?.location) {
				return toFileLocation(c.constructorFunction.location);
			}
			return toFileLocation(c.location);
		}
	}

	return undefined;
}
