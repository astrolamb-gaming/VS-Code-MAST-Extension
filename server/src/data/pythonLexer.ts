import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range } from 'vscode-languageserver';

/**
 * Represents a Python function or method
 */
export interface PythonFunction {
	name: string;
	args: PythonArgument[];
	returnType?: string;
	docstring?: string;
	decorators: string[];
	isAsync: boolean;
	startLine: number;
	endLine: number;
	range: Range;
}

/**
 * Represents a function/method argument
 */
export interface PythonArgument {
	name: string;
	type?: string;
	defaultValue?: string;
	kind: 'positional' | 'keyword' | 'var_positional' | 'var_keyword';
}

/**
 * Represents a Python class
 */
export interface PythonClass {
	name: string;
	bases: string[];
	methods: PythonFunction[];
	properties: PythonProperty[];
	docstring?: string;
	decorators: string[];
	startLine: number;
	endLine: number;
	range: Range;
}

/**
 * Represents a class property/attribute
 */
export interface PythonProperty {
	name: string;
	type?: string;
	value?: string;
	line: number;
}

/**
 * Lexer for Python files that extracts structural information
 */
export class PythonLexer {
	private text: string;
	private doc: TextDocument;
	private pos: number = 0;
	private line: number = 0;
	private char: number = 0;
	private indentStack: number[] = [0];

	constructor(document: TextDocument) {
		this.doc = document;
		this.text = document.getText();
	}

	/**
	 * Parse the entire Python file and extract classes and functions
	 */
	public parse(): { classes: PythonClass[]; functions: PythonFunction[] } {
		const classes: PythonClass[] = [];
		const functions: PythonFunction[] = [];

		this.pos = 0;
		this.line = 0;
		this.char = 0;
		this.indentStack = [0];

		while (this.pos < this.text.length) {
			this.skipWhitespaceAndComments();
			if (this.pos >= this.text.length) break;

			const current = this.text[this.pos];
			
			// Check for decorators
			const decorators = this.parseDecorators();

			// Check for class or function definition
			if (this.matchKeyword('class')) {
				const cls = this.parseClass(decorators);
				if (cls) classes.push(cls);
			} else if (this.matchKeyword('def') || this.matchKeyword('async')) {
				const func = this.parseFunction(decorators);
				if (func) functions.push(func);
			} else {
				this.advance();
			}
		}

		return { classes, functions };
	}

	/**
	 * Parse a class definition
	 */
	private parseClass(decorators: string[]): PythonClass | null {
		const startLine = this.line;
		const startPos = this.pos;

		// Skip 'class' keyword
		this.skipWord();
		this.skipWhitespace();

		// Get class name
		const name = this.parseIdentifier();
		if (!name) return null;

		this.skipWhitespace();

		// Parse base classes (inheritance)
		const bases: string[] = [];
		if (this.text[this.pos] === '(') {
			this.advance(); // skip '('
			while (this.pos < this.text.length && this.text[this.pos] !== ')') {
				this.skipWhitespace();
				const base = this.parseIdentifier();
				if (base) bases.push(base);
				this.skipWhitespace();
				if (this.text[this.pos] === ',') this.advance();
			}
			if (this.text[this.pos] === ')') this.advance();
		}

		// Skip to ':'
		while (this.pos < this.text.length && this.text[this.pos] !== ':') {
			this.advance();
		}
		if (this.text[this.pos] === ':') this.advance();

		// Parse docstring if present
		this.skipWhitespace();
		const docstring = this.parseDocstring();

		// Parse class body
		const classIndent = this.getCurrentIndent();
		const methods: PythonFunction[] = [];
		const properties: PythonProperty[] = [];

		while (this.pos < this.text.length) {
			const bodyIndent = this.peekIndent();
			if (bodyIndent <= classIndent) break;

			this.skipWhitespaceAndComments();
			if (this.pos >= this.text.length) break;

			// Check for decorators
			const methodDecorators = this.parseDecorators();

			// Parse methods
			if (this.matchKeyword('def') || this.matchKeyword('async')) {
				const method = this.parseFunction(methodDecorators);
				if (method) methods.push(method);
			} else if (this.isIdentifierStart(this.text[this.pos])) {
				// Try to parse as property assignment
				const prop = this.parseProperty();
				if (prop) properties.push(prop);
				else this.skipLine();
			} else {
				this.skipLine();
			}
		}

		const endLine = this.line;

		return {
			name,
			bases,
			methods,
			properties,
			docstring,
			decorators,
			startLine,
			endLine,
			range: {
				start: this.doc.positionAt(startPos),
				end: this.doc.positionAt(this.pos)
			}
		};
	}

