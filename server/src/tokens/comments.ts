import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import { integer } from 'vscode-languageserver';
import exp = require('constants');
import { fixFileName } from '../fileFunctions';
import { debug } from 'console';
import { Token } from './tokenBasedExtractor';
import { getCache } from '../cache';
import { LabelInfo } from './labels';


/**
 * TODO:
 * 		Fix comment and string checking for hover
 * 		When switching to another tab, the cache doesn't update
 */

// const commentCache: Map<string,CRange[]> = new Map();
/**
 * Get all comments within the specified {@link TextDocument TextDocument}.
 * @param doc The {@link TextDocument TextDocument}
 * @returns An array of {@link CRange CRange}
 */
// export function getComments(doc: TextDocument): CRange[] {
// 	// for (const f of commentCache.keys()) {
// 	// 	debug(f);
// 	// }
// 	let comments = commentCache.get(fixFileName(doc.uri));
// 	if (comments === undefined) {
// 		comments = parseComments(doc);
// 	}
// 	return comments;
// }
const stringCache: Map<string,CRange[]> = new Map();


export interface CRange {
	start: integer,
	end: integer
}
export function isInComment(doc: TextDocument, loc:integer):boolean {
	return getTokenTypeAtOffset(doc, [], loc) === "comment";
	let commentRanges: CRange[] = []//getComments(doc);
	for (const r in commentRanges) {
		if (commentRanges[r].start <= loc && commentRanges[r].end >= loc) {
			return true;
		}
	}
	return false;
}
// let commentRanges:CRange[] = [];
// let stringRanges: CRange[] = [];
// let yamlRanges: CRange[] = [];
let squareBracketRanges: CRange[] = [];

/**
 * Parses a {@link TextDocument TextDocument} for all square brackets [...] within it.
 * Saves the information in a Map. Use {@link getComments getComments} to retrieve saved info.
 * @param textDocument The {@link TextDocument TextDocument} to parse
 * @returns An array of {@link CRange CRange}
 */
export function parseSquareBrackets(textDocument: TextDocument) {
	const pattern = /\[.*?\]/g;
	const brackets: CRange[] = [];
	let m: RegExpExecArray | null;
	const text = textDocument.getText();
	while (m = pattern.exec(text)) {
		const r: CRange = {
			start: m.index,
			end: m.index + m[0].length + 1
		}
		brackets.push(r);
	}
	squareBracketRanges = brackets;
	return squareBracketRanges;
}

export function isInSquareBrackets(loc:integer): boolean {
	for (const r of squareBracketRanges) {
		if (r.start <= loc && r.end >= loc) {
			return true;
		}
	}
	return false;
}

export function isInString(doc: TextDocument, loc:integer) : boolean {
	return getTokenTypeAtOffset(doc, [], loc) === "string";
	let stringRanges: CRange[] = []// = getStrings(doc);
	for (const r in stringRanges) {
		if (stringRanges[r].start <= loc && stringRanges[r].end >= loc) {
			return true;
		}
	}
	return false;
}

// export function isInYaml(doc: TextDocument, loc:integer): boolean {
// 	let yamlRanges = getYamls(doc);
// 	for (const r in yamlRanges) {
// 		if (yamlRanges[r].start <= loc && yamlRanges[r].end >= loc) {
// 			return true;
// 		}
// 	}
// 	return false;
// }

function mapSemanticTokenTypeToDocumentType(token: Token): string {
	if (token.type === 'comment' || token.type === 'codetag') return 'comment';
	if (token.type === 'string' || token.type === 'stringOption') return 'string';
	if (token.type.includes('yaml')) return 'yaml';
	if (token.type === 'style-definition' || (token.type === 'operator' && (token.text === '[' || token.text === ']'))) return 'square-bracket';
	return token.type;
}

/**
 * Get the most specific token at a given character offset from a pre-tokenized list.
 * If multiple tokens overlap, prefer the smallest token range.
 */
