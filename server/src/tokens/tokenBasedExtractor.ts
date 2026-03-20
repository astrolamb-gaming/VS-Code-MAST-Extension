import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range, Location } from 'vscode-languageserver';
import { fileFromUri } from '../fileFunctions';
import { Word } from './words';
import { SignalInfo } from './signals';
import { debug } from 'console';

/**
 * Token-based string extractor that works with lexer output
 * Much more efficient than regex-based extraction
 */

export interface Token {
	type: string;
	text: string;
	line: number;
	character: number;
	length: number;
	modifier?: string;
}

export interface ExtractedStrings {
	roles: Word[];
	signals: SignalInfo[];
	inventoryKeys: Word[];
	blobKeys: Word[];
	links: Word[];
}

interface DocumentedKeyTag {
	keyType: string;
	name: string;
	description: string;
	line: number;
	character: number;
	length: number;
}

/**
 * Token-based string extractor
 * Uses pre-tokenized output from lexers for efficient extraction
 */
export class TokenBasedExtractor {
	private doc: TextDocument;
	private tokens: Token[];
	private documentedKeyTags: DocumentedKeyTag[] | null = null;

	private isCallableToken(token: Token): boolean {
		return token.type === 'function' || token.type === 'method';
	}

	constructor(document: TextDocument, tokens: Token[]) {
		this.doc = document;
		this.tokens = tokens;
	}

	/**
	 * Extract all MAST framework strings from tokenized code
	 */
	public extractAll(): ExtractedStrings {
		return {
			roles: this.extractRoles(),
			signals: this.extractSignals(),
			inventoryKeys: this.extractInventoryKeys(),
			blobKeys: this.extractBlobKeys(),
			links: this.extractLinks()
		};
	}

	/**
	 * Extract role strings by finding add_role/has_role function calls
	 */
	public extractRoles(): Word[] {
		return this.mergeWords([
			...this.extractStringsByFunctionKeywords(['role'], {
				normalizeCase: true,
				allowCommaSeparated: true
			}),
			...this.extractDocumentedWords(['role'], {
				normalizeCase: true,
				allowCommaSeparated: true
			})
		]);
	}

