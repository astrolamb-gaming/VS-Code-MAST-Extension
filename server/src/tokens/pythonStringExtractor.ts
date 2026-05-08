import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenBasedExtractor, Token, ExtractedStrings } from './tokenBasedExtractor';

/**
 * Simple Python tokenizer focused on extracting function calls and their string arguments
 * This is a lightweight alternative to full Python parsing for string extraction purposes
 */
export class SimplePythonTokenizer {
	private text: string;
	private pos: number = 0;
	private line: number = 0;
	private character: number = 0;
	private tokens: Token[] = [];

	constructor(private doc: TextDocument) {
		this.text = doc.getText();
	}

	tokenize(): Token[] {
		this.tokens = [];
		this.pos = 0;
		this.line = 0;
		this.character = 0;

		while (this.pos < this.text.length) {
			this.skipWhitespace();
			if (this.pos >= this.text.length) break;

			const ch = this.text[this.pos];

			// Comments
			if (ch === '#') {
				this.scanComment();
				continue;
			}

			// Check for string prefixes (f, r, b, u, fr, rf, br, rb) followed by quotes
			if (this.isIdentifierStart(ch)) {
				const prefix = this.peekStringPrefix();
				if (prefix !== null) {
					// This is a prefixed string (e.g., f"...", r"...", b"...")
					// Skip the prefix and scan the string
					this.pos += prefix.length;
					this.character += prefix.length;
					
					const nextChar = this.text[this.pos];
					
					// Check for triple-quoted strings
					if (this.matchTripleQuote()) {
						this.scanTripleQuotedString();
					} else if (nextChar === '"' || nextChar === "'") {
						this.scanString(nextChar);
					}
					continue;
				}
			}

			// Strings
			if (ch === '"' || ch === "'") {
				this.scanString(ch);
				continue;
			}

			// Triple-quoted strings
			if (this.matchTripleQuote()) {
				this.scanTripleQuotedString();
				continue;
			}

			// Identifiers and keywords
			if (this.isIdentifierStart(ch)) {
				this.scanIdentifier();
				continue;
			}

			// Numbers
			if (this.isDigit(ch)) {
				this.scanNumber();
				continue;
			}

			// Operators and punctuation
			this.scanOperator();
		}

		return this.tokens;
	}

	private skipWhitespace(): void {
		while (this.pos < this.text.length) {
			const ch = this.text[this.pos];
			if (ch === ' ' || ch === '\t' || ch === '\r') {
				this.pos++;
				this.character++;
			} else if (ch === '\n') {
				this.pos++;
				this.line++;
				this.character = 0;
			} else {
				break;
			}
		}
	}

	private scanComment(): void {
		const startLine = this.line;
		const startChar = this.character;
		const startPos = this.pos;

		while (this.pos < this.text.length && this.text[this.pos] !== '\n') {
			this.pos++;
			this.character++;
		}

		this.tokens.push({
			type: 'comment',
			text: this.text.substring(startPos, this.pos),
			line: startLine,
			character: startChar,
			length: this.pos - startPos
		});
	}

	/**
	 * Check if current position starts a string prefix (f, r, b, u, fr, rf, br, rb, etc.)
	 * Returns the prefix string if found, null otherwise
	 */
	private peekStringPrefix(): string | null {
		const remaining = this.text.substring(this.pos);
		
		// Check for two-character prefixes first (fr, rf, br, rb)
		const twoCharPrefixes = ['fr', 'rf', 'br', 'rb', 'FR', 'RF', 'BR', 'RB', 'Fr', 'Rf', 'Br', 'Rb', 'fR', 'rF', 'bR', 'rB'];
		for (const prefix of twoCharPrefixes) {
			if (remaining.startsWith(prefix)) {
				const afterPrefix = remaining.charAt(prefix.length);
				if (afterPrefix === '"' || afterPrefix === "'") {
					return prefix;
				}
			}
		}
		
		// Check for single-character prefixes (f, r, b, u)
		const oneCharPrefixes = ['f', 'r', 'b', 'u', 'F', 'R', 'B', 'U'];
		for (const prefix of oneCharPrefixes) {
			if (remaining.startsWith(prefix)) {
				const afterPrefix = remaining.charAt(prefix.length);
				if (afterPrefix === '"' || afterPrefix === "'") {
					return prefix;
				}
			}
		}
		
		return null;
	}

