import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range, Location } from 'vscode-languageserver';
import { fileFromUri } from '../fileFunctions';
import { Word } from './words';
import { SignalInfo } from './signals';

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

/**
 * Token-based string extractor
 * Uses pre-tokenized output from lexers for efficient extraction
 */
export class TokenBasedExtractor {
	private doc: TextDocument;
	private tokens: Token[];

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
		return this.extractStringsByFunctionKeywords(['role'], {
			normalizeCase: true,
			allowCommaSeparated: true
		});
	}

	/**
	 * Extract signal strings and track emit vs trigger usage
	 */
	public extractSignals(): SignalInfo[] {
		const signalMap = new Map<string, SignalInfo>();

		// Find signal_emit() calls
		for (let i = 0; i < this.tokens.length - 1; i++) {
			const token = this.tokens[i];
			
			if (token.type === 'function' && token.text === 'signal_emit') {
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

		return Array.from(signalMap.values());
	}

	/**
	 * Extract inventory key strings
	 */
	public extractInventoryKeys(): Word[] {
		return this.extractStringsByFunctionKeywords(['inventory'], {
			normalizeCase: true
		});
	}

	/**
	 * Extract blob/dataset key strings
	 */
	public extractBlobKeys(): Word[] {
		return this.extractStringsByFunctionKeywords(['blob', 'data_set'], {
			normalizeCase: true
		});
	}

	/**
	 * Extract link strings
	 */
	public extractLinks(): Word[] {
		return this.extractStringsByFunctionKeywords(['link']);
	}

	/**
	 * Generic extraction for function calls with string arguments.
	 * Matches functions by keyword(s) and extracts all top-level string args.
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
			
			if (token.type !== 'function' || !this.matchesFunctionKeywords(token.text, keywords)) {
				continue;
			}

			const stringTokens = this.findAllStringTokensInCall(i);
			for (const stringToken of stringTokens) {
				let value = this.extractStringValue(stringToken.text);

				if (options.allowCommaSeparated) {
					const values = value.split(',').map(v => v.trim());
					for (let val of values) {
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
		value = value.replace(/^[furbFURB]{1,2}(?=["'])/, '');

		// Triple-quoted strings
		if ((value.startsWith('"""') && value.endsWith('"""')) || (value.startsWith("'''") && value.endsWith("'''"))) {
			return value.slice(3, -3);
		}

		// Single/double-quoted strings
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			return value.slice(1, -1);
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
		isEmit: boolean
	): void {
		const location = this.createLocation(token);
		
		let signal = map.get(name);
		if (!signal) {
			signal = {
				name,
				emit: [],
				triggered: []
			};
			map.set(name, signal);
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
	private addWord(words: Word[], name: string, token: Token): void {
		const location = this.createLocation(token);

		for (const word of words) {
			if (word.name === name) {
				word.locations.push(location);
				return;
			}
		}

		words.push({
			name,
			locations: [location]
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
