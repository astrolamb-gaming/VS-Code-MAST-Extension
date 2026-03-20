import { Location, Position, ReferenceParams } from 'vscode-languageserver';
import { getCache } from './../cache';
import { debug } from 'console';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getTokenContextAtPosition } from './../tokens/comments';
import { fileFromUri } from '../fileFunctions';
import { convertWordsToLocations } from '../tokens/words';
import { getCallContextFromTokens } from './signatureHelp';
import { LabelInfo } from '../tokens/labels';
import { getCurrentLineFromTextDocument, getHoveredSymbol } from './hover';

function dedupeLocations(locs: Location[]): Location[] {
	const map = new Map<string, Location>();
	for (const loc of locs) {
		const key = `${loc.uri}:${loc.range.start.line}:${loc.range.start.character}:${loc.range.end.line}:${loc.range.end.character}`;
		if (!map.has(key)) {
			map.set(key, loc);
		}
	}
	return [...map.values()];
}

function normalizeTokenWord(tokenText: string, tokenType: string): string {
	let word = tokenText.trim();

	if (tokenType === 'string' || tokenType === 'stringOption') {
		word = word.replace(/^[furbFURB]+(?=["'])/, '');
		if ((word.startsWith('"""') && word.endsWith('"""')) || (word.startsWith("'''") && word.endsWith("'''"))) {
			word = word.slice(3, -3);
		} else {
			if (word.startsWith('"') || word.startsWith("'")) word = word.slice(1);
			if (word.endsWith('"') || word.endsWith("'")) word = word.slice(0, -1);
		}
	}

	if (word.startsWith('//')) {
		word = word.substring(2);
	}

	return word.trim();
}

function flattenLabels(labels: LabelInfo[]): LabelInfo[] {
	const ret: LabelInfo[] = [];
	for (const label of labels) {
		ret.push(label);
		ret.push(...label.subLabels);
	}
	return ret;
}

function getLabelLocations(doc: TextDocument, name: string): Location[] {
	const cache = getCache(doc.uri);
	const labels = flattenLabels(cache.getLabels(doc, false));
	const names = new Set([name, `//${name}`]);
	const locs: Location[] = [];

	for (const label of labels) {
		if (names.has(label.name)) {
			locs.push({
				uri: fileFromUri(label.srcFile),
				range: label.range
			});
		}
	}

	for (const mastFile of cache.mastFileCache.concat(cache.missionMastModules)) {
		for (const token of mastFile.tokens) {
			if (token.type !== 'label' && token.type !== 'route-label' && token.type !== 'media-label') {
				continue;
			}
			if (token.text !== name && token.text !== `//${name}`) {
				continue;
			}
			locs.push({
				uri: fileFromUri(mastFile.uri),
				range: {
					start: { line: token.line, character: token.character },
					end: { line: token.line, character: token.character + token.length }
				}
			});
		}
	}

	return dedupeLocations(locs);
}

function collectWordLocationsAcrossCategories(doc: TextDocument, word: string): Location[] {
	const cache = getCache(doc.uri);
	let locs: Location[] = [];

	const lower = word.toLowerCase();

	const matchingRoles = cache.getRoles(doc.uri).filter(r => r.name.toLowerCase() === lower);
	if (matchingRoles.length > 0) {
		locs = locs.concat(convertWordsToLocations(matchingRoles));
	}

	const matchingInventory = cache.getInventoryKeys(doc.uri).filter(k => k.name === word);
	if (matchingInventory.length > 0) {
		locs = locs.concat(convertWordsToLocations(matchingInventory));
	}

	const matchingBlob = cache.getBlobKeys().filter(k => k.name === word);
	if (matchingBlob.length > 0) {
		locs = locs.concat(convertWordsToLocations(matchingBlob));
	}

	const matchingLinks = cache.getLinks().filter(l => l.name === word);
	if (matchingLinks.length > 0) {
		locs = locs.concat(convertWordsToLocations(matchingLinks));
	}

	for (const s of cache.getSignals()) {
		if (s.name === word) {
			locs = locs.concat(s.emit).concat(s.triggered);
		}
	}

	return dedupeLocations(locs);
}

function getTokenContextNearPosition(doc: TextDocument, tokens: any[], position: Position) {
	let ctx = getTokenContextAtPosition(doc, tokens, position);
	if (ctx.token) {
		return ctx;
	}

	if (position.character > 0) {
		ctx = getTokenContextAtPosition(doc, tokens, { line: position.line, character: position.character - 1 });
		if (ctx.token) {
			return ctx;
		}
	}

	return ctx;
}

export async function onReferences(doc: TextDocument, params:ReferenceParams): Promise<Location[] | undefined> {
	debug("Trying to find word...");
	const locs: Location[] = [];
	if (doc === undefined) {
		debug("Undefined doc..."); 
		return locs;
	}

	const cache = getCache(doc.uri);
	const tokens = cache.getMastFile(doc.uri)?.tokens || [];
	const tokenContext = getTokenContextNearPosition(doc, tokens, params.position);
	if (!tokenContext.token) {
		debug("No token found at position, using hovered-symbol fallback");
		const line = getCurrentLineFromTextDocument(params.position, doc);
		const fallbackWord = (getHoveredSymbol(line, params.position.character) || '').trim();
		if (!fallbackWord) {
			return locs;
		}

		let ret = getLabelLocations(doc, fallbackWord);
		if (ret.length > 0) {
			return ret;
		}

		ret = collectWordLocationsAcrossCategories(doc, fallbackWord);
		if (ret.length > 0) {
			return ret;
		}

		const method = cache.getMethod(fallbackWord);
		if (method) {
			const loc: Location = method.location;
			loc.uri = fileFromUri(loc.uri);
			ret.push(loc);
		}

		for (const loc of cache.getWordLocations(fallbackWord)) {
			ret.push(loc);
		}

		return dedupeLocations(ret);
	}

	if (tokenContext.inComment) {
		return locs;
	}

	const token = tokenContext.token;
	const word = normalizeTokenWord(token.text || '', token.type);
	if (!word) {
		return locs;
	}

	debug(word);

	// Label-ish tokens should resolve against labels directly.
	if (token.type === 'label' || token.type === 'route-label' || token.type === 'media-label') {
		return getLabelLocations(doc, word);
	}

	// If inside string, decide target type from call context (like autocomplete)
	if (tokenContext.inString) {
		const callContext = getCallContextFromTokens(tokens as any, params.position, doc);
		const funcName = callContext?.functionName.toLowerCase() || '';
		let paramName = '';
		if (callContext) {
			const method = cache.getMethod(callContext.functionName);
			if (method && callContext.parameterIndex < method.parameters.length) {
				paramName = (method.parameters[callContext.parameterIndex].name || '').toLowerCase();
			}
		}

		if (funcName === 'signal_emit' || paramName.includes('signal')) {
			for (const s of cache.getSignals()) {
				if (s.name === word) {
					return dedupeLocations(s.emit.concat(s.triggered));
				}
			}
		}

		if (paramName === 'label' || paramName === 'path' || paramName === 'on_press' || funcName.includes('jump')) {
			return getLabelLocations(doc, word);
		}

		if (paramName.includes('role') || funcName.includes('role')) {
			const roles = cache.getRoles(doc.uri).filter(r => r.name.toLowerCase() === word.toLowerCase());
			if (roles.length > 0) return dedupeLocations(convertWordsToLocations(roles));
		}

		if (paramName.includes('inventory') || funcName.includes('inventory')) {
			const keys = cache.getInventoryKeys(doc.uri).filter(k => k.name === word);
			if (keys.length > 0) return dedupeLocations(convertWordsToLocations(keys));
		}

		if (paramName.includes('blob') || paramName === 'data' || funcName.includes('blob') || funcName.includes('data_set')) {
			const keys = cache.getBlobKeys().filter(k => k.name === word);
			if (keys.length > 0) return dedupeLocations(convertWordsToLocations(keys));
		}

		if (paramName.includes('link') || funcName.includes('link')) {
			const links = cache.getLinks().filter(l => l.name === word);
			if (links.length > 0) return dedupeLocations(convertWordsToLocations(links));
		}

		// In regular strings we avoid broad fallbacks.
		if (!tokenContext.inYaml) {
			return locs;
		}
	}

	// Non-string fallback: method definition + textual locations
	const method = cache.getMethod(word);
	if (method) {
		const loc: Location = method.location;
		loc.uri = fileFromUri(loc.uri);
		locs.push(loc);
	}

	for (const loc of cache.getWordLocations(word)) {
		locs.push(loc);
	}

	return dedupeLocations(locs);
}