	/**
	 * Parse a function or method definition
	 */
	private parseFunction(decorators: string[]): PythonFunction | null {
		const startLine = this.line;
		const startPos = this.pos;

		// Check for 'async'
		let isAsync = false;
		if (this.matchKeyword('async')) {
			isAsync = true;
			this.skipWord();
			this.skipWhitespace();
		}

		// Skip 'def' keyword
		if (!this.matchKeyword('def')) return null;
		this.skipWord();
		this.skipWhitespace();

		// Get function name
		const name = this.parseIdentifier();
		if (!name) return null;

		this.skipWhitespace();

		// Parse arguments
		const args: PythonArgument[] = [];
		if (this.text[this.pos] === '(') {
			this.advance(); // skip '('
			
			while (this.pos < this.text.length && this.text[this.pos] !== ')') {
				this.skipWhitespace();
				
				// Check for *args or **kwargs
				let kind: PythonArgument['kind'] = 'positional';
				if (this.text[this.pos] === '*') {
					this.advance();
					if (this.text[this.pos] === '*') {
						this.advance();
						kind = 'var_keyword';
					} else {
						kind = 'var_positional';
					}
				}

				const argName = this.parseIdentifier();
				if (!argName) break;

				this.skipWhitespace();

				// Parse type annotation
				let type: string | undefined;
				if (this.text[this.pos] === ':') {
					this.advance();
					this.skipWhitespace();
					type = this.parseTypeAnnotation();
					this.skipWhitespace();
				}

				// Parse default value
				let defaultValue: string | undefined;
				if (this.text[this.pos] === '=') {
					this.advance();
					this.skipWhitespace();
					defaultValue = this.parseDefaultValue();
					this.skipWhitespace();
					if (kind === 'positional') kind = 'keyword';
				}

				args.push({ name: argName, type, defaultValue, kind });

				if (this.text[this.pos] === ',') {
					this.advance();
				}
			}

			if (this.text[this.pos] === ')') this.advance();
		}

		this.skipWhitespace();

		// Parse return type annotation
		let returnType: string | undefined;
		if (this.text[this.pos] === '-' && this.text[this.pos + 1] === '>') {
			this.advance();
			this.advance();
			this.skipWhitespace();
			returnType = this.parseTypeAnnotation();
		}

		// Skip to ':'
		while (this.pos < this.text.length && this.text[this.pos] !== ':') {
			this.advance();
		}
		if (this.text[this.pos] === ':') this.advance();

		// Parse docstring if present
		this.skipWhitespace();
		const docstring = this.parseDocstring();

		// Skip function body
		const funcIndent = this.getCurrentIndent();
		while (this.pos < this.text.length) {
			const bodyIndent = this.peekIndent();
			if (bodyIndent <= funcIndent) break;
			this.skipLine();
		}

		const endLine = this.line;

		return {
			name,
			args,
			returnType,
			docstring,
			decorators,
			isAsync,
			startLine,
			endLine,
			range: {
				start: this.doc.positionAt(startPos),
				end: this.doc.positionAt(this.pos)
			}
		};
	}