	/**
	 * Extract signal strings and track emit vs trigger usage
	 */
	public extractSignals(): SignalInfo[] {
		const signalMap = new Map<string, SignalInfo>();

		// Find signal_emit() calls
		for (let i = 0; i < this.tokens.length - 1; i++) {
			const token = this.tokens[i];
			
			if (this.isCallableToken(token) && token.text === 'signal_emit') {
				const stringToken = this.findNextStringToken(i);
				if (stringToken) {
					const signalName = this.extractStringValue(stringToken.text);
					this.addSignalUsage(signalMap, signalName, stringToken, true);
				}
			}
		}

		// Find route labels: //signal/name or //shared/signal/name
		for (const token of this.tokens) {
			if (token.type === 'route-label') {
				const match = token.text.match(/^\/\/(shared\/)?signal\/([\w\/]+)$/);
				if (match && match[2]) {
					const signalName = match[2].replace(/\//g, '_');
					this.addSignalUsage(signalMap, signalName, token, true);
				}
			}
		}

		// Find 'on signal name' triggers by looking for the label token with reference modifier
		// after 'on signal' keywords
		for (let i = 0; i < this.tokens.length - 2; i++) {
			const token = this.tokens[i];
			
			// Look for pattern: 'on' keyword followed by 'signal' keyword followed by label reference
			// Note: Based on the MAST lexer, 'on' and 'signal' are parsed as keywords and excluded
			// So we look for a label token with 'reference' modifier that follows this pattern
			if (token.type === 'label' && token.modifier === 'reference') {
				// Check if this is after 'on signal' by examining the text before this token
				const offset = this.doc.offsetAt({ line: token.line, character: token.character });
				const lineStart = this.doc.offsetAt({ line: token.line, character: 0 });
				const textBefore = this.doc.getText().substring(lineStart, offset);
				
				if (/on\s+signal\s+$/.test(textBefore)) {
					const signalName = token.text;
					this.addSignalUsage(signalMap, signalName, token, false);
				}
			}
		}

		// Find documented signal keys: @signal name: description
		for (const tag of this.getDocumentedKeyTags()) {
			if (tag.keyType !== 'signal') {
				continue;
			}

			const token: Token = {
				type: 'string',
				text: tag.name,
				line: tag.line,
				character: tag.character,
				length: tag.name.length
			};
			this.addSignalUsage(signalMap, tag.name, token, true, tag.description || undefined);
		}

		return Array.from(signalMap.values());
	}

	/**
	 * Extract inventory key strings
	 */
	public extractInventoryKeys(): Word[] {
		return this.mergeWords([
			...this.extractStringsByFunctionKeywords(['inventory']),
			...this.extractDocumentedWords(['inventory'])
		]);
	}

	/**
	 * Extract blob/dataset key strings
	 */
	public extractBlobKeys(): Word[] {
		return this.mergeWords([
			...this.extractStringsByFunctionKeywords(['blob', 'data_set']),
			...this.extractStringsByBlobAccessorSetGet(),
			...this.extractDocumentedWords(['blob', 'data_set'])
		]);
	}

	/**
	 * Extract blob keys from chained accessor calls like:
	 * anything.data_set.set("key", value, 0)
	 * anything.blob.get("key", default)
	 */
	private extractStringsByBlobAccessorSetGet(): Word[] {
		const words: Word[] = [];

		for (let i = 0; i < this.tokens.length; i++) {
			const token = this.tokens[i];
			if (!this.isCallableToken(token)) {
				continue;
			}

			const callable = token.text.toLowerCase();
			if (callable !== 'set' && callable !== 'get') {
				continue;
			}

			if (!this.isBlobAccessorSetGetCall(i)) {
				continue;
			}

			const keyToken = this.findNthStringToken(i, 0);
			if (!keyToken) {
				continue;
			}

			const key = this.extractStringValue(keyToken.text);
			if (!key) {
				continue;
			}

			this.addWord(words, key, keyToken);
		}

		return this.mergeWords(words);
	}

	/**
	 * Extract link strings
	 */
	public extractLinks(): Word[] {
		return this.mergeWords([
			...this.extractStringsByFunctionKeywords(['link']),
			...this.extractDocumentedWords(['link'])
		]);
	}

	/**
	 * Generic extraction for function calls with string arguments.
	 * Matches functions by keyword(s) and extracts only the first top-level string arg.
	 */
	private extractStringsByFunctionKeywords(
		keywords: string[],
		options: {
			normalizeCase?: boolean;
			allowCommaSeparated?: boolean;
		} = {}
	): Word[] {
		const words: Word[] = [];

		for (let i = 0; i < this.tokens.length; i++) {
			const token = this.tokens[i];
			
			if (!this.isCallableToken(token) || !this.matchesFunctionKeywords(token.text, keywords)) {
				continue;
			}

			const stringToken = this.findNextStringToken(i);
			if (!stringToken) {
				continue;
			}

			let value = this.extractStringValue(stringToken.text);

			if (options.allowCommaSeparated) {
				const values = value.split(',').map(v => v.trim());
				for (let val of values) {
					if (!val) {
						continue;
					}
					if (options.normalizeCase) {
						val = val.toLowerCase();
					}
					this.addWord(words, val, stringToken);
				}
			} else {
				if (options.normalizeCase) {
					value = value.toLowerCase();
				}
				this.addWord(words, value, stringToken);
			}
		}

		return this.mergeWords(words);
	}

	/**
	 * Match a function name against one or more extraction keywords.
	 * Uses token boundaries so "role" does not match unrelated names like "controller".
	 */
	private matchesFunctionKeywords(functionName: string, keywords: string[]): boolean {
		const normalizedName = functionName.toLowerCase();

		for (const keyword of keywords) {
			const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const re = new RegExp(`(^|_)${escaped}(s)?(_|$)`);
			if (re.test(normalizedName)) {
				return true;
			}
		}

		return false;
	}

	private isBlobAccessorSetGetCall(callableIndex: number): boolean {
		const isBlobLikeAccessorName = (name: string): boolean => {
			const n = name.toLowerCase();
			return n === 'data_set' || n.includes('blob') || n.includes('data_set');
		};

		for (let i = callableIndex - 1; i >= 0; i--) {
			const token = this.tokens[i];
			if (token.type === 'operator') {
				if (token.text === '.') {
					continue;
				}
				break;
			}

			if (token.type === 'property' || token.type === 'variable' || token.type === 'function' || token.type === 'method') {
				const name = token.text.toLowerCase();
				if (isBlobLikeAccessorName(name)) {
					return true;
				}
				continue;
			}

			break;
		}

		return false;
	}

	private extractDocumentedWords(
		keywords: string[],
		options: {
			normalizeCase?: boolean;
			allowCommaSeparated?: boolean;
		} = {}
	): Word[] {
		const words: Word[] = [];
		
		const tags = this.getDocumentedKeyTags();
		if (tags.length > 0) {
			debug("KEY TAGS:")
			debug(tags);
			debug("KEYWORDS:")
			debug(keywords);
		}
		for (const tag of tags) {
			debug("Processing tag: " + tag.name + " of type " + tag.keyType);
			if (!(keywords.includes(tag.keyType))) {
				debug("Tag type: " + tag.keyType + " not in keywords");
				continue;
			}
			debug("Matched tag: " + tag.name + " of type " + tag.keyType);

			const token: Token = {
				type: 'string',
				text: tag.name,
				line: tag.line,
				character: tag.character,
				length: tag.length
			};

			if (options.allowCommaSeparated) {
				const values = tag.name.split(',').map(v => v.trim());
				for (let value of values) {
					if (!value) {
						continue;
					}
					if (options.normalizeCase) {
						value = value.toLowerCase();
					}
					this.addWord(words, value, token, tag.description);
				}
			} else {
				let value = tag.name;
				if (options.normalizeCase) {
					value = value.toLowerCase();
				}
				this.addWord(words, value, token, tag.description);
			}
		}
		if (tags.length > 0) {
			debug("Extracted documented keys:");
			debug(words);
		}
		return this.mergeWords(words);
	}

	private getDocumentedKeyTags(): DocumentedKeyTag[] {
		if (this.documentedKeyTags === null) {
			this.documentedKeyTags = this.scanDocumentedKeyTags();
		}
		return this.documentedKeyTags;
	}

	private scanDocumentedKeyTags(): DocumentedKeyTag[] {
		const tags: DocumentedKeyTag[] = [];

		for (const token of this.tokens) {
			if (token.type === 'comment') {
				tags.push(...this.parseTagsFromCommentToken(token));
				continue;
			}

			if (token.type === 'string' && (this.isDocstringToken(token.text) || this.isLineStartQuoteStringToken(token))) {
				tags.push(...this.parseTagsFromStringToken(token));
			}
		}

		return tags;
	}

	private parseTagsFromCommentToken(token: Token): DocumentedKeyTag[] {
		return this.parseTagsFromTokenText(token, (rawLine, isFirstLine, isLastLine, lineCharacterBase) => {
			let content = rawLine;
			let shift = 0;

			const leadingWhitespace = content.match(/^\s*/)?.[0].length ?? 0;
			if (leadingWhitespace > 0) {
				content = content.slice(leadingWhitespace);
				shift += leadingWhitespace;
			}

			if (isFirstLine && content.startsWith('/*')) {
				content = content.slice(2);
				shift += 2;
			}

			if (!isFirstLine && content.startsWith('*')) {
				content = content.slice(1);
				shift += 1;
			}

			if (content.startsWith('#')) {
				content = content.slice(1);
				shift += 1;
			}

			if (isLastLine && content.endsWith('*/')) {
				content = content.slice(0, -2);
			}

			return {
				content,
				baseCharacter: lineCharacterBase + shift
			};
		});
	}

	private parseTagsFromStringToken(token: Token): DocumentedKeyTag[] {
		return this.parseTagsFromTokenText(token, (rawLine, isFirstLine, isLastLine, lineCharacterBase) => {
			let content = rawLine;
			let shift = 0;

			if (isFirstLine) {
				const openMatch = /^(?:[furbFURB]+)?("""|'''|"|')/.exec(content);
				if (openMatch) {
					content = content.slice(openMatch[0].length);
					shift += openMatch[0].length;
				}
			}

			if (isLastLine) {
				content = content.replace(/("""|'''|"|')\s*$/, '');
			}

			return {
				content,
				baseCharacter: lineCharacterBase + shift
			};
		});
	}

	private parseTagsFromTokenText(
		token: Token,
		normalizeLine: (
			rawLine: string,
			isFirstLine: boolean,
			isLastLine: boolean,
			lineCharacterBase: number
		) => { content: string; baseCharacter: number }
	): DocumentedKeyTag[] {
		const tags: DocumentedKeyTag[] = [];
		const text = token.text;
		let line = token.line;
		let segmentStart = 0;
		let isFirstLine = true;

		for (let i = 0; i <= text.length; i++) {
			if (i < text.length && text[i] !== '\n') {
				continue;
			}

			const rawLine = text.substring(segmentStart, i);
			const lineCharacterBase = isFirstLine ? token.character : 0;
			const normalized = normalizeLine(rawLine, isFirstLine, i === text.length, lineCharacterBase);
			const tag = this.parseDocumentedKeyTag(normalized.content, line, normalized.baseCharacter);
			if (tag) {
				tags.push(tag);
			}

			line++;
			segmentStart = i + 1;
			isFirstLine = false;
		}

		return tags;
	}

	private isDocstringToken(value: string): boolean {
		const trimmed = value.trimStart();
		return /^(?:[furbFURB]+)?("""|''')/.test(trimmed);
	}

	private isLineStartQuoteStringToken(token: Token): boolean {
		if (!token.text.startsWith('"')) {
			return false;
		}

		const lineStartOffset = this.doc.offsetAt({ line: token.line, character: 0 });
		const tokenOffset = this.doc.offsetAt({ line: token.line, character: token.character });
		const prefix = this.doc.getText().substring(lineStartOffset, tokenOffset);
		return /^\s*$/.test(prefix);
	}

	private parseDocumentedKeyTag(content: string, line: number, baseCharacter: number): DocumentedKeyTag | null {
		const match = /^\s*@([a-zA-Z_][\w-]*)\s+([^:\s]+)\s*:\s*(.*?)\s*$/.exec(content);
		if (!match) {
			return null;
		}

		const [, keyType, name, description] = match;
		const nameIndex = match[0].indexOf(name);
		if (nameIndex === -1) {
			return null;
		}

		return {
			keyType: keyType.toLowerCase(),
			name,
			description: description.trim(),
			line,
			character: baseCharacter + nameIndex,
			length: name.length
		};
	}

	/**
	 * Find the next string token after a given position
	 */
	private findNextStringToken(startIndex: number): Token | null {
		return this.findNthStringToken(startIndex, 0);
	}

	/**
	 * Find all top-level string tokens in a function call's argument list.
	 */
	private findAllStringTokensInCall(startIndex: number): Token[] {
		const results: Token[] = [];

		let i = startIndex + 1;
		while (i < this.tokens.length && !(this.tokens[i].type === 'operator' && this.tokens[i].text === '(')) {
			i++;
		}

		if (i >= this.tokens.length) {
			return results;
		}

		let parenDepth = 1;

		for (i = i + 1; i < this.tokens.length; i++) {
			const token = this.tokens[i];

			if (token.type === 'operator') {
				if (token.text === '(') {
					parenDepth++;
					continue;
				}

				if (token.text === ')') {
					parenDepth--;
					if (parenDepth === 0) {
						break;
					}
					continue;
				}

			}

			if (parenDepth === 1 && token.type === 'string') {
				results.push(token);
			}
		}

		return results;
	}

	/**
	 * Find the string token at argument index N for a function call (0-indexed)
	 */
	private findNthStringToken(startIndex: number, n: number): Token | null {
		const strings = this.findAllStringTokensInCall(startIndex);
		return n >= 0 && n < strings.length ? strings[n] : null;
	}

	/**
	 * Extract the string content from a string token (remove quotes)
	 */
	private extractStringValue(tokenText: string): string {
		let value = tokenText.trim();

		// Handle optional Python string prefixes (f, r, b, u, fr, rf, etc.)
		value = value.replace(/^[furbFURB]+(?=["'])/, '');

		// Triple-quoted strings
		if ((value.startsWith('"""') && value.endsWith('"""')) || (value.startsWith("'''") && value.endsWith("'''"))) {
			return value.slice(3, -3);
		}

		// F-string segments may contain only the opening or closing quote.
		if (value.startsWith('"""')) {
			value = value.slice(3);
		} else if (value.startsWith("'''")) {
			value = value.slice(3);
		} else if (value.startsWith('"') || value.startsWith("'")) {
			value = value.slice(1);
		}

		if (value.endsWith('"""')) {
			value = value.slice(0, -3);
		} else if (value.endsWith("'''")) {
			value = value.slice(0, -3);
		} else if (value.endsWith('"') || value.endsWith("'")) {
			value = value.slice(0, -1);
		}

		return value;
	}

	/**
	 * Add a signal usage to the map
	 */
	private addSignalUsage(
		map: Map<string, SignalInfo>,
		name: string,
		token: Token,
		isEmit: boolean,
		description?: string
	): void {
		const location = this.createLocation(token);
		
		let signal = map.get(name);
		if (!signal) {
			signal = {
				name,
				description,
				emit: [],
				triggered: []
			};
			map.set(name, signal);
		} else if (!signal.description && description) {
			signal.description = description;
		}
		
		if (isEmit) {
			signal.emit.push(location);
		} else {
			signal.triggered.push(location);
		}
	}

	/**
	 * Add a word to the list or update existing entry
	 */
	private addWord(words: Word[], name: string, token: Token, description?: string): void {
		const location = this.createLocation(token);

		for (const word of words) {
			if (word.name === name) {
				if (!word.description && description) {
					word.description = description;
				}
				for (const loc of word.locations) {
					if (loc.uri === location.uri) {
						loc.ranges.push(location.range);
						return;
					}
				}
				word.locations.push({uri: location.uri, ranges: [location.range]});
				return;
			}
		}

		words.push({
			name,
			description,
			locations: [{uri: location.uri, ranges: [location.range]}]
		});
	}

	/**
	 * Merge duplicate words
	 */
	private mergeWords(words: Word[]): Word[] {
		const map = new Map<string, Word>();
		
		for (const word of words) {
			const existing = map.get(word.name);
			if (existing) {
				existing.locations.push(...word.locations);
				if (!existing.description && word.description) {
					existing.description = word.description;
				}
			} else {
				map.set(word.name, word);
			}
		}

		return Array.from(map.values());
	}

	/**
	 * Create a Location object from a token
	 */
	private createLocation(token: Token): Location {
		const range: Range = {
			start: { line: token.line, character: token.character },
			end: { line: token.line, character: token.character + token.length }
		};

		return {
			uri: fileFromUri(this.doc.uri),
			range
		};
	}
}

/**
 * Convenience function to extract strings from a document with tokens
 */
export function extractStringsFromTokens(doc: TextDocument, tokens: Token[]): ExtractedStrings {
	const extractor = new TokenBasedExtractor(doc, tokens);
	return extractor.extractAll();
}

/**
 * Compatibility helper; signals are already in SignalInfo format.
 */
export function convertToSignalInfo(signals: SignalInfo[]): SignalInfo[] {
	return signals;
}