	private matchTripleQuote(): boolean {
		return (
			this.pos + 2 < this.text.length &&
			((this.text[this.pos] === '"' &&
				this.text[this.pos + 1] === '"' &&
				this.text[this.pos + 2] === '"') ||
				(this.text[this.pos] === "'" &&
					this.text[this.pos + 1] === "'" &&
					this.text[this.pos + 2] === "'"))
		);
	}

	private scanTripleQuotedString(): void {
		const startLine = this.line;
		const startChar = this.character;
		const startPos = this.pos;
		const quote = this.text[this.pos];

		this.pos += 3;
		this.character += 3;

		while (this.pos < this.text.length) {
			if (
				this.text[this.pos] === quote &&
				this.pos + 2 < this.text.length &&
				this.text[this.pos + 1] === quote &&
				this.text[this.pos + 2] === quote
			) {
				this.pos += 3;
				this.character += 3;
				break;
			}

			if (this.text[this.pos] === '\n') {
				this.line++;
				this.character = 0;
			} else {
				this.character++;
			}
			this.pos++;
		}

		this.tokens.push({
			type: 'string',
			text: this.text.substring(startPos, this.pos),
			line: startLine,
			character: startChar,
			length: this.pos - startPos
		});
	}

	private scanString(quoteChar: string): void {
		const startLine = this.line;
		const startChar = this.character;
		const startPos = this.pos;

		this.pos++; // Skip opening quote
		this.character++;

		while (this.pos < this.text.length) {
			const ch = this.text[this.pos];

			if (ch === '\\' && this.pos + 1 < this.text.length) {
				// Skip escaped character
				this.pos += 2;
				this.character += 2;
				continue;
			}

			if (ch === quoteChar) {
				this.pos++; // Skip closing quote
				this.character++;
				break;
			}

			if (ch === '\n') {
				// Unterminated string
				break;
			}

			this.pos++;
			this.character++;
		}

		this.tokens.push({
			type: 'string',
			text: this.text.substring(startPos, this.pos),
			line: startLine,
			character: startChar,
			length: this.pos - startPos
		});
	}

	private isIdentifierStart(ch: string): boolean {
		return /[a-zA-Z_]/.test(ch);
	}

	private isIdentifierPart(ch: string): boolean {
		return /[a-zA-Z0-9_]/.test(ch);
	}

	private isDigit(ch: string): boolean {
		return /[0-9]/.test(ch);
	}

	private scanIdentifier(): void {
		const startLine = this.line;
		const startChar = this.character;
		const startPos = this.pos;

		while (this.pos < this.text.length && this.isIdentifierPart(this.text[this.pos])) {
			this.pos++;
			this.character++;
		}

		const text = this.text.substring(startPos, this.pos);

		// Check if next non-whitespace character is '(' to detect function calls
		let lookAhead = this.pos;
		while (lookAhead < this.text.length && /[ \t]/.test(this.text[lookAhead])) {
			lookAhead++;
		}

		const isFunction = lookAhead < this.text.length && this.text[lookAhead] === '(';

		this.tokens.push({
			type: isFunction ? 'function' : 'identifier',
			text: text,
			line: startLine,
			character: startChar,
			length: this.pos - startPos
		});
	}

