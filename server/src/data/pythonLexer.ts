import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range } from 'vscode-languageserver';
import { ClassObject } from './class';
import { Function, IParameter, Parameter } from './function';

/**
 * Token types for Python lexer
 */
enum TokenType {
	KEYWORD,      // def, class, async, return, etc.
	IDENTIFIER,   // variable/function/class names
	DECORATOR,    // @decorator
	STRING,       // "string" or 'string'
	DOCSTRING,    // """docstring"""
	OPERATOR,     // +, -, *, /, =, etc.
	PUNCTUATION,  // (, ), [, ], {, }, :, ,
	INDENT,       // indentation at line start
	NEWLINE,      // line break
	COMMENT,      // # comment
	EOF           // end of file
}

/**
 * Token from first pass
 */
interface Token {
	type: TokenType;
	value: string;
	line: number;
	column: number;
	indent?: number; // For INDENT tokens
}

/**
 * Lexer for Python files that extracts structural information
 * Uses a two-pass approach: tokenize first, then build structure
 */
export class PythonLexer {
	private text: string;
	private doc: TextDocument;
	private tokens: Token[] = [];

	constructor(document: TextDocument) {
		this.doc = document;
		// Normalize line endings so CRLF files don't create phantom tokens on blank lines.
		this.text = document.getText().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	}

	/**
	 * Parse the entire Python file and extract classes and functions
	 */
	public parse(): { classes: ClassObject[]; functions: Function[] } {
		try {
			// Pass 1: Tokenize
			this.tokens = this.tokenize();

			// Pass 2: Build structure from tokens
			const result = this.buildStructure();
			return result;
		} catch (error) {
			console.error('PythonLexer error:', error);
			return { classes: [], functions: [] };
		}
	}

	/**
	 * Pass 1: Tokenize the entire file
	 */
	private tokenize(): Token[] {
		const tokens: Token[] = [];
		let pos = 0;
		let line = 0;
		let column = 0;
		let iterations = 0;
		const maxIterations = this.text.length * 2; // Safety limit

		while (pos < this.text.length && iterations < maxIterations) {
			iterations++;
			const ch = this.text[pos];

			// Track line/column
			if (ch === '\n') {
				tokens.push({ type: TokenType.NEWLINE, value: '\n', line, column });
				pos++;
				line++;
				column = 0;
				
				// Measure indentation on next line
				if (pos < this.text.length) {
					let indent = 0;
					while (pos < this.text.length && (this.text[pos] === ' ' || this.text[pos] === '\t')) {
						indent++;
						pos++;
					}
					// Keep visual column aligned after consuming leading whitespace
					column = indent;
					// Only create INDENT token for executable/declarative lines.
					// Comment-only lines should not influence Python block structure.
					if (pos < this.text.length && this.text[pos] !== '\n' && this.text[pos] !== '#') {
						tokens.push({ type: TokenType.INDENT, value: '', line, column: 0, indent });
					}
				}
				continue;
			}

			// Skip whitespace (not newlines)
			if (ch === ' ' || ch === '\t') {
				pos++;
				column++;
				continue;
			}

			// Comments
			if (ch === '#') {
				const start = pos;
				while (pos < this.text.length && this.text[pos] !== '\n') {
					pos++;
				}
				tokens.push({ type: TokenType.COMMENT, value: this.text.substring(start, pos), line, column });
				column += pos - start;
				continue;
			}

			// Strings (including docstrings)
			if (ch === '"' || ch === "'") {
				const result = this.scanString(pos, line, column);
				tokens.push(result.token);
				pos = result.newPos;
				column = result.newColumn;
				line = result.newLine;
				continue;
			}

			// Decorators
			if (ch === '@') {
				const start = pos;
				const startCol = column;
				pos++; // skip @
				column++;
				while (pos < this.text.length && this.isIdentifierPart(this.text[pos])) {
					pos++;
					column++;
				}
				tokens.push({ type: TokenType.DECORATOR, value: this.text.substring(start, pos), line, column: startCol });
				continue;
			}

			// Identifiers and keywords
			if (this.isIdentifierStart(ch)) {
				const start = pos;
				const startCol = column;
				while (pos < this.text.length && this.isIdentifierPart(this.text[pos])) {
					pos++;
					column++;
				}
				const value = this.text.substring(start, pos);
				const type = this.isKeyword(value) ? TokenType.KEYWORD : TokenType.IDENTIFIER;
				tokens.push({ type, value, line, column: startCol });
				continue;
			}

			// Punctuation
			if ('()[]{}:,'.includes(ch)) {
				tokens.push({ type: TokenType.PUNCTUATION, value: ch, line, column });
				pos++;
				column++;
				continue;
			}

			// Numeric literals (int and float)
			if (ch >= '0' && ch <= '9') {
				const start = pos;
				const startCol = column;
				while (pos < this.text.length && ((this.text[pos] >= '0' && this.text[pos] <= '9') || this.text[pos] === '.' || this.text[pos] === '_')) {
					pos++;
					column++;
				}
				tokens.push({ type: TokenType.IDENTIFIER, value: this.text.substring(start, pos), line, column: startCol });
				continue;
			}

			// Operators (including ->)
			if ('+-*/%=<>!&|'.includes(ch)) {				const start = pos;
				const startCol = column;
				// Handle multi-char operators (only valid combinations).
				pos++;
				column++;
				if (pos < this.text.length) {
					const next = this.text[pos];
					const isArrow = ch === '-' && next === '>';
					const isComparisonOrAssign = next === '=' && '+-*/%<>&|!^='.includes(ch);
					const isShift = (ch === '<' || ch === '>') && next === ch;
					const isPowerOrFloorDiv = (ch === '*' || ch === '/') && next === ch;

					if (isArrow || isComparisonOrAssign || isShift || isPowerOrFloorDiv) {
						pos++;
						column++;
					}
				}
				tokens.push({ type: TokenType.OPERATOR, value: this.text.substring(start, pos), line, column: startCol });
				continue;
			}

			// Skip unknown characters
			pos++;
			column++;
		}

		tokens.push({ type: TokenType.EOF, value: '', line, column });
		return tokens;
	}