export function getTokenAtOffsetFromTokens(doc: TextDocument, tokens: Token[], offset: integer): Token | undefined {
	if (tokens.length === 0) {
		const cache = getCache(doc.uri);
		tokens = cache.getMastFile(doc.uri)?.tokens || [];
	}
	let best: Token | undefined = undefined;
	let bestLen = Number.MAX_SAFE_INTEGER;
	for (const t of tokens) {
		const start = doc.offsetAt({ line: t.line, character: t.character });
		const end = start + t.length; // end-exclusive
		if (offset >= start && offset < end) {
			if (t.length < bestLen) {
				best = t;
				bestLen = t.length;
			}
		}
	}
	return best;
}

/**
 * Determine the token category at an offset using ONLY tokenized output.
 */
export function getTokenTypeAtOffset(doc: TextDocument, tokens: Token[], offset: integer): string {
	if (tokens.length === 0) {
		const cache = getCache(doc.uri);
		tokens = cache.getMastFile(doc.uri)?.tokens || [];
	}
	const token = getTokenAtOffsetFromTokens(doc, tokens, offset);
	if (!token) return 'code';
	return mapSemanticTokenTypeToDocumentType(token);
}

/**
 * Determine the token category at a line/character position using ONLY tokenized output.
 */
export function getTokenTypeAtPosition(doc: TextDocument, tokens: Token[], position: { line: integer, character: integer }): string {
	
	if (tokens.length === 0) {
		const cache = getCache(doc.uri);
		tokens = cache.getMastFile(doc.uri)?.tokens || [];
	}
	return getTokenTypeAtOffset(doc, tokens, doc.offsetAt(position));
}

export type ObjectRole = 'key' | 'value' | 'unknown';

function normalizeLabelName(name: string): string {
	let n = (name || '').trim();
	if ((n.startsWith('"') && n.endsWith('"')) || (n.startsWith("'") && n.endsWith("'"))) {
		n = n.slice(1, -1).trim();
	}
	return n;
}

function buildLabelNameCandidates(name: string): Set<string> {
	const n = normalizeLabelName(name);
	const candidates = new Set<string>();
	if (!n) {
		return candidates;
	}
	candidates.add(n);
	if (n.startsWith('//')) {
		candidates.add(n.substring(2));
	} else {
		candidates.add(`//${n}`);
	}
	return candidates;
}

function flattenLabels(labels: LabelInfo[]): LabelInfo[] {
	const flat: LabelInfo[] = [];
	const stack = [...labels];
	while (stack.length > 0) {
		const label = stack.pop();
		if (!label) continue;
		flat.push(label);
		if (Array.isArray(label.subLabels) && label.subLabels.length > 0) {
			for (const sub of label.subLabels) {
				stack.push(sub);
			}
		}
	}
	return flat;
}

function isLabelReferenceToken(token: Token): boolean {
	const isLabelType = token.type === 'label' || token.type === 'route-label' || token.type === 'media-label';
	return isLabelType && token.modifier === 'reference';
}

export function getMostRecentLabelReferenceAtOffset(doc: TextDocument, tokens: Token[], offset: integer): Token | undefined {
	if (tokens.length === 0) {
		const cache = getCache(doc.uri);
		tokens = cache.getMastFile(doc.uri)?.tokens || [];
	}

	let mostRecent: Token | undefined = undefined;
	let mostRecentStart = -1;

	for (const t of tokens) {
		if (!isLabelReferenceToken(t)) {
			continue;
		}
		const start = doc.offsetAt({ line: t.line, character: t.character });
		if (start <= offset && start >= mostRecentStart) {
			mostRecent = t;
			mostRecentStart = start;
		}
	}

	return mostRecent;
}

export function getMostRecentLabelReferenceAtPosition(doc: TextDocument, tokens: Token[], position: { line: integer, character: integer }): Token | undefined {
	return getMostRecentLabelReferenceAtOffset(doc, tokens, doc.offsetAt(position));
}