	/**
	 * Parse decorators (e.g., @property, @staticmethod)
	 */
	private parseDecorators(): string[] {
		const decorators: string[] = [];

		while (this.pos < this.text.length) {
			this.skipWhitespace();
			if (this.text[this.pos] !== '@') break;

			this.advance(); // skip '@'
			const decorator = this.parseIdentifier();
			if (decorator) {
				// Skip any arguments to decorator
				if (this.text[this.pos] === '(') {
					let depth = 1;
					this.advance();
					while (this.pos < this.text.length && depth > 0) {
						if (this.text[this.pos] === '(') depth++;
						if (this.text[this.pos] === ')') depth--;
						this.advance();
					}
				}
				decorators.push(decorator);
			}
			this.skipLine();
		}

		return decorators;
	}

	/**
	 * Parse a property assignment (e.g., self.x = value)
	 */
	private parseProperty(): PythonProperty | null {
		const startPos = this.pos;
		const line = this.line;

		// Look for pattern: identifier = value or self.identifier = value
		const identifier = this.parseIdentifier();
		if (!identifier) return null;

		this.skipWhitespace();

		// Check for attribute access (self.x)
		let propName = identifier;
		if (this.text[this.pos] === '.') {
			this.advance();
			propName = this.parseIdentifier();
			if (!propName) {
				this.pos = startPos;
				return null;
			}
			this.skipWhitespace();
		}

		// Look for type annotation
		let type: string | undefined;
		if (this.text[this.pos] === ':') {
			this.advance();
			this.skipWhitespace();
			type = this.parseTypeAnnotation();
			this.skipWhitespace();
		}

		// Must have assignment
		if (this.text[this.pos] !== '=') {
			this.pos = startPos;
			return null;
		}
		this.advance();
		this.skipWhitespace();

		// Get value
		const value = this.parseExpression();

		return { name: propName, type, value, line };
	}

	/**
	 * Parse a docstring (triple-quoted string)
	 */
	private parseDocstring(): string | undefined {
		this.skipWhitespace();
		
		const quote = this.text.substring(this.pos, this.pos + 3);
		if (quote !== '"""' && quote !== "'''") return undefined;

		this.pos += 3;
		const startPos = this.pos;

		// Find closing triple quotes
		while (this.pos < this.text.length - 2) {
			if (this.text.substring(this.pos, this.pos + 3) === quote) {
				const docstring = this.text.substring(startPos, this.pos);
				this.pos += 3;
				return docstring.trim();
			}
			this.advance();
		}

		return undefined;
	}

	/**
	 * Parse a type annotation
	 */
	private parseTypeAnnotation(): string {
		const startPos = this.pos;
		let depth = 0;

		while (this.pos < this.text.length) {
			const ch = this.text[this.pos];
			
			if (ch === '[' || ch === '(') {
				depth++;
				this.advance();
			} else if (ch === ']' || ch === ')') {
				depth--;
				this.advance();
				if (depth < 0) break;
			} else if (depth === 0 && (ch === ',' || ch === '=' || ch === ':' || ch === '\n')) {
				break;
			} else {
				this.advance();
			}
		}

		return this.text.substring(startPos, this.pos).trim();
	}

	/**
	 * Parse a default value for a parameter
	 */
	private parseDefaultValue(): string {
		const startPos = this.pos;
		let depth = 0;

		while (this.pos < this.text.length) {
			const ch = this.text[this.pos];
			
			if (ch === '[' || ch === '(' || ch === '{') {
				depth++;
				this.advance();
			} else if (ch === ']' || ch === ')' || ch === '}') {
				depth--;
				this.advance();
				if (depth < 0) break;
			} else if (depth === 0 && (ch === ',' || ch === ')')) {
				break;
			} else if (ch === '\n' && depth === 0) {
				break;
			} else {
				this.advance();
			}
		}

		return this.text.substring(startPos, this.pos).trim();
	}

