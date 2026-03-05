import { debug } from 'console';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SemanticTokens, SemanticTokensBuilder, integer } from 'vscode-languageserver';
// regex-based helpers are used by the original MastLexer for backwards
// compatibility/benchmarking but the state-machine lexer should avoid them
// entirely.  We still need the CRange type for range bookkeeping.
// the regex helpers are still required by MastLexer
import { getComments, getStrings, getYamls } from '../tokens/comments';
import { CRange } from '../tokens/comments';
import { Token } from '../tokens/tokens';

/**
 * Semantic token types supported by the MAST language server.
 * Must match the tokenTypes array in server.ts capabilities.
 */
export const TOKEN_TYPES = [
	'keyword',           // 0
	'label',             // 1
	'variable',          // 2
	'string',            // 3
	'comment',           // 4
	'function',          // 5
	'class',             // 6
	'operator',          // 7
	'number',            // 8
	'route-label',       // 9
	'media-label',       // 10
	'resource-label',    // 11
	'builtInConstant',   // 12
	'stringOption',      // 13
	'yaml.key',          // 14
	'yaml.value',        // 15
	'codetag',           // 16
	'style-definition'
] as const;

export const TOKEN_MODIFIERS = [
	'declaration',    // 0
	'definition',     // 1
	'readonly',       // 2
	'reference'       // 3
] as const;

export interface TokenInfo {
	type: string;
	modifier?: string;
	line: integer;
	character: integer;
	length: integer;
	text: string;
}

/**
 * Single-pass lexer for MAST language files
 * Combines all token parsing into one efficient scan
 */
export class MastLexer {
	private doc: TextDocument;
	private text: string;
	private tokens: TokenInfo[] = [];
	private commentRanges: CRange[] = [];
	private stringRanges: CRange[] = [];
	private yamlRanges: CRange[] = [];
	private operatorExclusionRanges: CRange[] = [];

	constructor(document: TextDocument) {
		this.doc = document;
		this.text = document.getText();
		// MastLexer continues to use regex helpers; keep original initialization
		this.commentRanges = getComments(document);
		this.stringRanges = getStrings(document);
		this.yamlRanges = getYamls(document);
	}

	/**
	 * Checks if an offset is within a string, comment, or yaml block
	 */
	private isInExcludedRegion(offset: integer): boolean {
		return this.isInRange(offset, this.stringRanges) ||
			   this.isInRange(offset, this.commentRanges) ||
			   this.isInRange(offset, this.yamlRanges) ||
			   this.isInRange(offset, this.operatorExclusionRanges);
	}