export function getMostRecentLabelInfoAtOffset(doc: TextDocument, tokens: Token[], offset: integer): LabelInfo | undefined {
	const recentRef = getMostRecentLabelReferenceAtOffset(doc, tokens, offset);
	if (!recentRef) {
		return undefined;
	}

	const cache = getCache(doc.uri);
	const candidates = buildLabelNameCandidates(recentRef.text);
	if (candidates.size === 0) {
		return undefined;
	}

	const scoped = flattenLabels(cache.getLabelsAtPos(doc, offset, false));
	for (const label of scoped) {
		if (candidates.has(label.name)) {
			return label;
		}
	}

	const all = flattenLabels(cache.getLabels(doc, false));
	for (const label of all) {
		if (candidates.has(label.name)) {
			return label;
		}
	}

	return undefined;
}

export function getMostRecentLabelInfoAtPosition(doc: TextDocument, tokens: Token[], position: { line: integer, character: integer }): LabelInfo | undefined {
	return getMostRecentLabelInfoAtOffset(doc, tokens, doc.offsetAt(position));
}

function getObjectContextAtOffset(doc: TextDocument, tokens: Token[], offset: integer): {
	inObject: boolean,
	objectRole: ObjectRole,
	objectDepth: integer
} {
	if (tokens.length === 0) {
		const cache = getCache(doc.uri);
		tokens = cache.getMastFile(doc.uri)?.tokens || [];
	}

	const text = doc.getText();
	if (text.length === 0) {
		return { inObject: false, objectRole: 'unknown', objectDepth: 0 };
	}

	const maxOffset = Math.min(Math.max(0, offset), text.length - 1);

	const excludedRanges: Array<{ start: integer, endExclusive: integer }> = [];
	for (const t of tokens) {
		const category = mapSemanticTokenTypeToDocumentType(t);
		if (category !== 'string' && category !== 'comment') {
			continue;
		}
		const start = doc.offsetAt({ line: t.line, character: t.character });
		excludedRanges.push({ start, endExclusive: start + t.length });
	}
	excludedRanges.sort((a, b) => a.start - b.start);

	type ScopeEntry = {
		kind: 'object' | 'array' | 'paren',
		objectRole?: ObjectRole
	};
	const scopeStack: ScopeEntry[] = [];

	let excludedIndex = 0;
	for (let i = 0; i <= maxOffset; i++) {
		while (excludedIndex < excludedRanges.length && excludedRanges[excludedIndex].endExclusive <= i) {
			excludedIndex++;
		}
		if (excludedIndex < excludedRanges.length) {
			const ex = excludedRanges[excludedIndex];
			if (i >= ex.start && i < ex.endExclusive) {
				continue;
			}
		}

		const ch = text[i];
		if (ch === '{') {
			scopeStack.push({ kind: 'object', objectRole: 'key' });
			continue;
		}
		if (ch === '[') {
			scopeStack.push({ kind: 'array' });
			continue;
		}
		if (ch === '(') {
			scopeStack.push({ kind: 'paren' });
			continue;
		}

		if (ch === '}' || ch === ']' || ch === ')') {
			const expected = ch === '}' ? 'object' : ch === ']' ? 'array' : 'paren';
			if (scopeStack.length > 0 && scopeStack[scopeStack.length - 1].kind === expected) {
				scopeStack.pop();
			}
			continue;
		}

		if (scopeStack.length === 0) {
			continue;
		}

		const top = scopeStack[scopeStack.length - 1];
		if (top.kind !== 'object') {
			continue;
		}

		if (ch === ':') {
			top.objectRole = 'value';
			continue;
		}
		if (ch === ',') {
			top.objectRole = 'key';
			continue;
		}
	}

	let objectDepth = 0;
	let objectRole: ObjectRole = 'unknown';
	for (let i = scopeStack.length - 1; i >= 0; i--) {
		if (scopeStack[i].kind === 'object') {
			objectDepth++;
			if (objectRole === 'unknown') {
				objectRole = scopeStack[i].objectRole || 'unknown';
			}
		}
	}

	return {
		inObject: objectDepth > 0,
		objectRole,
		objectDepth
	};
}