	/**
	 * Scan a string token (including triple-quoted docstrings)
	 */
	private scanString(pos: number, line: number, column: number): { token: Token; newPos: number; newColumn: number; newLine: number } {
		const startPos = pos;
		const startLine = line;
		const startCol = column;
		const quote = this.text[pos];

		// Check for triple-quote
		const isTriple = pos + 2 < this.text.length && 
			this.text[pos + 1] === quote && 
			this.text[pos + 2] === quote;

		if (isTriple) {
			pos += 3;
			column += 3;
			// Scan until closing triple-quote
			while (pos < this.text.length) {
				if (this.text[pos] === quote && 
					pos + 2 <= this.text.length && 
					this.text[pos + 1] === quote && 
					this.text[pos + 2] === quote) {
					pos += 3;
					column += 3;
					break;
				}
				if (this.text[pos] === '\n') {
					line++;
					column = 0;
				} else {
					column++;
				}
				pos++;
			}
			return {
				token: { type: TokenType.DOCSTRING, value: this.text.substring(startPos, pos), line: startLine, column: startCol },
				newPos: pos,
				newColumn: column,
				newLine: line
			};
		} else {
			// Regular string
			pos++;
			column++;
			while (pos < this.text.length) {
				if (this.text[pos] === '\\' && pos + 1 < this.text.length) {
					pos += 2;
					column += 2;
					continue;
				}
				if (this.text[pos] === quote) {
					pos++;
					column++;
					break;
				}
				if (this.text[pos] === '\n') break; // Unterminated
				pos++;
				column++;
			}
			return {
				token: { type: TokenType.STRING, value: this.text.substring(startPos, pos), line: startLine, column: startCol },
				newPos: pos,
				newColumn: column,
				newLine: line
			};
		}
	}