	private scanNumber(): void {
		const startLine = this.line;
		const startChar = this.character;
		const startPos = this.pos;

		// Support underscore separators in numeric literals (e.g. 60_000)
		// and prefixed bases like 0xFF_FF, 0b1010_0001, 0o12_34.
		if (
			this.text[this.pos] === '0' &&
			this.pos + 1 < this.text.length &&
			(this.text[this.pos + 1] === 'x' || this.text[this.pos + 1] === 'X')
		) {
			this.pos += 2;
			this.character += 2;
			while (this.pos < this.text.length && /[0-9a-fA-F_]/.test(this.text[this.pos])) {
				this.pos++;
				this.character++;
			}
		} else if (
			this.text[this.pos] === '0' &&
			this.pos + 1 < this.text.length &&
			(this.text[this.pos + 1] === 'b' || this.text[this.pos + 1] === 'B')
		) {
			this.pos += 2;
			this.character += 2;
			while (this.pos < this.text.length && /[01_]/.test(this.text[this.pos])) {
				this.pos++;
				this.character++;
			}
		} else if (
			this.text[this.pos] === '0' &&
			this.pos + 1 < this.text.length &&
			(this.text[this.pos + 1] === 'o' || this.text[this.pos + 1] === 'O')
		) {
			this.pos += 2;
			this.character += 2;
			while (this.pos < this.text.length && /[0-7_]/.test(this.text[this.pos])) {
				this.pos++;
				this.character++;
			}
		} else {
			while (this.pos < this.text.length && (this.isDigit(this.text[this.pos]) || this.text[this.pos] === '_')) {
				this.pos++;
				this.character++;
			}
			if (
				this.pos < this.text.length &&
				this.text[this.pos] === '.' &&
				this.pos + 1 < this.text.length &&
				this.isDigit(this.text[this.pos + 1])
			) {
				this.pos++;
				this.character++;
				while (this.pos < this.text.length && (this.isDigit(this.text[this.pos]) || this.text[this.pos] === '_')) {
					this.pos++;
					this.character++;
				}
			}
		}

		this.tokens.push({
			type: 'number',
			text: this.text.substring(startPos, this.pos),
			line: startLine,
			character: startChar,
			length: this.pos - startPos
		});
	}

	private scanOperator(): void {
		const startLine = this.line;
		const startChar = this.character;
		const ch = this.text[this.pos];

		this.pos++;
		this.character++;

		this.tokens.push({
			type: 'operator',
			text: ch,
			line: startLine,
			character: startChar,
			length: 1
		});
	}
}

/**
 * Tokenize a Python file once for reuse across multiple extraction calls.
 */
export function tokenizePythonFile(doc: TextDocument): Token[] {
	const tokenizer = new SimplePythonTokenizer(doc);
	return tokenizer.tokenize();
}

function createExtractor(doc: TextDocument, tokens?: Token[]): TokenBasedExtractor {
	const resolvedTokens = tokens ?? tokenizePythonFile(doc);
	return new TokenBasedExtractor(doc, resolvedTokens);
}

/**
 * Extract MAST framework strings from a Python file using the token-based approach
 */
export function extractStringsFromPythonFile(doc: TextDocument, tokens?: Token[]): ExtractedStrings {
	return createExtractor(doc, tokens).extractAll();
}

/**
 * Get just the roles from a Python file
 */
export function extractRolesFromPythonFile(doc: TextDocument, tokens?: Token[]): ReturnType<TokenBasedExtractor['extractRoles']> {
	return createExtractor(doc, tokens).extractRoles();
}

/**
 * Get just the signals from a Python file
 */
export function extractSignalsFromPythonFile(doc: TextDocument, tokens?: Token[]): ReturnType<TokenBasedExtractor['extractSignals']> {
	return createExtractor(doc, tokens).extractSignals();
}

/**
 * Get just the inventory keys from a Python file
 */
export function extractInventoryKeysFromPythonFile(doc: TextDocument, tokens?: Token[]): ReturnType<TokenBasedExtractor['extractInventoryKeys']> {
	return createExtractor(doc, tokens).extractInventoryKeys();
}

/**
 * Get just the shared-variable keys from a Python file
 */
export function extractSharedVariableKeysFromPythonFile(doc: TextDocument, tokens?: Token[]): ReturnType<TokenBasedExtractor['extractSharedVariableKeys']> {
	return createExtractor(doc, tokens).extractSharedVariableKeys();
}

/**
 * Get just the blob keys from a Python file
 */
export function extractBlobKeysFromPythonFile(doc: TextDocument, tokens?: Token[]): ReturnType<TokenBasedExtractor['extractBlobKeys']> {
	return createExtractor(doc, tokens).extractBlobKeys();
}

/**
 * Get just the links from a Python file
 */
export function extractLinksFromPythonFile(doc: TextDocument, tokens?: Token[]): ReturnType<TokenBasedExtractor['extractLinks']> {
	return createExtractor(doc, tokens).extractLinks();
}
