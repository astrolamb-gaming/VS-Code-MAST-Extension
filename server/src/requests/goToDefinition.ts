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
import { getCurrentArgumentNames } from './autocompletion';

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
		// First, we'll check if it's a class function
		// Get the class name
		const className = getHoveredSymbol(hoveredLine, s-2);
		debug(className);
		// For now we're only checking mission py files
		// TODO: Implement definitions for the sbs/sbs_utils stuff
		// 		Will need to figure out a way to convert the uri
		// for (const p of getCache(doc.uri).pyFileCache) {//.missionClasses) {
		const classes = getCache(doc.uri).getClasses()
		for (const c of classes) {
			if (c.name === className) {
				for (const f of c.methods) {
					if (f.name === symbol) {
						const loc:Location = f.location;
						loc.uri = fileFromUri(loc.uri);
						return loc;
					}
				}
			}
		}
		for (const p of getCache(doc.uri).missionPyModules) {
			for (const c of p.classes) {
				if (c.name === className) {
					for (const f of c.methods) {
						if (f.name === symbol) {
							const loc:Location = f.location;
							loc.uri = fileFromUri(loc.uri);
							return loc;
						}
					}
				}
			}
		}
		

		for (const c of classes) {
			// debug(c.name);
			if (asClasses.includes(c.name)) continue;
			if (c.name.includes("Route")) continue;
			if (c.name === "event") continue;
			// if (c.name === "sim") continue;
			for (const m of c.methods) {
				// Don't want to include constructors, this is for properties
				if (m.functionType === "constructor") continue;
				if (m.name === symbol) {
					const loc:Location = m.location;
					loc.uri = fileFromUri(loc.uri);
					return loc;
				}
				// // If it's sim, convert back to simulation for this.
				// let className = c.name;
				// for (const cn of replaceNames) {
				// 	if (className === cn[1]) className = cn[0];
				// }
			}
		}
	}
	if (isFunc) {
		// Check if this is a function in a .py file within the current mission.
		for (const p of getCache(doc.uri).pyFileCache) {
			let uri = URI.parse(p.uri).toString()
			for (const f of p.defaultFunctions) {
				if (f.name === symbol) {
					// Now we know which file we need to parse
					// await sendToClient("showFile",uri); // Probably not how to do this, though I'll keep this around for now, just in case.
					const loc:Location = f.location;
					loc.uri = fileFromUri(loc.uri);
					return loc;
				}
			}
		}
		for (const p of getCache(doc.uri).missionPyModules) {
			for (const f of p.defaultFunctions) {
				if (f.name === symbol) {
					const loc:Location = f.location;
					loc.uri = fileFromUri(loc.uri);
					return loc;
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
		const loc:Location = func.location;
		loc.uri = fileFromUri(loc.uri);
		return loc;
	}

	return undefined;
}
