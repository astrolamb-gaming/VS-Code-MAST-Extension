import { DefinitionParams, Location, Position, Range } from 'vscode-languageserver';
import { fixFileName, readFile } from './fileFunctions';
import { getComments, isInComment, isInString, isInYaml } from './tokens/comments';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { debug } from 'console';
import { getCurrentLineFromTextDocument, getHoveredSymbol } from './hover';
import { getWordRangeAtPosition, isClassMethod, isFunction } from './tokens/tokens';
import { getCache } from './cache';
import { documents, sendToClient } from './server';
import { URI } from 'vscode-uri';

export async function onDefinition(doc:TextDocument,pos:Position): Promise<Location | undefined> {

	// First, let's check if it's in a comment or string
	if(isInComment(doc,doc.offsetAt(pos)) || isInString(doc,doc.offsetAt(pos)) || isInYaml(doc,doc.offsetAt(pos))) {
		debug("Is a comment, string, or metadata");
		return undefined;
	}

	const text = doc.getText();
	const str = text.substring(0,doc.offsetAt(pos));
	const lstart = str.lastIndexOf("\n")+1; // The +1 gets rid of the newline character
	const line = str.substring(lstart,str.length);
	debug(line);

	let hoveredLine = getCurrentLineFromTextDocument(pos, doc);
	const symbol = getHoveredSymbol(hoveredLine, pos.character);
	
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
	if (s + symbol.length == pos.character) {
		if (isFunc) {
			// Check if this is a function in a .py file within the current mission.
			for (const p of getCache(doc.uri).pyFileCache) {
				debug("Checking py file: " + p.uri);
				let uri = URI.parse(p.uri).toString()
				debug(uri);
				debug(p.defaultFunctions)
				for (const f of p.defaultFunctions) {
					if (f.name === symbol) {
						// Now we know which file we need to parse
						// await sendToClient("showFile",uri); // Probably not how to do this, though I'll keep this around for now, just in case.
						let loc = await getFunctionDefinitionLocation(f.sourceFile,symbol);
						if (loc !== undefined) return loc;
					}
				}
			}
		}
	}

	

	


	
	let start: Position = {line: pos.line, character: 1}
	let end: Position = {line: pos.line, character: 5}
	let range: Range = {
		start: start,
		end: end
	}
	let def: Location = {
		uri: doc.uri,
		range: range
	}
	return def;
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