	/**
	 * Pass 2: Build structure from tokens
	 */
	private buildStructure(): { classes: ClassObject[]; functions: Function[] } {
		const classes: ClassObject[] = [];
		const functions: Function[] = [];
		let i = 0;
		let iterations = 0;
		const maxIterations = this.tokens.length * 10;

		while (i < this.tokens.length && iterations < maxIterations) {
			iterations++;
			
			// Skip comments, newlines, indents at module level
			while (i < this.tokens.length && 
				(this.tokens[i].type === TokenType.COMMENT || 
				 this.tokens[i].type === TokenType.NEWLINE || 
				 this.tokens[i].type === TokenType.INDENT)) {
				i++;
			}

			// Check for EOF
			if (i >= this.tokens.length || this.tokens[i].type === TokenType.EOF) {
				break;
			}

			// Collect decorators
			const decorators: string[] = [];
			while (i < this.tokens.length && this.tokens[i].type === TokenType.DECORATOR) {
				decorators.push(this.tokens[i].value);
				i++;
				// Skip to next line
				while (i < this.tokens.length && this.tokens[i].type !== TokenType.NEWLINE) i++;
				if (i < this.tokens.length) i++; // Skip newline
				// Skip indent
				if (i < this.tokens.length && this.tokens[i].type === TokenType.INDENT) i++;
			}

			const currentIndent = this.getLineIndentAtToken(i);

			// Check for class (module-level only)
			if (i < this.tokens.length && currentIndent === 0 && this.tokens[i].type === TokenType.KEYWORD && this.tokens[i].value === 'class') {
				const result = this.parseClassFromTokens(i, decorators);
				if (result.cls) classes.push(result.cls);
				i = result.nextIndex;
				continue;
			}

			// Check for function (def or async def) (module-level only)
			if (i < this.tokens.length && currentIndent === 0 && this.tokens[i].type === TokenType.KEYWORD && 
				(this.tokens[i].value === 'def' || this.tokens[i].value === 'async')) {
				const result = this.parseFunctionFromTokens(i, decorators, 0);
				if (result.func) {
					functions.push(result.func);
				}
				i = result.nextIndex;
				continue;
			}

			// Skip any other token
			i++;
		}

		if (iterations >= maxIterations) {
			console.error('PythonLexer buildStructure: hit max iterations limit');
		}

		return { classes, functions };
	}

