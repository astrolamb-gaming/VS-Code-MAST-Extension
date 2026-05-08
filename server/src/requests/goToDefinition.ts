import { integer, Location, Position, Range } from 'vscode-languageserver';
import { fileFromUri, readFile } from '../fileFunctions';
import { getTokenContextAtPosition, getTokenTypeAtOffset, getTokenTypeAtPosition, isInComment, isInString } from '../tokens/comments';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { debug } from 'console';
import { getCurrentLineFromTextDocument, getHoveredSymbol, getHoveredWordRange } from './hover';
import { getCache } from '../cache';
import { URI } from 'vscode-uri';
import { getLabelLocation, getMainLabelAtPos } from '../tokens/labels';
import { asClasses, matchesClassName } from '../data';
import { Variable } from '../tokens/variables';

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

function isMainScopeVariableDefinition(doc: TextDocument, variable: Variable): boolean {
	if (variable.isGlobalScope) {
		return true;
	}
	const cache = getCache(doc.uri);
	const labels = cache.getMastFile(doc.uri)?.labelNames || [];
	const pos = doc.offsetAt(variable.range.start);
	const main = getMainLabelAtPos(pos, labels);
	return (main?.name || '').toLowerCase() === 'main';
}

function resolveVariableDefinition(doc: TextDocument, symbol: string, pos: Position): Location | undefined {
	const cache = getCache(doc.uri);
	const vars = cache.getVariables(doc).filter((v) => v.name === symbol && v.equals !== 'Random Text Option');
	if (vars.length === 0) {
		return undefined;
	}

	const currentOffset = doc.offsetAt(pos);
	const currentScopeLabels = cache.getLabelsAtPos(doc, currentOffset, true);
	const currentMain = getMainLabelAtPos(currentOffset, currentScopeLabels);
	const inMainScope = (currentMain?.name || '').toLowerCase() === 'main';

	// Prefer nearest prior definition in the same local label scope.
	if (!inMainScope && currentMain) {
		const local = vars
			.filter((v) => {
				const defOffset = doc.offsetAt(v.range.start);
				if (defOffset > currentOffset) return false;
				const defMain = getMainLabelAtPos(defOffset, currentScopeLabels);
				return defMain && defMain.start === currentMain.start && (defMain.name || '').toLowerCase() !== 'main';
			})
			.sort((a, b) => doc.offsetAt(b.range.start) - doc.offsetAt(a.range.start));
		if (local.length > 0) {
			return { uri: fileFromUri(doc.uri), range: local[0].range };
		}
	}

	// For global references, prefer variables defined in top-level or ==main==.
	const globalCandidates = vars
		.filter((v) => isMainScopeVariableDefinition(doc, v))
		.sort((a, b) => doc.offsetAt(a.range.start) - doc.offsetAt(b.range.start));
	if (globalCandidates.length > 0) {
		const prior = globalCandidates
			.filter((v) => doc.offsetAt(v.range.start) <= currentOffset)
			.sort((a, b) => doc.offsetAt(b.range.start) - doc.offsetAt(a.range.start));
		const chosen = prior[0] || globalCandidates[0];
		return { uri: fileFromUri(doc.uri), range: chosen.range };
	}

	// If the current file has no global definition, resolve against global
	// variables from other mast files (including imported mast modules).
	const crossFileGlobals: Location[] = [];
	for (const mastFile of cache.mastFileCache.concat(cache.missionMastModules)) {
		for (const v of mastFile.variables || []) {
			if (v.name !== symbol || v.equals === 'Random Text Option' || !v.isGlobalScope) {
				continue;
			}
			crossFileGlobals.push({
				uri: fileFromUri(mastFile.uri),
				range: v.range
			});
		}
	}
	if (crossFileGlobals.length > 0) {
		return crossFileGlobals[0];
	}

	// Fallback: nearest prior definition in file.
	const priorAny = vars
		.filter((v) => doc.offsetAt(v.range.start) <= currentOffset)
		.sort((a, b) => doc.offsetAt(b.range.start) - doc.offsetAt(a.range.start));
	const chosenAny = priorAny[0] || vars[0];
	return { uri: fileFromUri(doc.uri), range: chosenAny.range };
}

function getHoveredStyleReference(str: string, pos: integer): string | undefined {
	const rx = /\$([A-Za-z_]\w*)/g;
	let m: RegExpExecArray | null;
	while ((m = rx.exec(str)) !== null) {
		const start = m.index;
		const end = start + m[0].length;
		if (pos >= start && pos <= end) {
			return m[1];
		}
	}
	return undefined;
}

function getStyleDefinitionLocation(doc: TextDocument, styleName: string): Location | undefined {
	const cache = getCache(doc.uri);
	const mastFile = cache.getMastFile(doc.uri);
	if (!mastFile) {
		return undefined;
	}
	const target = (styleName || '').trim().toLowerCase();
	if (target.length === 0) {
		return undefined;
	}
	const def = (mastFile.styleDefinitions || []).find((entry) => (entry.name || '').toLowerCase() === target);
	if (!def) {
		return undefined;
	}
	return {
		uri: fileFromUri(mastFile.uri || doc.uri),
		range: {
			start: { line: def.line, character: def.character },
			end: { line: def.line, character: def.character + def.length }
		}
	};
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
	const styleRef = getHoveredStyleReference(hoveredLine, pos.character);
	if (styleRef) {
		return getStyleDefinitionLocation(doc, styleRef);
	}
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
				if (!matchesClassName(c.name, className)) continue;
				for (const f of c.methods) {
					if (f.name === symbol) {
						return toFileLocation(f.location);
					}
				}
			}
			for (const p of cache.missionPyModules) {
				for (const c of p.classes) {
					if (!matchesClassName(c.name, className)) continue;
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
			if (matchesClassName(c.name, symbol)) {
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
	if (tokenContext?.token?.type === 'variable' && symbol) {
		const varDef = resolveVariableDefinition(doc, symbol, pos);
		if (varDef) {
			return varDef;
		}
	}
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
		if (matchesClassName(c.name, symbol)) {
			if (c.constructorFunction?.location) {
				return toFileLocation(c.constructorFunction.location);
			}
			return toFileLocation(c.location);
		}
	}

	return undefined;
}