export function getTokenContextAtPosition(doc: TextDocument, tokens: Token[], position: { line: integer, character: integer }): {
	type: string,
	inYaml: boolean,
	inComment: boolean,
	inString: boolean,
	inSquareBrackets: boolean,
	inObject: boolean,
	inObjectKey: boolean,
	inObjectValue: boolean,
	objectRole: ObjectRole,
	objectDepth: integer,
	recentLabelReference?: Token,
	recentLabelReferenceName?: string,
	recentLabelInfo?: LabelInfo,
	token?: Token
} {
	const offset = doc.offsetAt(position);
	
	if (tokens.length === 0) {
		const cache = getCache(doc.uri);
		tokens = cache.getMastFile(doc.uri)?.tokens || [];
	}
	const token = getTokenContextAtOffset(doc, tokens, offset);
	return token;
}
/**
 * Utility helper for callers that need all token-derived containment flags at once.
 */
export function getTokenContextAtOffset(doc: TextDocument, tokens: Token[], offset: integer): {
	type: string,
	inYaml: boolean,
	inComment: boolean,
	inString: boolean,
	inSquareBrackets: boolean,
	inObject: boolean,
	inObjectKey: boolean,
	inObjectValue: boolean,
	objectRole: ObjectRole,
	objectDepth: integer,
	recentLabelReference?: Token,
	recentLabelReferenceName?: string,
	recentLabelInfo?: LabelInfo,
	token?: Token
} {
	const token = getTokenAtOffsetFromTokens(doc, tokens, offset);
	const type = token ? mapSemanticTokenTypeToDocumentType(token) : 'code';
	const objectCtx = getObjectContextAtOffset(doc, tokens, offset);
	const recentLabelReference = getMostRecentLabelReferenceAtOffset(doc, tokens, offset);
	const recentLabelInfo = getMostRecentLabelInfoAtOffset(doc, tokens, offset);

	return {
		type,
		inYaml: type === 'yaml',
		inComment: type === 'comment',
		inString: type === 'string',
		inSquareBrackets: type === 'square-bracket',
		inObject: objectCtx.inObject,
		inObjectKey: objectCtx.inObject && objectCtx.objectRole === 'key',
		inObjectValue: objectCtx.inObject && objectCtx.objectRole === 'value',
		objectRole: objectCtx.objectRole,
		objectDepth: objectCtx.objectDepth,
		recentLabelReference,
		recentLabelReferenceName: recentLabelReference?.text,
		recentLabelInfo,
		token
	};
}

export function isTokenTypeAtOffset(doc: TextDocument, tokens: Token[], offset: integer, type: string): boolean {
	return getTokenTypeAtOffset(doc, tokens, offset) === type;
}

/**
 * Should be called whenever the file is updated.
 * Really should be more efficient and add/remove as necessary, but I'm not taking the time to do that yet.
 * TODO: Update this system so that it only checks changed lines, and the surrounding ones if necessary,
 *  and updates the CRanges based on that.
 * @param textDocument 
 */
/**
 * Parses a {@link TextDocument TextDocument} for all comments within it.
 * Saves the information in a Map. Use {@link getComments getComments} to retrieve saved info.
 * @param textDocument The {@link TextDocument TextDocument} to parse
 * @returns An array of {@link CRange CRange}
 */