	/**
	 * Parse class from tokens
	 */
	private parseClassFromTokens(startIndex: number, decorators: string[]): { cls: ClassObject | null; nextIndex: number } {
		let i = startIndex;
		const startLine = this.tokens[i].line;

		// Skip 'class' keyword
		i++;

		// Skip comments/newlines/indents to find class name
		while (i < this.tokens.length && (this.tokens[i].type === TokenType.COMMENT || this.tokens[i].type === TokenType.NEWLINE || this.tokens[i].type === TokenType.INDENT)) {
			i++;
		}

		// Get class name
		if (i >= this.tokens.length || this.tokens[i].type !== TokenType.IDENTIFIER) {
			return { cls: null, nextIndex: i };
		}
		const className = this.tokens[i].value;
		i++;

		// Parse base classes (optional)
		const bases: string[] = [];
		if (i < this.tokens.length && this.tokens[i].value === '(') {
			i++; // skip (
			while (i < this.tokens.length && this.tokens[i].value !== ')') {
				if (this.tokens[i].type === TokenType.IDENTIFIER) {
					bases.push(this.tokens[i].value);
				}
				i++;
			}
			if (i < this.tokens.length && this.tokens[i].value === ')') i++; // skip )
		}

		// Skip to colon
		while (i < this.tokens.length && this.tokens[i].value !== ':') i++;
		if (i < this.tokens.length) i++; // skip :

		// Determine class indentation from the line where `class` appears
		const classIndentLevel = this.getLineIndentAtToken(startIndex);

		// Skip newline(s) after colon
		while (i < this.tokens.length && this.tokens[i].type === TokenType.NEWLINE) i++;

		// Find the first meaningful class-body indentation (> classIndentLevel)
		let classBodyIndent = -1;
		let probe = i;
		while (probe < this.tokens.length) {
			const tok = this.tokens[probe];
			if (tok.type === TokenType.EOF) break;
			if (tok.type === TokenType.NEWLINE || tok.type === TokenType.COMMENT) {
				probe++;
				continue;
			}
			if (this.isStrippedCommentLine(probe)) {
				while (probe < this.tokens.length && this.tokens[probe].type !== TokenType.NEWLINE && this.tokens[probe].type !== TokenType.EOF) probe++;
				continue;
			}

			const probeIndent = this.getLineIndentAtToken(probe);
			if (probeIndent > classIndentLevel) {
				classBodyIndent = probeIndent;
				i = probe;
				break;
			}

			if (probeIndent <= classIndentLevel) {
				// Body never indented (empty or malformed class)
				break;
			}

			probe++;
		}

		if (classBodyIndent < 0) {
			const classObj = new ClassObject('', this.doc.uri, {
				name: className,
				parent: bases.length > 0 ? bases[0] : undefined,
				methods: [],
				properties: [],
				documentation: undefined,
				location: {
					uri: this.doc.uri,
					range: {
						start: { line: startLine, character: 0 },
						end: { line: startLine, character: 0 }
					}
				}
			});
			return {
				cls: classObj,
				nextIndex: i
			};
		}

		// Get docstring if present
		let docstring: string | undefined;
		if (i < this.tokens.length && this.tokens[i].type === TokenType.INDENT) i++;
		if (i < this.tokens.length && this.tokens[i].type === TokenType.DOCSTRING) {
			docstring = this.tokens[i].value.replace(/^["']{3}|["']{3}$/g, '');
			i++;
		}

		// Parse class body (methods)
		const methods: Function[] = [];

		while (i < this.tokens.length) {
			if (this.tokens[i].type === TokenType.EOF) {
				break;
			}
			if (this.tokens[i].type === TokenType.NEWLINE || this.tokens[i].type === TokenType.COMMENT) {
				i++;
				continue;
			}

			const lineIndent = this.getLineIndentAtToken(i);
			if (lineIndent < classBodyIndent) {
				if (this.isCommentOnlyLine(i)) {
					while (i < this.tokens.length && this.tokens[i].type !== TokenType.NEWLINE && this.tokens[i].type !== TokenType.EOF) i++;
					continue;
				}
				if (this.isStrippedCommentLine(i)) {
					while (i < this.tokens.length && this.tokens[i].type !== TokenType.NEWLINE && this.tokens[i].type !== TokenType.EOF) i++;
					continue;
				}
				break; // left class scope
			}
			if (lineIndent > classBodyIndent) {
				// Nested block inside a method/property body; skip this line
				while (i < this.tokens.length && this.tokens[i].type !== TokenType.NEWLINE && this.tokens[i].type !== TokenType.EOF) i++;
				continue;
			}

			// Collect method decorators
			const methodDecorators: string[] = [];
			while (i < this.tokens.length && this.tokens[i].type === TokenType.DECORATOR && this.getLineIndentAtToken(i) === classBodyIndent) {
				methodDecorators.push(this.tokens[i].value);
				i++;
				while (i < this.tokens.length && this.tokens[i].type !== TokenType.NEWLINE) i++;
				if (i < this.tokens.length) i++;
			}

			// Check for method definition
			if (i < this.tokens.length && this.getLineIndentAtToken(i) === classBodyIndent && this.tokens[i].type === TokenType.KEYWORD && 
				(this.tokens[i].value === 'def' || this.tokens[i].value === 'async')) {
				const result = this.parseFunctionFromTokens(i, methodDecorators, classBodyIndent, className);
				if (result.func) methods.push(result.func);
				i = result.nextIndex;
				continue;
			}

			i++;
		}

		const endLine = i < this.tokens.length ? this.tokens[i].line : this.tokens[this.tokens.length - 1].line;

		// Create ClassObject directly with pre-parsed data
		const classObj = new ClassObject('', this.doc.uri, {
			name: className,
			parent: bases.length > 0 ? bases[0] : undefined,
			methods,
			properties: [],
			documentation: docstring,
			location: {
				uri: this.doc.uri,
				range: {
					start: { line: startLine, character: 0 },
					end: { line: endLine, character: 0 }
				}
			}
		});

		return {
			cls: classObj,
			nextIndex: i
		};
	}

	/**
	 * Parse function from tokens
	 */
	private parseFunctionFromTokens(startIndex: number, decorators: string[], parentIndent: number, className: string = ''): { func: Function | null; nextIndex: number } {
		let i = startIndex;
		const startLine = this.tokens[i].line;
		const startColumn = this.tokens[i].column;

		// Check for async
		let isAsync = false;
		if (this.tokens[i].value === 'async') {
			isAsync = true;
			i++;
		}

		// Skip comments/newlines to find 'def' keyword
		while (i < this.tokens.length && (this.tokens[i].type === TokenType.COMMENT || this.tokens[i].type === TokenType.NEWLINE)) {
			i++;
		}

		// Skip 'def' keyword
		if (i >= this.tokens.length || this.tokens[i].value !== 'def') {
			return { func: null, nextIndex: i };
		}
		i++;

		// Skip comments/newlines to find function name
		while (i < this.tokens.length && (this.tokens[i].type === TokenType.COMMENT || this.tokens[i].type === TokenType.NEWLINE || this.tokens[i].type === TokenType.INDENT)) {
			i++;
		}

		// Get function name
		if (i >= this.tokens.length || this.tokens[i].type !== TokenType.IDENTIFIER) {
			return { func: null, nextIndex: i };
		}
		const funcName = this.tokens[i].value;
		i++;

		// Parse arguments
		const parameters: IParameter[] = [];
		let rawParams = '';
		if (i < this.tokens.length && this.tokens[i].value === '(') {
			i++; // skip (
			let parenDepth = 1;
			let currentParam: Token[] = [];

			const flushParam = () => {
				if (currentParam.length === 0) return;

				const eqIdx = currentParam.findIndex(t => t.value === '=');
				const nameToken = currentParam.find((t, idx) => t.type === TokenType.IDENTIFIER && (eqIdx < 0 || idx < eqIdx));
				if (!nameToken) {
					currentParam = [];
					return;
				}

				// Detect * or ** prefix tokens immediately before the name token
				const nameIdx = currentParam.indexOf(nameToken);
				let starPrefix = '';
				if (nameIdx >= 1 && currentParam[nameIdx - 1].value === '*') {
					starPrefix = '*';
					if (nameIdx >= 2 && currentParam[nameIdx - 2].value === '*') {
						starPrefix = '**';
					}
				}

				const argName = starPrefix + nameToken.value;
				if (argName === 'self' || argName === 'cls') {
					currentParam = [];
					return;
				}

				let argType: string | undefined;
				const colonIdx = currentParam.findIndex(t => t.value === ':');
				if (colonIdx >= 0) {
					const typeEnd = eqIdx >= 0 ? eqIdx : currentParam.length;
					const typeParts = currentParam.slice(colonIdx + 1, typeEnd).map(t => t.value).join('').trim();
					if (typeParts.length > 0) argType = typeParts;
				}

				let defaultValue: string | undefined;
				if (eqIdx >= 0 && eqIdx + 1 < currentParam.length) {
					const defParts = currentParam.slice(eqIdx + 1).map(t => t.value).join('').trim();
					if (defParts.length > 0) defaultValue = defParts;
				}

				const param = new Parameter(argName + (argType ? ': ' + argType : '') + (defaultValue ? ' = ' + defaultValue : ''), 0);
				parameters.push(param);

				if (rawParams.length > 0) rawParams += ', ';
				rawParams += argName;
				if (argType) rawParams += ': ' + argType;
				if (defaultValue) rawParams += ' = ' + defaultValue;

				currentParam = [];
			};

			while (i < this.tokens.length && parenDepth > 0) {
				const tok = this.tokens[i];

				if (tok.value === '(') {
					parenDepth++;
					currentParam.push(tok);
					i++;
					continue;
				}

				if (tok.value === ')') {
					parenDepth--;
					if (parenDepth === 0) {
						flushParam();
						i++; // skip )
						break;
					}
					currentParam.push(tok);
					i++;
					continue;
				}

				if (tok.value === ',' && parenDepth === 1) {
					flushParam();
					i++;
					continue;
				}

				currentParam.push(tok);
				i++;
			}

			if (parenDepth > 0) {
				return { func: null, nextIndex: i };
			}
		}

		// Parse return type annotation (->)
		let returnType: string | undefined;
		if (i < this.tokens.length && this.tokens[i].value === '->') {
			i++; // skip ->
			if (i < this.tokens.length && this.tokens[i].type === TokenType.IDENTIFIER) {
				returnType = this.tokens[i].value;
				i++;
			}
		}

		// Skip to the function-header colon without scanning into body tokens
		let headerDepth = 0;
		let foundHeaderColon = false;
		while (i < this.tokens.length) {
			const tok = this.tokens[i];
			if (tok.value === '(' || tok.value === '[' || tok.value === '{') {
				headerDepth++;
			} else if (tok.value === ')' || tok.value === ']' || tok.value === '}') {
				headerDepth = Math.max(0, headerDepth - 1);
			} else if (tok.value === ':' && headerDepth === 0) {
				foundHeaderColon = true;
				break;
			} else if (tok.type === TokenType.NEWLINE && headerDepth === 0) {
				break;
			}
			i++;
		}

		if (!foundHeaderColon) {
			return { func: null, nextIndex: i };
		}

		i++; // skip :

		// The function definition is at parentIndent level
		// The function body will be indented MORE than that
		const funcDefIndent = parentIndent;

		// Handle one-line functions: def f(): return x
		// If the next token after ':' is not NEWLINE/EOF, body is on same line.
		if (i < this.tokens.length && this.tokens[i].type !== TokenType.NEWLINE && this.tokens[i].type !== TokenType.EOF) {
			while (i < this.tokens.length && this.tokens[i].type !== TokenType.NEWLINE && this.tokens[i].type !== TokenType.EOF) {
				i++;
			}
			const endLineInline = i < this.tokens.length ? this.tokens[i].line : this.tokens[this.tokens.length - 1].line;

			let inlineFunctionType = 'function';
			for (const decorator of decorators) {
				if (decorator.includes('property')) inlineFunctionType = 'property';
				else if (decorator.includes('classmethod') || decorator.includes('staticmethod')) inlineFunctionType = 'classmethod';
				else if (decorator.includes('setter')) inlineFunctionType = 'setter';
				else if (decorator.includes('label')) inlineFunctionType = 'label';
				else if (decorator.includes('awaitable')) inlineFunctionType = 'awaitable';
			}
			if (funcName === '__init__') inlineFunctionType = 'constructor';

			const inlineFunc = new Function('', className, this.doc.uri, {
				name: funcName,
				parameters,
				rawParams,
				returnType,
				documentation: undefined,
				functionType: inlineFunctionType,
				decorators,
				location: {
					uri: this.doc.uri,
					range: {
						start: { line: startLine, character: 0 },
						end: { line: endLineInline, character: 0 }
					}
				},
				isAsync
			});
			inlineFunc.startIndex = this.doc.offsetAt({ line: startLine, character: startColumn });

			return {
				func: inlineFunc,
				nextIndex: i
			};
		}

		// Skip newline(s) after colon
		while (i < this.tokens.length && this.tokens[i].type === TokenType.NEWLINE) i++;

		// Get docstring if present (it will be first thing in body)
		let docstring: string | undefined;
		let seenBody = false;
		if (i < this.tokens.length && this.tokens[i].type === TokenType.INDENT) {
			const firstBodyIndent = this.tokens[i].indent || 0;
			if (firstBodyIndent > funcDefIndent) {
				seenBody = true;
			}
			// Only consume INDENT early when it is followed by a docstring
			if (i + 1 < this.tokens.length && this.tokens[i + 1].type === TokenType.DOCSTRING) {
				i++;
				docstring = this.tokens[i].value.replace(/^["']{3}|["']{3}$/g, '');
				i++;
			}
		}

		// Skip function body - continue until we dedent back to or below the function definition level
		// We MUST see an INDENT token to properly detect dedenting
		while (i < this.tokens.length) {
			if (this.tokens[i].type === TokenType.INDENT) {
				const currentIndent = this.tokens[i].indent || 0;
				// Track that we've entered the function body
				if (currentIndent > funcDefIndent) {
					seenBody = true;
				}
				// If we've seen the body and now dedent to definition level or less, function is over
				if (seenBody && currentIndent <= funcDefIndent) {
					if (this.isCommentOnlyLine(i) || this.isStrippedCommentLine(i)) {
						i++;
						continue;
					}
					break;
				}
				i++;
			} else if (this.tokens[i].type === TokenType.EOF) {
				break;
			} else {
				i++;
			}
		}

		const endLine = i < this.tokens.length ? this.tokens[i].line : this.tokens[this.tokens.length - 1].line;

		// Determine function type based on decorators
		let functionType = 'function';
		for (const decorator of decorators) {
			if (decorator.includes('property')) functionType = 'property';
			else if (decorator.includes('classmethod') || decorator.includes('staticmethod')) functionType = 'classmethod';
			else if (decorator.includes('setter')) functionType = 'setter';
			else if (decorator.includes('label')) functionType = 'label';
			else if (decorator.includes('awaitable')) functionType = 'awaitable';
		}
		if (funcName === '__init__') functionType = 'constructor';

		// Create Function directly with pre-parsed data
		const func = new Function('', className, this.doc.uri, {
			name: funcName,
			parameters,
			rawParams,
			returnType,
			documentation: docstring,
			functionType,
			decorators,
			location: {
				uri: this.doc.uri,
				range: {
					start: { line: startLine, character: 0 },
					end: { line: endLine, character: 0 }
				}
			},
			isAsync
		});
		func.startIndex = this.doc.offsetAt({ line: startLine, character: startColumn });
		return {
			func,
			nextIndex: i
		};
	}

	/**
	 * Helper: Check if character can start an identifier
	 */
	private isIdentifierStart(ch: string): boolean {
		return /[a-zA-Z_]/.test(ch);
	}

	/**
	 * Helper: Check if character can be part of an identifier
	 */
	private isIdentifierPart(ch: string): boolean {
		return /[a-zA-Z0-9_]/.test(ch);
	}

	/**
	 * Helper: Get indentation level for the line containing token at index
	 */
	private getLineIndentAtToken(index: number): number {
		if (index < 0 || index >= this.tokens.length) return 0;
		if (this.tokens[index].type === TokenType.INDENT) {
			return this.tokens[index].indent || 0;
		}
		const line = this.tokens[index].line;
		for (let j = index - 1; j >= 0; j--) {
			if (this.tokens[j].line < line) break;
			if (this.tokens[j].type === TokenType.INDENT) {
				return this.tokens[j].indent || 0;
			}
		}
		return 0;
	}

	/**
	 * Helper: Detect lines that became underscore-only after comment stripping.
	 * These lines should not affect indentation-based structure parsing.
	 */
	private isStrippedCommentLine(index: number): boolean {
		if (index < 0 || index >= this.tokens.length) return false;
		const line = this.tokens[index].line;
		let sawContent = false;

		for (let j = index; j < this.tokens.length && this.tokens[j].line === line; j++) {
			const tok = this.tokens[j];
			if (tok.type === TokenType.INDENT || tok.type === TokenType.NEWLINE) {
				continue;
			}
			sawContent = true;
			if (tok.type === TokenType.IDENTIFIER && /^_+$/.test(tok.value)) {
				continue;
			}
			return false;
		}

		return sawContent;
	}

	/**
	 * Helper: Detect real comment-only lines in token stream.
	 * These should be ignored for indentation-based scope transitions.
	 */
	private isCommentOnlyLine(index: number): boolean {
		if (index < 0 || index >= this.tokens.length) return false;
		const line = this.tokens[index].line;
		let sawComment = false;

		for (let j = index; j < this.tokens.length && this.tokens[j].line === line; j++) {
			const tok = this.tokens[j];
			if (tok.type === TokenType.INDENT || tok.type === TokenType.NEWLINE) continue;
			if (tok.type === TokenType.COMMENT) {
				sawComment = true;
				continue;
			}
			return false;
		}

		return sawComment;
	}

	/**
	 * Helper: Check if word is a Python keyword
	 */
	private isKeyword(word: string): boolean {
		const keywords = ['def', 'class', 'async', 'await', 'return', 'if', 'elif', 'else', 
			'for', 'while', 'break', 'continue', 'pass', 'import', 'from', 'as', 'try', 
			'except', 'finally', 'with', 'lambda', 'yield', 'raise', 'assert', 'del', 
			'global', 'nonlocal', 'and', 'or', 'not', 'in', 'is', 'None', 'True', 'False'];
		return keywords.includes(word);
	}
}