	/**
	 * Parse a simple expression (for property values)
	 */
	private parseExpression(): string {
		const startPos = this.pos;

		while (this.pos < this.text.length && this.text[this.pos] !== '\n') {
			this.advance();
		}

		return this.text.substring(startPos, this.pos).trim();
	}

	/**
	 * Parse an identifier
	 */
	private parseIdentifier(): string {
		if (!this.isIdentifierStart(this.text[this.pos])) return '';

		const startPos = this.pos;
		while (this.pos < this.text.length && this.isIdentifierPart(this.text[this.pos])) {
			this.advance();
		}

		return this.text.substring(startPos, this.pos);
	}

	/**
	 * Check if current position matches a keyword
	 */
	private matchKeyword(keyword: string): boolean {
		const endPos = this.pos + keyword.length;
		if (endPos > this.text.length) return false;

		const word = this.text.substring(this.pos, endPos);
		if (word !== keyword) return false;

		// Make sure it's not part of a longer identifier
		if (endPos < this.text.length && this.isIdentifierPart(this.text[endPos])) {
			return false;
		}

		return true;
	}

	/**
	 * Skip past the current word
	 */
	private skipWord(): void {
		while (this.pos < this.text.length && this.isIdentifierPart(this.text[this.pos])) {
			this.advance();
		}
	}

	/**
	 * Skip whitespace (spaces and tabs only, not newlines)
	 */
	private skipWhitespace(): void {
		while (this.pos < this.text.length && (this.text[this.pos] === ' ' || this.text[this.pos] === '\t')) {
			this.advance();
		}
	}

	/**
	 * Skip whitespace and comments
	 */
	private skipWhitespaceAndComments(): void {
		while (this.pos < this.text.length) {
			const ch = this.text[this.pos];
			
			if (ch === ' ' || ch === '\t' || ch === '\n') {
				this.advance();
			} else if (ch === '#') {
				this.skipLine();
			} else {
				break;
			}
		}
	}

	/**
	 * Skip to end of current line
	 */
	private skipLine(): void {
		while (this.pos < this.text.length && this.text[this.pos] !== '\n') {
			this.advance();
		}
		if (this.pos < this.text.length && this.text[this.pos] === '\n') {
			this.advance();
		}
	}

	/**
	 * Get the indentation level at current position
	 */
	private getCurrentIndent(): number {
		// Move back to start of line
		let tempPos = this.pos;
		while (tempPos > 0 && this.text[tempPos - 1] !== '\n') {
			tempPos--;
		}

		let indent = 0;
		while (tempPos < this.text.length && (this.text[tempPos] === ' ' || this.text[tempPos] === '\t')) {
			indent++;
			tempPos++;
		}

		return indent;
	}

	/**
	 * Peek at the indentation of the next non-empty line
	 */
	private peekIndent(): number {
		let tempPos = this.pos;

		// Skip current line
		while (tempPos < this.text.length && this.text[tempPos] !== '\n') {
			tempPos++;
		}
		if (tempPos < this.text.length && this.text[tempPos] === '\n') {
			tempPos++;
		}

		// Count indent on next line
		let indent = 0;
		while (tempPos < this.text.length && (this.text[tempPos] === ' ' || this.text[tempPos] === '\t')) {
			indent++;
			tempPos++;
		}

		// If line is empty, skip it
		if (tempPos < this.text.length && this.text[tempPos] === '\n') {
			return this.peekIndent(); // recursively check next line
		}

		return indent;
	}

	/**
	 * Check if character can start an identifier
	 */
	private isIdentifierStart(ch: string): boolean {
		return /[a-zA-Z_]/.test(ch);
	}

	/**
	 * Check if character can be part of an identifier
	 */
	private isIdentifierPart(ch: string): boolean {
		return /[a-zA-Z0-9_]/.test(ch);
	}

	/**
	 * Advance position by one character
	 */
	private advance(): void {
		if (this.text[this.pos] === '\n') {
			this.line++;
			this.char = 0;
		} else {
			this.char++;
		}
		this.pos++;
	}
}