export function parseComments(textDocument: TextDocument): CRange[] {
	let text = textDocument.getText();
	let strRng:CRange[] = [];
	// strRng = getStrings(textDocument);
	let commentRanges: CRange[] = [];
	let comment = /^[ \t]*(#.*)($|\n)/gm;
	let comments = getMatchesForRegex(comment,text);
	commentRanges = commentRanges.concat(comments);
	for (const f of comments){
		text = replaceRegexMatchWithUnderscore(text,f);
	}
	
	let pattern = /\/\*.*?\*\//gs
	// Gets all the block comments
	let blocks = getMatchesForRegex(pattern,text);
	commentRanges = commentRanges.concat(blocks);
	for (const f of blocks) {
		text = replaceRegexMatchWithUnderscore(text,f);
	}

	let m: RegExpExecArray | null;

	// strRng = stringRanges;//getMatchesForRegex(pattern,text);
	
	//pattern = /\#.*?(\"|$)/gm;
	pattern = /#+[^#\n\r\f]*/g;

	// Not using the more complicated version because there could be an accidental error in the color code.
	//const color: RegExp = /#((([0-9a-fA-F]){6}(([0-9a-fA-F]){2})?)|([0-9a-fA-F]){3,4})(?!\w)/g;
	const color: RegExp = /([^#]|^)#[0-9a-fA-F]{3,8}(?!\w)/gm;

	// We have to account for any # symbol that is used in a string, e.g. the 'invisble' operator
	while (m = pattern.exec(text)) {
		let comment = m[0];
		if (comment.match(color) !== null) {
			//debug("Skipping: " + comment);
			continue;
		} //else { debug("Not skipping " + comment)}

		let inString = false;

		// Now we iterate of strRange, which is all the strings in the file.
		// We're checking to make sure that the start index of the presumed comment is not 
		// within a string. If so, it's not a real comment.
		// E.g. spawn_asteroid("whatever", "asteroid,#", "whatever") has a # inside of a set
		// of double quotes, so it doesn't actually indicate a comment start.
		if (!isInString(textDocument,m.index) && !isInSquareBrackets(m.index)) {
			const r: CRange = {
				start: m.index,
				end: m.index + m[0].length + 1
			}
			commentRanges.push(r);
		} else {
			// Do nothing, with new regex of #+...\#\n it will go to next # in line anyways, if it exists
		}
	}
	// commentCache.set(fixFileName(textDocument.uri), commentRanges);
	return commentRanges;
}

/**
 * Parses a {@link TextDocument TextDocument} for all metadata within it.
 * Saves the information in a Map. Use {@link getYamls getYamls} to retrieve saved info.
 * @param textDocument The {@link TextDocument TextDocument} to parse
 * @returns An array of {@link CRange CRange}
 */
export function parseYamls(textDocument: TextDocument) {
	const text = textDocument.getText();
	let yamls: CRange[] = [];
	let yaml = /```[ \t]*.*?[ \t]*?```/gms;
	yamls = getMatchesForRegex(yaml,text);
	// yamlCache.set(fixFileName(textDocument.uri),yamls);
	return yamls;
}


export function getMatchesForRegex(pattern: RegExp, text: string) {
	let matches: CRange[] = [];
	let m: RegExpExecArray | null;
	while (m = pattern.exec(text)) {
		let comment = m[0];
		//debug(comment);
		const r: CRange = {
			start: m.index,
			end: m.index + m[0].length
		}
		matches.push(r);
	}
	return matches;
}

function log(str:any) {
	fs.writeFileSync('MAST_VSCode_OutputLog.txt', str, {flag: "a+"})
}


export function isTextInBracket(text: string, start: number, target: number): boolean {
    let depth = 0;
    let quote: '"' | "'" | null = null;
    let escaped = false;

    for (let i = start; i < target && i < text.length; i++) {
        const ch = text[i];
        const next = i + 1 < text.length ? text[i + 1] : '';

        if (quote) {
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === quote) {
                quote = null;
            }
            continue;
        }

        if (ch === '"' || ch === "'") {
            quote = ch as '"' | "'";
            continue;
        }

        // f-string escaped braces
        if (ch === '{' && next === '{') { i++; continue; }
        if (ch === '}' && next === '}') { i++; continue; }

        if (ch === '{') depth++;
        else if (ch === '}' && depth > 0) depth--;
    }

    return depth > 0;
}


/**
 * Parses a {@link TextDocument TextDocument} for all strings within it.
 * Saves the information in a Map. Use {@link getStrings getStrings} to retrieve saved info.
 * @param textDocument The {@link TextDocument TextDocument} to parse
 * @returns An array of {@link CRange CRange}
 */
export function parseStrings(textDocument: TextDocument) {
	let text = textDocument.getText();
	let strings: CRange[] = [];
	// TODO: Get all sets of {} to see if we're in an f-string and need to exclude sections of the string
	let strDouble = /(f?\".*?\")|(f?'.*?')/gm;
	// let strDoubleStartOnly = /(^\\s*?(\")[^\"]*?(\\n|$))/gm;
	let caretDouble = /(\^{3,}.*?\^{3,})/gs;
	let multiDouble = /([\"\']{3,}.*?[\"\']{3,})/gs;
	let weighted = /(?:^[ \t]*)(\%\d*|\"[^\"])([^\n\r\f]*)/gms;

	let comment = /^\s*#.*($|\n)/gm;
	let comments = getMatchesForRegex(comment,text);
	for (const f of comments){
		text = replaceRegexMatchWithUnderscore(text,f);
	}


	let brackets = /{.*?}/gm;
	let fstrings = getMatchesForRegex(brackets,text);// f-strings
	let test: CRange[] = [];
	let localStringRanges: CRange[] = [];

	const fstringsOnly: CRange[] = [];

	// We're just going to handle strings within brackets first, then completely ignore everything within brackets.
	for (const f of fstrings) {
		let strs;
		while (strs = strDouble.exec(text.substring(f.start,f.end))) {
			fstringsOnly.push({start:f.start + strs.index,end:f.start + strs.index + strs[0].length});
		}
		text = replaceRegexMatchWithUnderscore(text, f);
	}

// These are all good I think. Commented out the concats for testing
	test = getMatchesForRegex(weighted,text);
	localStringRanges = localStringRanges.concat(test);
	for (const t of test) {
		text = replaceRegexMatchWithUnderscore(text, t);
	}

	test = getMatchesForRegex(multiDouble,text);
	localStringRanges = localStringRanges.concat(test);
	for (const t of test) {
		text = replaceRegexMatchWithUnderscore(text, t);
	}
	test = getMatchesForRegex(caretDouble,text);
	localStringRanges = localStringRanges.concat(test);
	for (const t of test) {
		text = replaceRegexMatchWithUnderscore(text, t);
	}
	
	test = getMatchesForRegex(strDouble,text);
	localStringRanges = localStringRanges.concat(test);
	// Probably don't need this.
	// for (const t of test) {
	// 	text = replaceRegexMatchWithUnderscore(text, t);
	// }

	text = textDocument.getText();
	
	// Now we check for brackets within the strings
	// And TODO: Check for strings within brackets? Did this at the beginning for simplicity
	for (const s of localStringRanges) {
		const str: string = text.substring(s.start,s.end);

		// If it doesn't contain any brackets, we move on.
		if (fstrings.length === 0) {
			strings.push(s);
			continue;
		}
		// Effectively an else statement:
		//debug(fstrings)
		let start = s.start;
		for (const f of fstrings) {
			// Check if the brackets are inside the string.
			if (f.start > s.start && f.end < s.end) {
				const newRange: CRange = {
					start: start,
					end: f.start
				}
				strings.push(newRange);
				start = f.end;
			}
			
			
		}
		const finalRange: CRange = {
			start: start,
			end: s.end
		}
		strings.push(finalRange);
	}

	// Update the global stringRanges variable
	strings = strings.concat(fstringsOnly);
	// stringRanges = strings;
	stringCache.set(fixFileName(textDocument.uri),strings);
	return strings;
}

/**
 * Really just a helper function that gets rid of sections of code that have already been parsed
 * @param text 
 * @param match 
 * @returns 
 */
export function replaceRegexMatchWithUnderscore(text: string, match: CRange) {
	text = text.replace(text.substring(match.start,match.end),"".padEnd(match.end - match.start,"_"));
	return text;
}