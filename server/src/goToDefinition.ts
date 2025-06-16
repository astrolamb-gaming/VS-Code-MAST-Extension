import { DefinitionParams, integer, Location, Position, Range } from 'vscode-languageserver';
import { fileFromUri, fixFileName, readFile } from './fileFunctions';
import { getComments, isInComment, isInString, isInYaml } from './tokens/comments';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { debug } from 'console';
import { getCurrentLineFromTextDocument, getHoveredSymbol } from './hover';
import { isClassMethod, isFunction } from './tokens/tokens';
import { getCache } from './cache';
import { documents, sendToClient } from './server';
import { URI } from 'vscode-uri';
import { getLabelLocation, getMainLabelAtPos } from './tokens/labels';
import { getVariableNamesInDoc, parseVariables } from './tokens/variables';
import { Function } from './data/function';

export async function onDefinition(doc:TextDocument,pos:Position): Promise<Location | undefined> {
	// parseVariables(doc);
	// return;
	// First, let's check if it's in a comment or string
	// TODO: Check if it's a styestring or blob string, in which case we should open the applicable file?
	if(isInComment(doc,doc.offsetAt(pos)) || isInString(doc,doc.offsetAt(pos))) {
		debug("Is a comment, string, or metadata");
		return undefined;
	}

	const text = doc.getText();

	let hoveredLine = getCurrentLineFromTextDocument(pos, doc);
	debug(hoveredLine);
	const symbol = getHoveredSymbol(hoveredLine, pos.character);
	debug(symbol);
	// Now we determine what type of symbol it is.
	// TODO: Expand on this.
	// NOTE:
	// At this point, we're NOT going to get stuff from sbs or sbs_utils.
	// Even LegendaryMissions can be a later thing.
	// We're going to focus on just stuff within the current mission folder.

	// First, let's check if it has a period in front of it
	const s = hoveredLine.indexOf(symbol);
	const icm = isClassMethod(hoveredLine,symbol);
	const isFunc = isFunction(hoveredLine,symbol);
	// Apparently the given position is based off of the last character
	if (s <= pos.character && pos.character <= s + symbol.length) {
		if (icm) {
			// First, we'll check if it's a class function
			// Get the class name
			const className = getHoveredSymbol(hoveredLine, s-2);
			debug(className);
			// For now we're only checking mission py files
			// TODO: Implement definitions for the sbs/sbs_utils stuff
			// 		Will need to figure out a way to convert the uri
			// for (const p of getCache(doc.uri).pyFileCache) {//.missionClasses) {
			for (const c of getCache(doc.uri).getClasses()) {
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
		let loc = getLabelLocation(symbol, doc, pos);
		debug(loc);
		return loc;
	}

	

	


	
	// let start: Position = {line: pos.line, character: 1}
	// let end: Position = {line: pos.line, character: 5}
	// let range: Range = {
	// 	start: start,
	// 	end: end
	// }
	// let def: Location = {
	// 	uri: doc.uri,
	// 	range: range
	// }
	return undefined;
}

/**
 * Build a location object.
 * @param doc A {@link TextDocument TextDocument}
 * @param start An {@link integer integer} representing the start of the range in the file.
 * @param end An {@link integer integer} representing the end of the range in the file.
 * @returns 
 */
function buildPositionFromIndices(doc:TextDocument, start: integer, end: integer): Location {
	debug(start);
	let startPos: Position = doc.positionAt(start);
	debug(startPos);
	let endPos: Position = doc.positionAt(end);
	let range: Range = {
		start: startPos,
		end: endPos
	}
	let loc: Location = {
		uri: doc.uri,
		range: range
	}
	return loc;
}

async function getFunctionDefinitionLocation(sourceFile:string, searchFor: string): Promise<Location | undefined> {
	

/// TODO: Can't use documents, that's only using OPEN documents. So I'll have to load the file that's needed
	
	const text = await readFile(sourceFile);
	const d: TextDocument = TextDocument.create(sourceFile,"py",1,text);
	let last = text.lastIndexOf(searchFor);
	while (last !== -1) {
		if (text.substring(0,last).trim().endsWith("def")) {
			break;
		}
	}
	if (last === -1) return;
	const range: Range = {
		start: d.positionAt(last),
		end: d.positionAt(last + searchFor.length)
	}
	debug(d.uri);

	const loc: Location = {uri:"file:///" + d.uri,range:range};
	debug("Location found");
	debug(loc);
	return loc;

}