	private isInRange(offset: integer, ranges: CRange[]): boolean {
		for (const range of ranges) {
			if (offset >= range.start && offset <= range.end) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Tokenize the entire document in a single pass
	 */
	public tokenize(): TokenInfo[] {
		this.tokens = [];
		this.operatorExclusionRanges = [];
		
		// Process in order of priority to avoid overlaps
		this.scanStrings();
		this.scanComments();
		this.scanLabels();
		this.scanKeywords();
		this.scanArrowOperators();
		this.scanVariableDefinitions();
		this.scanFunctionDefinitions();
		this.scanClassDefinitions();
		this.scanOperators();
		this.scanNumbers();
		
		// Sort by offset for semantic tokens builder
		this.tokens.sort((a, b) => {
			const aOffset = this.doc.offsetAt({ line: a.line, character: a.character });
			const bOffset = this.doc.offsetAt({ line: b.line, character: b.character });
			return aOffset - bOffset;
		});

		return this.tokens;
	}

	private scanStrings(): void {
		for (const range of this.stringRanges) {
			const start = this.doc.positionAt(range.start);
			const text = this.text.substring(range.start, range.end);
			this.tokens.push({
				type: 'string',
				line: start.line,
				character: start.character,
				length: range.end - range.start,
				text
			});
		}
	}

	private scanComments(): void {
		for (const range of this.commentRanges) {
			const start = this.doc.positionAt(range.start);
			const text = this.text.substring(range.start, range.end);
			this.tokens.push({
				type: 'comment',
				line: start.line,
				character: start.character,
				length: range.end - range.start,
				text
			});
		}
	}

	private scanLabels(): void {
		// Main labels: ==label_name==
		const mainLabelRegex = /^([ \t]*)(={2,}[ \t]*)(\w+)([ \t]*(={2,})?)/gm;
		let match: RegExpExecArray | null;
		
		while ((match = mainLabelRegex.exec(this.text)) !== null) {
			if (!this.isInExcludedRegion(match.index)) {
				const labelName = match[3];
				const offset = match.index + match[0].indexOf(labelName);
				const pos = this.doc.positionAt(offset);
				this.tokens.push({
					type: 'label',
					modifier: 'definition',
					line: pos.line,
					character: pos.character,
					length: labelName.length,
					text: labelName
				});

				// Treat the leading operator sequence (e.g. ==) as a keyword when at line start
				const opRaw = match[2];
				const opText = opRaw.trim();
				if (/^=+$/.test(opText)) {
					const opOffset = match.index + match[0].indexOf(opRaw) + (opRaw.indexOf(opText) || 0);
					const opPos = this.doc.positionAt(opOffset);
					this.tokens.push({
						type: 'keyword',
						line: opPos.line,
						character: opPos.character,
						length: opText.length,
						text: opText
					});
				}

				// Treat trailing operator sequence (e.g. trailing ==) as a keyword
				const trailingRaw = match[4];
				if (trailingRaw) {
					const trailingText = trailingRaw.trim();
					if (/^=+$/.test(trailingText)) {
						const trailingOffset = match.index + match[0].indexOf(trailingRaw) + (trailingRaw.indexOf(trailingText) || 0);
						const trailingPos = this.doc.positionAt(trailingOffset);
						this.tokens.push({
							type: 'keyword',
							line: trailingPos.line,
							character: trailingPos.character,
							length: trailingText.length,
							text: trailingText
						});
					}
				}

				// Exclude the entire matched label span from operator scanning
				const labelStart = match.index;
				const labelEnd = match.index + match[0].length;
				this.operatorExclusionRanges.push({ start: labelStart, end: labelEnd });
			}
		}

		// Inline labels: --label_name-- or ++label_name++
		const inlineLabelRegex = /^([ \t]*)((-|\+){2,}[ \t]*)(\w+)([ \t]*((-|\+){2,})?)/gm;
		while ((match = inlineLabelRegex.exec(this.text)) !== null) {
			if (!this.isInExcludedRegion(match.index)) {
				const labelName = match[4];
				const offset = match.index + match[0].indexOf(labelName);
				const pos = this.doc.positionAt(offset);
				this.tokens.push({
					type: 'label',
					modifier: 'definition',
					line: pos.line,
					character: pos.character,
					length: labelName.length,
					text: labelName
				});

				// Treat the leading operator sequence (e.g. --) as a keyword when at line start
				const opRawInline = match[2];
				const opTextInline = opRawInline.trim();
				if (/^-+$/.test(opTextInline) || /^\++$/.test(opTextInline)) {
					const opOffset = match.index + match[0].indexOf(opRawInline) + (opRawInline.indexOf(opTextInline) || 0);
					const opPos = this.doc.positionAt(opOffset);
					this.tokens.push({
						type: 'keyword',
						line: opPos.line,
						character: opPos.character,
						length: opTextInline.length,
						text: opTextInline
					});
				}

				// Treat trailing operator sequence (e.g. trailing -- or ++) as a keyword
				const trailingRawInline = match[5];
				if (trailingRawInline) {
					const trailingTextInline = trailingRawInline.trim();
					if (/^-+$/.test(trailingTextInline) || /^\++$/.test(trailingTextInline)) {
						const trailingOffset = match.index + match[0].indexOf(trailingRawInline) + (trailingRawInline.indexOf(trailingTextInline) || 0);
						const trailingPos = this.doc.positionAt(trailingOffset);
						this.tokens.push({
							type: 'keyword',
							line: trailingPos.line,
							character: trailingPos.character,
							length: trailingTextInline.length,
							text: trailingTextInline
						});
					}
				}

				// Exclude the entire matched label span from operator scanning
				const labelStart = match.index;
				const labelEnd = match.index + match[0].length;
				this.operatorExclusionRanges.push({ start: labelStart, end: labelEnd });
			}
		}

		// Route labels: //label_name or //label_name/subroute
		const routeLabelRegex = /^([ \t]*)(\/{2,})(\w+)(\/\w+)*/gm;
		while ((match = routeLabelRegex.exec(this.text)) !== null) {
			if (!this.isInExcludedRegion(match.index)) {
				const labelName = match[3];
				const offset = match.index + match[0].indexOf(labelName);
				const pos = this.doc.positionAt(offset);
				this.tokens.push({
					type: 'route-label',
					modifier: 'definition',
					line: pos.line,
					character: pos.character,
					length: labelName.length,
					text: labelName
				});

				// Treat the leading slashes (e.g. //) as a keyword when at line start
				const opRawRoute = match[2];
				const opTextRoute = opRawRoute.trim();
				if (/^\/+$/ .test(opTextRoute)) {
					const opOffset = match.index + match[0].indexOf(opRawRoute) + (opRawRoute.indexOf(opTextRoute) || 0);
					const opPos = this.doc.positionAt(opOffset);
					this.tokens.push({
						type: 'keyword',
						line: opPos.line,
						character: opPos.character,
						length: opTextRoute.length,
						text: opTextRoute
					});
				}

					// Exclude the entire matched route label span from operator scanning
					const labelStart = match.index;
					const labelEnd = match.index + match[0].length;
					this.operatorExclusionRanges.push({ start: labelStart, end: labelEnd });
			}
		}

		// Inline route labels: //label_name/subroute that can appear anywhere in a line (not just at start)
		const inlineRouteLabelRegex = /(\/{2,})(\w+)(\/\w+)*/g;
		while ((match = inlineRouteLabelRegex.exec(this.text)) !== null) {
			// Skip if this was already matched by the line-start route label regex
			if (!this.isInExcludedRegion(match.index)) {
				const priorNewline = this.text.lastIndexOf('\n', match.index - 1);
				const prefix = this.text.substring(priorNewline + 1, match.index);
				
				// Only process if this is NOT at the start of a line (line-start patterns already handled above)
				if (!/^\s*$/.test(prefix)) {
					const labelName = match[2];
					const offset = match.index + match[0].indexOf(labelName);
					const pos = this.doc.positionAt(offset);
					this.tokens.push({
						type: 'route-label',
						modifier: 'definition',
						line: pos.line,
						character: pos.character,
						length: labelName.length,
						text: labelName
					});

					// Exclude the entire matched route label span from operator scanning
					const labelStart = match.index;
					const labelEnd = match.index + match[0].length;
					this.operatorExclusionRanges.push({ start: labelStart, end: labelEnd });
				}
			}
		}
	}

	private scanKeywords(): void {
		const keywordRegex = /\b(def|async|on\s+change|await|shared|import|if|else|match|case|yield|return|break|continue|pass|raise|try|except|finally|with|class|while|for|in|is|and|or|not|lambda|True|False|None|jump)\b/gi;
		let match: RegExpExecArray | null;
		while ((match = keywordRegex.exec(this.text)) !== null) {
			if (!this.isInExcludedRegion(match.index)) {
				const pos = this.doc.positionAt(match.index);
				this.tokens.push({
					type: 'keyword',
					line: pos.line,
					character: pos.character,
					length: match[0].length,
					text: match[0]
				});
			}
		}
	}

	private scanArrowOperators(): void {
		// Arrow operator: ->
		const arrowRegex = /->/g;
		let match: RegExpExecArray | null;
		while ((match = arrowRegex.exec(this.text)) !== null) {
			if (!this.isInExcludedRegion(match.index)) {
				const pos = this.doc.positionAt(match.index);
				this.tokens.push({
					type: 'keyword',
					line: pos.line,
					character: pos.character,
					length: 2,
					text: '->'
				});
			}
		}
	}

	private scanVariableDefinitions(): void {
		// Variable assignments: name = value
		// Modifiers: default, shared, assigned, client, temp
		const varDefRegex = /^[\t ]*(default[ \t]+)?((shared|assigned|client|temp)[ \t]+)?([a-zA-Z_]\w*)[\t ]*(?==[^=])/gm;
		let match: RegExpExecArray | null;
		
		while ((match = varDefRegex.exec(this.text)) !== null) {
			if (!this.isInExcludedRegion(match.index)) {
				const varName = match[4];
				const offset = match.index + match[0].indexOf(varName);
				const pos = this.doc.positionAt(offset);
				this.tokens.push({
					type: 'variable',
					modifier: 'definition',
					line: pos.line,
					character: pos.character,
					length: varName.length,
					text: varName
				});
			}
		}
	}

	private scanFunctionDefinitions(): void {
		// Function definitions: def function_name(...)
		const funcDefRegex = /\bdef\s+([a-zA-Z_]\w*)\s*\(/gi;
		let match: RegExpExecArray | null;
		
		while ((match = funcDefRegex.exec(this.text)) !== null) {
			if (!this.isInExcludedRegion(match.index)) {
				const funcName = match[1];
				const offset = match.index + match[0].indexOf(funcName);
				const pos = this.doc.positionAt(offset);
				this.tokens.push({
					type: 'function',
					modifier: 'definition',
					line: pos.line,
					character: pos.character,
					length: funcName.length,
					text: funcName
				});
			}
		}

		// Async function definitions: async def function_name(...)
		const asyncFuncDefRegex = /\basync\s+def\s+([a-zA-Z_]\w*)\s*\(/gi;
		while ((match = asyncFuncDefRegex.exec(this.text)) !== null) {
			if (!this.isInExcludedRegion(match.index)) {
				const funcName = match[1];
				const offset = match.index + match[0].indexOf(funcName);
				const pos = this.doc.positionAt(offset);
				this.tokens.push({
					type: 'function',
					modifier: 'definition',
					line: pos.line,
					character: pos.character,
					length: funcName.length,
					text: funcName
				});
			}
		}
	}

	private scanClassDefinitions(): void {
		// Class definitions: class ClassName(...)
		const classDefRegex = /\bclass\s+([a-zA-Z_]\w*)/gi;
		let match: RegExpExecArray | null;
		
		while ((match = classDefRegex.exec(this.text)) !== null) {
			if (!this.isInExcludedRegion(match.index)) {
				const className = match[1];
				const offset = match.index + match[0].indexOf(className);
				const pos = this.doc.positionAt(offset);
				this.tokens.push({
					type: 'class',
					modifier: 'definition',
					line: pos.line,
					character: pos.character,
					length: className.length,
					text: className
				});
			}
		}
	}

	private scanOperators(): void {
		// Common operators: =, ==, !=, <=, >=, <, >, +, -, *, /, //, %, **, &, |, ^, ~, <<, >>
		const operatorRegex = /(==|!=|<=|>=|<<|>>|\*\*|[+\-*/%&|^~<>=])/g;
		let match: RegExpExecArray | null;
		
		while ((match = operatorRegex.exec(this.text)) !== null) {
			if (!this.isInExcludedRegion(match.index)) {
				// Skip operator tokens that are purely sequences of '=', '+', '-', or '/' at line start
				const opText = match[0];
				const priorNewline = this.text.lastIndexOf('\n', match.index - 1);
				const prefix = this.text.substring(priorNewline + 1, match.index);
				if (/^\s*$/.test(prefix) && (/^=+$/.test(opText) || /^-+$/.test(opText) || /^\++$/.test(opText) || /^\/+$/ .test(opText))) {
					continue;
				}
				const pos = this.doc.positionAt(match.index);
				this.tokens.push({
					type: 'operator',
					line: pos.line,
					character: pos.character,
					length: match[0].length,
					text: match[0]
				});
			}
		}
	}

	private scanNumbers(): void {
		// Numbers: integers, floats, hex, binary, octal
		const numberRegex = /\b(0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|\d+\.\d+|\d+)\b/g;
		let match: RegExpExecArray | null;
		
		while ((match = numberRegex.exec(this.text)) !== null) {
			if (!this.isInExcludedRegion(match.index)) {
				const pos = this.doc.positionAt(match.index);
				this.tokens.push({
					type: 'number',
					line: pos.line,
					character: pos.character,
					length: match[0].length,
					text: match[0]
				});
			}
		}
	}

	public getTokens(): TokenInfo[] {
		return this.tokens;
	}
}

/**
 * State machine lexer for MAST language files
 * Character-by-character scanning for comparison/benchmarking
 */
export class MastStateMachineLexer {
    private doc: TextDocument;
    private text: string;
    private tokens: TokenInfo[] = [];
    private pos: number = 0;
    private line: number = 0;
    private char: number = 0;
	private expectSignalReference: boolean = false;
	// When a line begins with a single '+' we expect a string to follow;
	// after that string the next identifier should be treated as a label reference.
	private expectPlusDirective: boolean = false;
	private expectPlusLabelReference: boolean = false;

	constructor(document: TextDocument) {
		this.doc = document;
		this.text = document.getText();
	}


	private peek(offset: number = 1): string | null {
		const nextPos = this.pos + offset;
		return nextPos < this.text.length ? this.text[nextPos] : null;
	}

	private peekAhead(length: number): string {
		return this.text.substring(this.pos, this.pos + length);
	}

	private advance(): void {
		if (this.pos < this.text.length) {
			if (this.text[this.pos] === '\n') {
				this.line++;
				this.char = 0;
			} else {
				this.char++;
			}
			this.pos++;
		}
	}

	// advance to a specific offset without updating line/char manually
	private advanceTo(offset: number): void {
		while (this.pos < offset) {
			this.advance();
		}
	}

	private skipWhitespace(): void {
		while (this.pos < this.text.length && /[\t ]/.test(this.text[this.pos])) {
			this.advance();
		}
	}

	// Determines whether the current position is the first non-whitespace
	// character on its line.
	private isLineStart(): boolean {
		if (this.pos === 0) {
			return true;
		}
		let i = this.pos - 1;
		while (i >= 0 && this.text[i] !== '\n') {
			if (this.text[i] !== ' ' && this.text[i] !== '\t') {
				return false;
			}
			i--;
		}
		return true;
	}

	// Scan a single-line comment starting at current pos ('//' or '#').
	private scanComment(): TokenInfo {
		const startPos = this.pos;
		const startLine = this.line;
		const startChar = this.char;
		if (this.text[this.pos] === '/' && this.peek() === '/') {
			this.advance(); // '/'
			this.advance(); // '/'
		} else {
			this.advance(); // '#'
		}
		while (this.pos < this.text.length && this.text[this.pos] !== '\n') {
			this.advance();
		}
		const text = this.text.substring(startPos, this.pos);
		return {
			type: 'comment',
			line: startLine,
			character: startChar,
			length: text.length,
			text
		};
	}

	// Scan a route label if current position begins with '//' followed by
	// non-whitespace.  Returns an array of tokens or null if not a label.
	private scanRouteLabel(): TokenInfo | null {
		if (this.text[this.pos] !== '/' || this.peek() !== '/') {
			return null;
		}
		// look ahead to see if next char after slashes is non-whitespace
		const after = this.text[this.pos + 2];
		if (after === ' ' || after === '\t' || after === '\n' || after === undefined) {
			return null; // regular comment
		}

		const startLine = this.line;
		const startChar = this.char;
		const lineStart = this.isLineStart();
		// consume the slashes
		this.advance();
		this.advance();
		const pathStartPos = this.pos;
		const pathStartChar = this.char;
		while (this.pos < this.text.length && !/[ \t\r\n]/.test(this.text[this.pos])) {
			this.advance();
		}
		const path = this.text.substring(pathStartPos, this.pos);
		// // is parsed but not emitted as a token if at line start
		const token:TokenInfo = {
			type: 'route-label',
			modifier: 'definition',
			line: startLine,
			character: pathStartChar,
			length: path.length,
			text: path
		};
		return token;
	}

	// Scan a media label that begins with '@' at the start of a line and
	// continues until the first whitespace. Returns a single TokenInfo or null.
	private scanMediaLabel(): TokenInfo | null {
		if (this.text[this.pos] !== '@') {
			return null;
		}
		if (!this.isLineStart()) {
			return null;
		}
		// look ahead to ensure next char is not whitespace
		const after = this.peek(1);
		if (after === ' ' || after === '\t' || after === '\n' || after === null) {
			return null;
		}
		const startLine = this.line;
		const startChar = this.char;
		// consume '@'
		this.advance();
		const nameStartChar = this.char;
		const nameStart = this.pos;
		while (this.pos < this.text.length && !/[ \t\r\n]/.test(this.text[this.pos])) {
			this.advance();
		}
		const name = this.text.substring(nameStart, this.pos);
		if (name.length === 0) {
			// nothing after @
			this.pos = nameStart; // already at nameStart
			this.line = startLine;
			this.char = startChar;
			return null;
		}
		return {
			type: 'media-label',
			modifier: 'definition',
			line: startLine,
			character: nameStartChar,
			length: name.length,
			text: name
		};
	}

	private isIdentifierStart(char: string): boolean {
		return /[a-zA-Z_]/.test(char);
	}

	private isIdentifierPart(char: string): boolean {
		return /[a-zA-Z0-9_]/.test(char);
	}

	private isDigit(char: string): boolean {
		return /\d/.test(char);
	}

	private scanStringOption(): TokenInfo | null {
		if (this.text[this.pos] !== '<') {
			return null;
		}
		const startPos = this.pos;
		const startLine = this.line;
		const startChar = this.char;

		this.advance(); // Opening <
		const contentStart = this.pos;

		// Scan until closing >
		while (this.pos < this.text.length && this.text[this.pos] !== '>') {
			this.advance();
		}

		// Must have closing >
		if (this.pos >= this.text.length || this.text[this.pos] !== '>') {
			// Not a valid string option, revert
			this.pos = startPos;
			this.line = startLine;
			this.char = startChar;
			return null;
		}

		const content = this.text.substring(contentStart, this.pos).trim();
		
		// Validate content format: must be either an identifier, or 'var' followed by an identifier
		let isValid = false;
		if (content.length > 0) {
			if (this.isIdentifierStart(content[0])) {
				// Check if entire content is valid identifier characters
				isValid = content.split('').every(c => this.isIdentifierPart(c));
			} else if (content.startsWith('var ')) {
				// Check format: 'var' followed by space and valid identifier
				const varPart = content.substring(4).trim();
				if (varPart.length > 0 && this.isIdentifierStart(varPart[0])) {
					isValid = varPart.split('').every(c => this.isIdentifierPart(c));
				}
			}
		}

		if (!isValid) {
			// Not a valid string option, revert
			this.pos = startPos;
			this.line = startLine;
			this.char = startChar;
			return null;
		}

		this.advance(); // Closing >

		const text = this.text.substring(startPos, this.pos);
		return {
			type: 'stringOption',
			line: startLine,
			character: startChar,
			length: text.length,
			text
		};
	}

	// Scan a jump target after '->' or 'jump' keyword. Assumes current
	// position is after the operator/keyword when called for 'jump'.
	private scanJumpTarget(): TokenInfo | null {
		// skip whitespace
		while (this.pos < this.text.length && /[\t ]/.test(this.text[this.pos])) {
			this.advance();
		}
		if (this.pos >= this.text.length) return null;
		if (!this.isIdentifierStart(this.text[this.pos])) return null;
		const startLine = this.line;
		const startChar = this.char;
		const startPos = this.pos;
		while (this.pos < this.text.length && this.isIdentifierPart(this.text[this.pos])) {
			this.advance();
		}
		const text = this.text.substring(startPos, this.pos);
		return {
			type: 'label',
			modifier: 'reference',
			line: startLine,
			character: startChar,
			length: text.length,
			text
		};
	}

	private scanIdentifierOrKeyword(): TokenInfo | null {
		const startPos = this.pos;
		const startLine = this.line;
		const startChar = this.char;

		while (this.pos < this.text.length && this.isIdentifierPart(this.text[this.pos])) {
			this.advance();
		}

		const text = this.text.substring(startPos, this.pos);
		const keywords = ['def', 'async', 'await', 'shared', 'import', 'if', 'elif', 'else', 'match', 'case', 'yield', 'return', 'break', 'continue', 'pass', 'raise', 'try', 'except', 'finally', 'with', 'class', 'while', 'for', 'in', 'is', 'and', 'or', 'not', 'lambda', 'on', 'change', 'signal'];
		
		// Special-case `jump` keyword: emit following identifier as label
		if (text === 'jump') {
			const jt = this.scanJumpTarget();
			return jt; // may be null if no valid target
		}

		if (text === 'yield') {
			const jt = this.scanJumpTarget();
			if (jt) {
				jt.type = "yield.result"
			}
			return jt;
		}

		// Special-case `on` keyword: check if followed by `change` or `signal`
		if (text === 'on') {
			let checkPos = this.pos;
			// skip whitespace
			while (checkPos < this.text.length && /[\t ]/.test(this.text[checkPos])) {
				checkPos++;
			}
			// peek ahead for 'change' or 'signal'
			const checkWord = this.text.substring(checkPos);
			if (/^signal\b/.test(checkWord)) {
				// lookahead found 'signal', set flag for next identifier
				this.expectSignalReference = true;
			}
			// exclude 'on' keyword
			return null;
		}

		const builtInConstants = ['True', 'False', 'None'];
		
// If expecting a plus-line label reference, handle it first so that
		// even keywords can be treated as references in this context.
		if (this.expectPlusLabelReference) {
			this.expectPlusLabelReference = false;
			return {
				type: 'label',
				modifier: 'reference',
				line: startLine,
				character: startChar,
				length: text.length,
				text
			};
		}

		if (builtInConstants.includes(text)) {
			return {
				type: 'builtInConstant',
				line: startLine,
				character: startChar,
				length: text.length,
				text
			};
		}
		
		if (keywords.includes(text)) {
			return null; // Keywords are parsed but not emitted
		}

		// If expecting a signal reference, emit as label with 'reference' modifier
		if (this.expectSignalReference) {
			this.expectSignalReference = false;
			return {
				type: 'label',
				modifier: 'reference',
				line: startLine,
				character: startChar,
				length: text.length,
				text
			};
		}

		// Check if this is a function call by looking for '(' after optional whitespace
		let checkPos = this.pos;
		while (checkPos < this.text.length && /[\t ]/.test(this.text[checkPos])) {
			checkPos++;
		}
		const isFunctionCall = checkPos < this.text.length && this.text[checkPos] === '(';

		if (isFunctionCall) {
			return {
				type: 'function',
				modifier: 'reference',
				line: startLine,
				character: startChar,
				length: text.length,
				text
			};
		}

		return {
			type: 'variable',
			line: startLine,
			character: startChar,
			length: text.length,
			text
		};
	}

	private scanNumber(): TokenInfo {
		const startPos = this.pos;
		const startLine = this.line;
		const startChar = this.char;

		// Hex, binary, octal
		if (this.text[this.pos] === '0' && (this.peek() === 'x' || this.peek() === 'X')) {
			this.advance(); // 0
			this.advance(); // x/X
			while (this.pos < this.text.length && (/[0-9a-fA-F_]/.test(this.text[this.pos]))) {
				this.advance();
			}
		} else if (this.text[this.pos] === '0' && (this.peek() === 'b' || this.peek() === 'B')) {
			this.advance(); // 0
			this.advance(); // b/B
			while (this.pos < this.text.length && (/[01_]/.test(this.text[this.pos]))) {
				this.advance();
			}
		} else if (this.text[this.pos] === '0' && (this.peek() === 'o' || this.peek() === 'O')) {
			this.advance(); // 0
			this.advance(); // o/O
			while (this.pos < this.text.length && (/[0-7_]/.test(this.text[this.pos]))) {
				this.advance();
			}
		} else {
			// Decimal
			while (this.pos < this.text.length && (this.isDigit(this.text[this.pos]) || this.text[this.pos] === '_')) {
				this.advance();
			}
			// Float
			if (this.text[this.pos] === '.' && this.isDigit(this.peek()!)) {
				this.advance(); // .
				while (this.pos < this.text.length && (this.isDigit(this.text[this.pos]) || this.text[this.pos] === '_')) {
					this.advance();
				}
			}
		}

		const text = this.text.substring(startPos, this.pos);
		return {
			type: 'number',
			line: startLine,
			character: startChar,
			length: text.length,
			text
		};
	}

	private scanString(quote: string): TokenInfo {
		const startPos = this.pos;
		const startLine = this.line;
		const startChar = this.char;
		
		this.advance(); // Opening quote
		while (this.pos < this.text.length && this.text[this.pos] !== quote) {
			if (this.text[this.pos] === '\\') {
				this.advance(); // Escape char
				if (this.pos < this.text.length) {
					this.advance(); // Escaped char
				}
			} else {
				this.advance();
			}
		}
		if (this.pos < this.text.length && this.text[this.pos] === quote) {
			this.advance(); // Closing quote
		}

		const text = this.text.substring(startPos, this.pos);
		return {
			type: 'string',
			line: startLine,
			character: startChar,
			length: text.length,
			text
		};
	}

	// Scan line-start strings: lines beginning with ' " or % are treated as strings
	private scanLineStartString(): TokenInfo {
		const startPos = this.pos;
		const startLine = this.line;
		const startChar = this.char;

		// Consume the entire line
		while (this.pos < this.text.length && this.text[this.pos] !== '\n') {
			this.advance();
		}

		const text = this.text.substring(startPos, this.pos);
		return {
			type: 'string',
			line: startLine,
			character: startChar,
			length: text.length,
			text
		};
	}

	private scanLabel(): TokenInfo[] {
		const tokens: TokenInfo[] = [];
		const startPos = this.pos;
		const startLine = this.line;
		const startChar = this.char;
		const current = this.text[this.pos];

		// Determine marker character (= - +) and collect leading markers
		let marker = '';
		if (current === '=' || current === '-' || current === '+') {
			const markerChar = current;
			while (this.pos < this.text.length && this.text[this.pos] === markerChar) {
				marker += this.text[this.pos];
				this.advance();
			}
		} else {
			return tokens;
		}

		// Must have at least 2 marker chars to be a label
		if (marker.length < 2) {
			// Not a label, revert position
			this.pos = startPos;
			this.line = startLine;
			this.char = startChar;
			return tokens;
		}

		// Leading marker is parsed but not emitted as a token

		// Skip whitespace after leading marker
		while (this.pos < this.text.length && /[\t ]/.test(this.text[this.pos])) {
			this.advance();
		}

		// Scan label name (identifier)
		const namePos = this.pos;
		const nameStartLine = this.line;
		const nameStartChar = this.char;

		if (!this.isIdentifierStart(this.text[this.pos])) {
			// No valid identifier after marker, revert
			this.pos = startPos;
			this.line = startLine;
			this.char = startChar;
			return [];
		}

		while (this.pos < this.text.length && this.isIdentifierPart(this.text[this.pos])) {
			this.advance();
		}

		const name = this.text.substring(namePos, this.pos);
		tokens.push({
			type: 'label',
			modifier: 'definition',
			line: nameStartLine,
			character: nameStartChar,
			length: name.length,
			text: name
		});

		// Skip whitespace before trailing marker
		while (this.pos < this.text.length && /[\t ]/.test(this.text[this.pos])) {
			this.advance();
		}

		// Check for trailing marker (optional)
		if (this.pos < this.text.length && this.text[this.pos] === marker[0]) {
			const trailingStartPos = this.pos;
			const trailingStartLine = this.line;
			const trailingStartChar = this.char;
			let trailing = '';

			while (this.pos < this.text.length && this.text[this.pos] === marker[0]) {
				trailing += this.text[this.pos];
				this.advance();
			}

			// Trailing marker is parsed but not emitted as a token
		}

		return tokens;
	}

	private scanOperator(): TokenInfo | null {
		const startPos = this.pos;
		const startLine = this.line;
		const startChar = this.char;
		const char = this.text[this.pos];
		const next = this.peek();

		// Multi-character operators
		const twoChar = char + (next || '');
		const multiOpRegex = /^(==|!=|<=|>=|<<|>>|\*\*|->)$/;
		if (multiOpRegex.test(twoChar)) {
			this.advance();
			this.advance();
			return {
				type: twoChar === '->' ? 'keyword' : 'operator',
				line: startLine,
				character: startChar,
				length: 2,
				text: twoChar
			};
		}

		// Single character operators
		if (/[+\-*/%&|^~<>=]/.test(char)) {
			this.advance();
			return {
				type: 'operator',
				line: startLine,
				character: startChar,
				length: 1,
				text: char
			};
		}

		return null;
	}

	private scanStyleDefRef() : TokenInfo | null {
		debug("Scanning for Style Definitions")
		this.skipWhitespace();
		debug("Checking: " + this.text[this.pos])
		if (this.pos < this.text.length && this.text[this.pos] === "[") {
			const startChar = this.char;
			const startPos = this.pos;
			while (this.pos < this.text.length && this.text[this.pos] !== "]") {
				this.advance();
			}
			const name = this.text.substring(startPos, this.pos);
			debug("Style Def found.")
			return {
				type: 'style-definition',
				modifier: 'reference',
				line: this.line,
				character: startChar,
				length: name.length,
				text: name
			}
		}
		debug("No style def found.")
		return null;
	}

	private scanCommsMessage(): TokenInfo[] {
		const tokenList:TokenInfo[] = [];
		const styleDef = this.scanStyleDefRef();
		if (styleDef) {
			tokenList.push(styleDef);
			this.advance();
		}
		this.skipWhitespace();
		if (this.text[this.pos] === '"' || this.text[this.pos] === "'") {
			const str = this.scanString(this.text[this.pos]);
			// if (str) {
			// 	tokenList.push(str);
			// }
		}
		this.skipWhitespace();
		if (this.text[this.pos] === ":") {
			tokenList.push({
				type: 'trigger-indent',
				line: this.line,
				character: this.char,
				length: 1,
				text: ":"
			})
			return tokenList;
		}
		let lbl = null;
		if (this.text[this.pos] === "/" && this.peek() === "/") {
			lbl = this.scanRouteLabel();
		} else {
			lbl = this.scanJumpTarget();
		}
		if (lbl) {
			tokenList.push(lbl);
		}
		return tokenList;
	}

	public tokenize(): TokenInfo[] {
		this.tokens = [];
		this.pos = 0;
		this.line = 0;
		this.char = 0;
		let inYaml = false;

		while (this.pos < this.text.length) {
			// YAML block detection: must start with three backticks, optionally
			// preceded by a name and colon.  e.g. "metadata: ```" or "```".
			if (!inYaml && this.isLineStart()) {
				const rest = this.text.substring(this.pos);
				if (/^\s*(?:[A-Za-z_]\w*:\s*)?`{3}/.test(rest)) {
					inYaml = true;
					// consume rest of the opening line
					while (this.pos < this.text.length && this.text[this.pos] !== '\n') {
						this.advance();
					}
					continue;
				}
			}
			if (inYaml) {
				// look for closing ``` at line start
				if (this.isLineStart()) {
					const rest2 = this.text.substring(this.pos);
					if (/^\s*`{3}/.test(rest2)) {
						inYaml = false;
						while (this.pos < this.text.length && this.text[this.pos] !== '\n') {
							this.advance();
						}
						continue;
					} else {
						const id = this.scanIdentifierOrKeyword();
						if (id) {
							id.type = 'yaml.key'
							this.tokens.push(id);
						}
						continue;
					}
				}
				// otherwise skip current character
				this.advance();
				continue;
			}

			const current = this.text[this.pos];

			// when a plus directive is in effect, skip any whitespace or
			// optional bracketed metadata before the string itself.
			if (this.expectPlusDirective) {
				if (current === '[') {
					this.advance();
					while (this.pos < this.text.length && this.text[this.pos] !== ']') {
						this.advance();
					}
					if (this.pos < this.text.length && this.text[this.pos] === ']') {
						this.advance();
					}
					continue;
				}
				if (current === ' ' || current === '\t') {
					this.advance();
					continue;
				}
			}
			if (this.isLineStart() && (current === '"' || current === "'" || current === '%')) {
				this.scanLineStartString(); // Parse but don't emit
				continue;
			}

			// Route label definitions take precedence over comments.  They
			// begin with // followed by non-whitespace and run until the
			// first space or newline.
			if (current === '/' && this.peek() === '/') {
				const routeToken = this.scanRouteLabel();
				if (routeToken) {
					this.tokens.push(routeToken);
					continue;
				}
			}

			// Media labels: @name at line start
			if (current === '@' && this.isLineStart()) {
				const m = this.scanMediaLabel();
				if (m) {
					this.tokens.push(m);
					continue;
				}
			}

			// Lines beginning with a single '+' are a special directive.  We
			// emit the plus itself as a keyword and then mark the state so that
			// the first string that follows triggers a label reference expectation.
			if (current === '+' && this.isLineStart()) {
				// ensure we don't treat '++' or '+=' etc as this directive
				const nxt = this.peek();
				if (nxt !== '+' && nxt !== '=') {
					this.tokens.push({
						type: 'keyword',
						line: this.line,
						character: this.char,
						length: 1,
						text: '+'
					});
					this.advance();
					const cms = this.scanCommsMessage()
					this.tokens = this.tokens.concat(this.tokens, cms);
					this.advance();
					continue;
				}
			}

			// Check for message sending stuff
			if (current === "<" && this.isLineStart() && this.peek()=== "<") {
				this.tokens.push({
					type: 'keyword',
					line: this.line,
					character: this.char,
					length: 2,
					text: '<<'
				});
				this.advance();
				this.advance();
				const cms = this.scanCommsMessage()
				this.tokens = this.tokens.concat(this.tokens, cms);
				this.advance();
				continue;
			}

			// Comments
			//#region Comments
			if (current === '#') {
				const token = this.scanComment();

				// search inside comment text for codetag markers
				const codetagRegex = /\b(?:NOTE|XXX|HACK|FIXME|BUG|TODO|INFO|WARNING|WARN|ERROR|ERR)\b/;
				let m: RegExpExecArray | null;
				// use global regex to find all occurrences
				const globalRe = new RegExp(codetagRegex.source, 'gi');
				const codetagMatches: Array<{ index: number; length: number; text: string }> = [];
				while ((m = globalRe.exec(token.text)) !== null) {
					codetagMatches.push({ index: m.index, length: m[0].length, text: m[0] });
				}

				// If there are codetags, emit comment in segments around them
				if (codetagMatches.length > 0) {
					let lastEnd = 0;
					for (const match of codetagMatches) {
						// Emit comment segment before codetag
						if (match.index > lastEnd) {
							this.tokens.push({
								type: 'comment',
								line: token.line,
								character: token.character + lastEnd,
								length: match.index - lastEnd,
								text: token.text.substring(lastEnd, match.index)
							});
						}
						// Emit codetag token
						this.tokens.push({
							type: 'codetag',
							line: token.line,
							character: token.character + match.index,
							length: match.length,
							text: match.text
						});
						lastEnd = match.index + match.length;
					}
					// Emit remaining comment segment after last codetag
					if (lastEnd < token.text.length) {
						this.tokens.push({
							type: 'comment',
							line: token.line,
							character: token.character + lastEnd,
							length: token.text.length - lastEnd,
							text: token.text.substring(lastEnd)
						});
					}
				} else {
					// No codetags, emit as normal comment
					this.tokens.push(token);
				}
				continue;
			}
			//#endregion

			// Strings (inline)
			// Check for f-string prefix (f"..." or f'...')
			if ((current === 'f' || current === 'F') && this.pos + 1 < this.text.length) {
				const next = this.text[this.pos + 1];
				if (next === '"' || next === "'") {
					this.advance(); // skip the 'f' prefix
					this.scanString(next); // Parse but don't emit
					continue;
				}
			}

			if (current === '"' || current === "'") {
				// handle plus directive
				if (this.expectPlusDirective) {
					this.expectPlusDirective = false;
					this.expectPlusLabelReference = true;
				}
				this.scanString(current); // Parse but don't emit
				continue;
			}

			// Identifiers / keywords / function calls
			if (this.isIdentifierStart(current)) {
				const token = this.scanIdentifierOrKeyword();
				if (token) {
					this.tokens.push(token);
				}
				continue;
			}

			// Labels (at line start only): ==name== or --name-- or ++name++
			if (this.isLineStart() && (current === '=' || current === '-' || current === '+')) {
				const labelTokens = this.scanLabel();
				if (labelTokens.length > 0) {
					// Labels are parsed but not emitted as tokens
					continue;
				}
			}

			// Operators
			if (/[+\-*/%&|^~<>=]/.test(current)) {
				const token = this.scanOperator();
				if (token) {
					if (token.text === '->') {
						this.tokens.push(token);
						const jt = this.scanJumpTarget();
						if (jt) this.tokens.push(jt);
					} else {
						this.tokens.push(token);
					}
				}
				continue;
			}

			// anything else, just advance
			this.advance();
		}

		// Sort by offset
		this.tokens.sort((a, b) => {
			const aOffset = this.doc.offsetAt({ line: a.line, character: a.character });
			const bOffset = this.doc.offsetAt({ line: b.line, character: b.character });
			return aOffset - bOffset;
		});

		return this.tokens;
	}

	public getTokens(): TokenInfo[] {
		return this.tokens;
	}
}

/**
 * Converts TokenInfo array to SemanticTokens format for LSP
 */
export function buildSemanticTokens(tokens: TokenInfo[]): SemanticTokens {
	const builder = new SemanticTokensBuilder();

	for (const token of tokens) {
		const typeIndex = TOKEN_TYPES.indexOf(token.type as any);
		if (typeIndex === -1) {
			debug(`Unknown token type: ${token.type}`);
			continue;
		}

		const modifierIndex = token.modifier 
			? TOKEN_MODIFIERS.indexOf(token.modifier as any)
			: 0;

		builder.push(
			token.line,
			token.character,
			token.length,
			typeIndex,
			modifierIndex === -1 ? 0 : (1 << modifierIndex)
		);
	}

	return builder.build();
}

/**
 * Get semantic tokens for a document
 */
export function getSemanticTokens(document: TextDocument): SemanticTokens {
	// Use regex-based lexer (set to false to benchmark state machine)
	const USE_REGEX_LEXER = document.uri.includes("gamemaster");
	
	let tokens: TokenInfo[];
	if (USE_REGEX_LEXER) {
		const lexer = new MastLexer(document);
		tokens = lexer.tokenize();
	} else {
		const lexer = new MastStateMachineLexer(document);
		tokens = lexer.tokenize();
	}
	
	return buildSemanticTokens(tokens);
}

/**
 * Build empty semantic tokens (for error cases)
 */
export function getEmptySemanticTokens(): SemanticTokens {
	return new SemanticTokensBuilder().build();
}
