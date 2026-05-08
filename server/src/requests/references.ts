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
import { matchesClassName } from '../data';
import { getMainLabelAtPos } from '../tokens/labels';
import { Variable } from '../tokens/variables';

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
			const isLabelToken = token.type === 'label' || token.type === 'route-label' || token.type === 'media-label';
			// Also include variable tokens — label names can be used as first-class
			// values in expressions, e.g. task_schedule(some_label).
			const isVariableToken = token.type === 'variable';
			// Also include string tokens so quoted label refs are found,
			// e.g. task_schedule("some_label").
			const isStringToken = token.type === 'string' || token.type === 'stringOption';
			if (!isLabelToken && !isVariableToken && !isStringToken) {
				continue;
			}

			if (isStringToken) {
				const normalized = normalizeTokenWord(token.text || '', token.type);
				if (normalized !== name && normalized !== `//${name}`) {
					continue;
				}
			} else {
				if (token.text !== name && token.text !== `//${name}`) {
					continue;
				}
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

	for (const pyFile of cache.pyFileCache.concat(cache.missionPyModules)) {
		for (const token of pyFile.pyTokens || []) {
			const isStringToken = token.type === 'string' || token.type === 'stringOption';
			if (!isStringToken) {
				continue;
			}
			const normalized = normalizeTokenWord(token.text || '', token.type);
			if (normalized !== name && normalized !== `//${name}`) {
				continue;
			}
			locs.push({
				uri: fileFromUri(pyFile.uri),
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

function getClassSymbolLocations(doc: TextDocument, className: string): Location[] {
	const cache = getCache(doc.uri);
	const locs: Location[] = [];

	for (const c of cache.getClasses()) {
		if (matchesClassName(c.name, className)) {
			if (c.constructorFunction?.location) {
				locs.push({ uri: fileFromUri(c.constructorFunction.location.uri), range: c.constructorFunction.location.range });
			}
			locs.push({ uri: fileFromUri(c.location.uri), range: c.location.range });
		}
	}

	const mastFiles = cache.mastFileCache.concat(cache.missionMastModules);
	for (const mastFile of mastFiles) {
		for (const token of mastFile.tokens) {
			if (token.text !== className) continue;
			if (token.type !== 'function' && token.type !== 'class' && token.type !== 'variable' && token.type !== 'method') continue;
			locs.push({
				uri: fileFromUri(mastFile.uri),
				range: {
					start: { line: token.line, character: token.character },
					end: { line: token.line, character: token.character + token.length }
				}
			});
		}
	}

	const pyFiles = cache.pyFileCache.concat(cache.missionPyModules);
	for (const pyFile of pyFiles) {
		for (const token of pyFile.pyTokens || []) {
			if (!matchesClassName(token.text, className)) continue;
			if (token.type !== 'function' && token.type !== 'class' && token.type !== 'variable' && token.type !== 'method') continue;
			locs.push({
				uri: fileFromUri(pyFile.uri),
				range: {
					start: { line: token.line, character: token.character },
					end: { line: token.line, character: token.character + token.length }
				}
			});
		}
	}

	return dedupeLocations(locs);
}

function getTokenContextNearPosition(doc: TextDocument, tokens: any[], position: Position) {
	let ctx = getTokenContextAtPosition(doc, tokens, position);
	const isBoundaryOperator = (c: any) => {
		if (!c?.token) return false;
		if (c.token.type !== 'operator') return false;
		return c.token.text === ')' || c.token.text === '(' || c.token.text === ',' || c.token.text === ':';
	};

	if (ctx.token && !isBoundaryOperator(ctx)) {
		return ctx;
	}

	if (position.character > 0) {
		const prevCtx = getTokenContextAtPosition(doc, tokens, { line: position.line, character: position.character - 1 });
		if (prevCtx.token && !isBoundaryOperator(prevCtx)) {
			return prevCtx;
		}
		if (ctx.token) {
			return ctx;
		}
		ctx = prevCtx;
	}

	return ctx;
}

function getHoveredStyleReference(str: string, pos: number): string | undefined {
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

function getStyleReferenceLocations(doc: TextDocument, styleName: string, includeDeclaration: boolean): Location[] {
	const cache = getCache(doc.uri);
	const target = (styleName || '').trim().toLowerCase();
	if (target.length === 0) {
		return [];
	}

	const locs: Location[] = [];
	const mastFiles = cache.mastFileCache.concat(cache.missionMastModules);
	for (const mastFile of mastFiles) {
		const text = mastFile.lastText;
		if (!text || text.length === 0) {
			continue;
		}

		const textDoc = TextDocument.create(mastFile.uri, 'mast', 1, text);
		const lines = text.split(/\r?\n/);
		for (let lineNum = 0; lineNum < lines.length; lineNum++) {
			const line = lines[lineNum];
			const declMatch = line.match(/^\s*=\$([A-Za-z_]\w*)\b/);
			const declStart = declMatch ? line.indexOf(`$${declMatch[1]}`) : -1;

			const rx = /\$([A-Za-z_]\w*)/g;
			let m: RegExpExecArray | null;
			while ((m = rx.exec(line)) !== null) {
				if ((m[1] || '').toLowerCase() !== target) {
					continue;
				}
				const isDeclaration = declMatch !== null && m.index === declStart;
				if (!includeDeclaration && isDeclaration) {
					continue;
				}
				const start = { line: lineNum, character: m.index };
				const end = { line: lineNum, character: m.index + m[0].length };
				locs.push({
					uri: fileFromUri(textDoc.uri),
					range: { start, end }
				});
			}
		}
	}

	return dedupeLocations(locs);
}

function isBlobAccessorSetGetCall(tokens: any[], position: Position, doc: TextDocument): boolean {
	const isBlobLikeAccessorName = (name: string): boolean => {
		const n = (name || '').toLowerCase();
		return n === 'data_set' || n.includes('blob') || n.includes('data_set');
	};

	if (!tokens || tokens.length === 0) {
		return false;
	}

	const targetOffset = doc.offsetAt(position);
	let tokenAtCursor = -1;
	for (let i = tokens.length - 1; i >= 0; i--) {
		const tok = tokens[i];
		const tokOffset = doc.offsetAt({ line: tok.line, character: tok.character });
		if (tokOffset <= targetOffset) {
			tokenAtCursor = i;
			break;
		}
	}

	if (tokenAtCursor === -1) {
		return false;
	}

	let parenDepth = 0;
	let openParenIndex = -1;
	for (let i = tokenAtCursor; i >= 0; i--) {
		const tok = tokens[i];
		if (tok.type !== 'operator') {
			continue;
		}
		if (tok.text === ')') {
			parenDepth++;
			continue;
		}
		if (tok.text === '(') {
			if (parenDepth === 0) {
				openParenIndex = i;
				break;
			}
			parenDepth--;
		}
	}

	if (openParenIndex <= 0) {
		return false;
	}

	let callableIndex = -1;
	for (let i = openParenIndex - 1; i >= 0; i--) {
		const tok = tokens[i];
		if (tok.type === 'function' || tok.type === 'method') {
			callableIndex = i;
			break;
		}
		if (tok.type === 'operator' && tok.text === '.') {
			continue;
		}
		if (tok.type === 'property' || tok.type === 'variable') {
			continue;
		}
		break;
	}

	if (callableIndex === -1) {
		return false;
	}

	const callableName = (tokens[callableIndex].text || '').toLowerCase();
	if (callableName !== 'set' && callableName !== 'get') {
		return false;
	}

	for (let i = callableIndex - 1; i >= 0; i--) {
		const tok = tokens[i];
		if (tok.type === 'operator') {
			if (tok.text === '.') {
				continue;
			}
			break;
		}
		if (tok.type === 'property' || tok.type === 'variable' || tok.type === 'function' || tok.type === 'method') {
			const name = (tok.text || '').toLowerCase();
			if (isBlobLikeAccessorName(name)) {
				return true;
			}
			continue;
		}
		break;
	}

	return false;
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

function hasMainVariableDefinition(doc: TextDocument, name: string): boolean {
	const cache = getCache(doc.uri);

	// Treat definitions parsed in ==main== as global, regardless of file.
	for (const mastFile of cache.mastFileCache.concat(cache.missionMastModules)) {
		for (const v of mastFile.variables || []) {
			if (v.name !== name || v.equals === 'Random Text Option') {
				continue;
			}
			if (v.isGlobalScope || isMainScopeVariableDefinition(doc, v)) {
				return true;
			}
		}
	}
	return false;
}

function getVariableLocations(doc: TextDocument, name: string, includeDeclaration: boolean): Location[] {
	const cache = getCache(doc.uri);
	const locs: Location[] = [];

	// Variable references are semantic tokens, so scan each mast file token stream
	// and include exact-name matches for variable tokens.
	for (const mastFile of cache.mastFileCache.concat(cache.missionMastModules)) {
		for (const token of mastFile.tokens || []) {
			if (token.type !== 'variable' || token.text !== name) {
				continue;
			}
			if (!includeDeclaration && token.modifier === 'definition') {
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

function getWordAtCursorInCommaSeparatedStringToken(token: any, position: Position): string {
	const raw = (token?.text || '').trim();
	if (!raw) {
		return '';
	}

	let prefixLen = 0;
	while (prefixLen < raw.length && /[furbFURB]/.test(raw[prefixLen])) {
		prefixLen++;
	}

	let contentStart = 0;
	let contentEnd = raw.length;
	const rest = raw.substring(prefixLen);

	if (rest.startsWith('"""') && raw.endsWith('"""') && raw.length >= prefixLen + 6) {
		contentStart = prefixLen + 3;
		contentEnd = raw.length - 3;
	} else if (rest.startsWith("'''") && raw.endsWith("'''") && raw.length >= prefixLen + 6) {
		contentStart = prefixLen + 3;
		contentEnd = raw.length - 3;
	} else if ((rest.startsWith('"') && raw.endsWith('"')) || (rest.startsWith("'") && raw.endsWith("'"))) {
		contentStart = prefixLen + 1;
		contentEnd = raw.length - 1;
	}

	if (contentEnd <= contentStart) {
		return '';
	}

	const cursorInToken = position.character - token.character;
	const clampedCursor = Math.max(contentStart, Math.min(contentEnd - 1, cursorInToken));
	const content = raw.substring(contentStart, contentEnd);
	const cursorInContent = clampedCursor - contentStart;

	let segmentStart = 0;
	while (segmentStart <= content.length) {
		let segmentEnd = content.indexOf(',', segmentStart);
		if (segmentEnd === -1) {
			segmentEnd = content.length;
		}

		if (cursorInContent >= segmentStart && cursorInContent <= segmentEnd) {
			const segment = content.substring(segmentStart, segmentEnd).trim();
			return segment;
		}

		if (segmentEnd === content.length) {
			break;
		}

		segmentStart = segmentEnd + 1;
	}

	return content.trim();
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
		const styleRef = getHoveredStyleReference(line, params.position.character);
		if (styleRef) {
			return getStyleReferenceLocations(doc, styleRef, params.context?.includeDeclaration ?? true);
		}
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
	const styleRef = getHoveredStyleReference(getCurrentLineFromTextDocument(params.position, doc), params.position.character)
		|| (token.type === 'style-definition' ? word.replace(/^\$/, '') : undefined);
	if (styleRef) {
		return getStyleReferenceLocations(doc, styleRef, params.context?.includeDeclaration ?? true);
	}

	// Label-ish tokens should resolve against labels directly.
	// Exception: route-label tokens that are signal paths (shared/signal/... or signal/...)
	// should resolve via the signal cache to include both emit and triggered locations.
	if (token.type === 'route-label') {
		const sigMatch = word.match(/^(?:shared\/)?signal\/([\w\/]+)$/);
		if (sigMatch) {
			const signalName = sigMatch[1].replace(/\//g, '_');
			for (const s of cache.getSignals()) {
				if (s.name === signalName) {
					return dedupeLocations(s.emit.concat(s.triggered));
				}
			}
		}
		return getLabelLocations(doc, word);
	}
	if (token.type === 'label' || token.type === 'media-label') {
		return getLabelLocations(doc, word);
	}

	// Constructor/class symbol references, e.g. Vec3()
	const classLocs = getClassSymbolLocations(doc, word);
	if (classLocs.length > 0) {
		return classLocs;
	}

	// A variable token whose name matches a known label should also resolve
	// to label references (label names can be used as first-class values,
	// e.g. task_schedule(some_label)).
	if (token.type === 'variable') {
		// Variables defined under ==main== are treated as global and should
		// return references across mast files.
		if (hasMainVariableDefinition(doc, word)) {
			return getVariableLocations(doc, word, params.context?.includeDeclaration ?? true);
		}

		const labelLocs = getLabelLocations(doc, word);
		if (labelLocs.length > 0) {
			return labelLocs;
		}
	}

	// If inside string, decide target type from call context (like autocomplete)
	if (tokenContext.inString) {
		const callContext = getCallContextFromTokens(tokens as any, params.position, doc);
		const funcName = callContext?.functionName.toLowerCase() || '';
		const inBlobAccessorSetGet = isBlobAccessorSetGetCall(tokens as any, params.position, doc);
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
			const roleSearchWords = new Set<string>();
			const tokenWord = getWordAtCursorInCommaSeparatedStringToken(token, params.position);
			if (tokenWord) {
				roleSearchWords.add(tokenWord.toLowerCase());
			} else if (word) {
				for (const part of word.split(',')) {
					const candidate = part.trim().toLowerCase();
					if (candidate) {
						roleSearchWords.add(candidate);
					}
				}
			}
			const roles = cache.getRoles(doc.uri).filter(r => roleSearchWords.has(r.name.toLowerCase()));
			if (roles.length > 0) return dedupeLocations(convertWordsToLocations(roles));
		}

		if (paramName.includes('inventory') || funcName.includes('inventory')) {
			const keys = cache.getInventoryKeys(doc.uri).filter(k => k.name === word);
			if (keys.length > 0) return dedupeLocations(convertWordsToLocations(keys));
		}

		if (inBlobAccessorSetGet || paramName.includes('blob') || paramName === 'data' || funcName.includes('blob') || funcName.includes('data_set')) {
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

	const fallbackClassLocs = getClassSymbolLocations(doc, word);
	if (fallbackClassLocs.length > 0) {
		locs.push(...fallbackClassLocs);
	}

	for (const loc of cache.getWordLocations(word)) {
		locs.push(loc);
	}

	return dedupeLocations(locs);
}