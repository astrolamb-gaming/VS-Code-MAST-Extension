import { debug } from 'console';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SemanticTokens, SemanticTokensBuilder, integer } from 'vscode-languageserver';
// regex-based helpers are used by the original MastLexer for backwards
// compatibility/benchmarking but the state-machine lexer should avoid them
// entirely.  We still need the CRange type for range bookkeeping.
// the regex helpers are still required by MastLexer
import { CRange } from '../tokens/comments';
import { Token } from '../tokens/tokens';
import { getCache } from '../cache';
import { variableModifiers } from '../tokens/variables';
import { convertVariableTokensToLabelOrFunction } from './semanticTokensCache';

/**
 * Semantic token types supported by the MAST language server.
 * Must match the tokenTypes array in server.ts capabilities.
 */
export const TOKEN_TYPES = [
	'keyword',           // 0
	'lambda',
	'label',             // 1
	'module',
	'variable',          // 2
	'string',            // 3
	'comment',           // 4
	'function',          // 5
	'method',            // 6
	'property',          // 7
	'class',             // 8
	'operator',          // 9
	'number',            // 10
	'route-label',       // 11
	'media-label',       // 12
	'resource-label',    // 13
	'builtInConstant',   // 14
	'stringOption',      // 15
	'yaml.key',          // 16
	'yaml.value',        // 17
	'codetag',           // 18
	'style-definition',
	'comms.button'
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

// /**
//  * Single-pass lexer for MAST language files
//  * Combines all token parsing into one efficient scan
//  */
// export class MastLexer {
// 	private doc: TextDocument;
// 	private text: string;
// 	private tokens: TokenInfo[] = [];
// 	private commentRanges: CRange[] = [];
// 	private stringRanges: CRange[] = [];
// 	private yamlRanges: CRange[] = [];
// 	private operatorExclusionRanges: CRange[] = [];

// 	constructor(document: TextDocument) {
// 		this.doc = document;
// 		this.text = document.getText();
// 		// MastLexer continues to use regex helpers; keep original initialization
// 		this.commentRanges = []//getComments(document);
// 		this.stringRanges = []//getStrings(document);
// 		this.yamlRanges = []//getYamls(document);
// 	}

// 	/**
// 	 * Checks if an offset is within a string, comment, or yaml block
// 	 */
// 	private isInExcludedRegion(offset: integer): boolean {
// 		return this.isInRange(offset, this.stringRanges) ||
// 			   this.isInRange(offset, this.commentRanges) ||
// 			   this.isInRange(offset, this.yamlRanges) ||
// 			   this.isInRange(offset, this.operatorExclusionRanges);
// 	}

// 	private isInRange(offset: integer, ranges: CRange[]): boolean {
// 		for (const range of ranges) {
// 			if (offset >= range.start && offset <= range.end) {
// 				return true;
// 			}
// 		}
// 		return false;
// 	}

// 	/**
// 	 * Tokenize the entire document in a single pass
// 	 */
// 	public tokenize(): TokenInfo[] {
// 		this.tokens = [];
// 		this.operatorExclusionRanges = [];
		
// 		// Process in order of priority to avoid overlaps
// 		this.scanStrings();
// 		this.scanComments();
// 		this.scanLabels();
// 		this.scanKeywords();
// 		this.scanArrowOperators();
// 		this.scanVariableDefinitions();
// 		this.scanFunctionDefinitions();
// 		this.scanClassDefinitions();
// 		this.scanOperators();
// 		this.scanNumbers();
		
// 		// Sort by offset for semantic tokens builder
// 		this.tokens.sort((a, b) => {
// 			const aOffset = this.doc.offsetAt({ line: a.line, character: a.character });
// 			const bOffset = this.doc.offsetAt({ line: b.line, character: b.character });
// 			return aOffset - bOffset;
// 		});

// 		return this.tokens;
// 	}

// 	private scanStrings(): void {
// 		for (const range of this.stringRanges) {
// 			const start = this.doc.positionAt(range.start);
// 			const text = this.text.substring(range.start, range.end);
// 			this.tokens.push({
// 				type: 'string',
// 				line: start.line,
// 				character: start.character,
// 				length: range.end - range.start,
// 				text
// 			});
// 		}
// 	}

// 	private scanComments(): void {
// 		for (const range of this.commentRanges) {
// 			const start = this.doc.positionAt(range.start);
// 			const text = this.text.substring(range.start, range.end);
// 			this.tokens.push({
// 				type: 'comment',
// 				line: start.line,
// 				character: start.character,
// 				length: range.end - range.start,
// 				text
// 			});
// 		}
// 	}

// 	private scanLabels(): void {
// 		// Main labels: ==label_name==
// 		const mainLabelRegex = /^([ \t]*)(={2,}[ \t]*)(\w+)([ \t]*(={2,})?)/gm;
// 		let match: RegExpExecArray | null;
		
// 		while ((match = mainLabelRegex.exec(this.text)) !== null) {
// 			if (!this.isInExcludedRegion(match.index)) {
// 				const labelName = match[3];
// 				const offset = match.index + match[0].indexOf(labelName);
// 				const pos = this.doc.positionAt(offset);
// 				this.tokens.push({
// 					type: 'label',
// 					modifier: 'definition',
// 					line: pos.line,
// 					character: pos.character,
// 					length: labelName.length,
// 					text: labelName
// 				});

// 				// Treat the leading operator sequence (e.g. ==) as a keyword when at line start
// 				const opRaw = match[2];
// 				const opText = opRaw.trim();
// 				if (/^=+$/.test(opText)) {
// 					const opOffset = match.index + match[0].indexOf(opRaw) + (opRaw.indexOf(opText) || 0);
// 					const opPos = this.doc.positionAt(opOffset);
// 					this.tokens.push({
// 						type: 'keyword',
// 						line: opPos.line,
// 						character: opPos.character,
// 						length: opText.length,
// 						text: opText
// 					});
// 				}

// 				// Treat trailing operator sequence (e.g. trailing ==) as a keyword
// 				const trailingRaw = match[4];
// 				if (trailingRaw) {
// 					const trailingText = trailingRaw.trim();
// 					if (/^=+$/.test(trailingText)) {
// 						const trailingOffset = match.index + match[0].indexOf(trailingRaw) + (trailingRaw.indexOf(trailingText) || 0);
// 						const trailingPos = this.doc.positionAt(trailingOffset);
// 						this.tokens.push({
// 							type: 'keyword',
// 							line: trailingPos.line,
// 							character: trailingPos.character,
// 							length: trailingText.length,
// 							text: trailingText
// 						});
// 					}
// 				}

// 				// Exclude the entire matched label span from operator scanning
// 				const labelStart = match.index;
// 				const labelEnd = match.index + match[0].length;
// 				this.operatorExclusionRanges.push({ start: labelStart, end: labelEnd });
// 			}
// 		}

// 		// Inline labels: --label_name-- or ++label_name++
// 		const inlineLabelRegex = /^([ \t]*)((-|\+){2,}[ \t]*)(\w+)([ \t]*((-|\+){2,})?)/gm;
// 		while ((match = inlineLabelRegex.exec(this.text)) !== null) {
// 			if (!this.isInExcludedRegion(match.index)) {
// 				const labelName = match[4];
// 				const offset = match.index + match[0].indexOf(labelName);
// 				const pos = this.doc.positionAt(offset);
// 				this.tokens.push({
// 					type: 'label',
// 					modifier: 'definition',
// 					line: pos.line,
// 					character: pos.character,
// 					length: labelName.length,
// 					text: labelName
// 				});

// 				// Treat the leading operator sequence (e.g. --) as a keyword when at line start
// 				const opRawInline = match[2];
// 				const opTextInline = opRawInline.trim();
// 				if (/^-+$/.test(opTextInline) || /^\++$/.test(opTextInline)) {
// 					const opOffset = match.index + match[0].indexOf(opRawInline) + (opRawInline.indexOf(opTextInline) || 0);
// 					const opPos = this.doc.positionAt(opOffset);
// 					this.tokens.push({
// 						type: 'keyword',
// 						line: opPos.line,
// 						character: opPos.character,
// 						length: opTextInline.length,
// 						text: opTextInline
// 					});
// 				}

// 				// Treat trailing operator sequence (e.g. trailing -- or ++) as a keyword
// 				const trailingRawInline = match[5];
// 				if (trailingRawInline) {
// 					const trailingTextInline = trailingRawInline.trim();
// 					if (/^-+$/.test(trailingTextInline) || /^\++$/.test(trailingTextInline)) {
// 						const trailingOffset = match.index + match[0].indexOf(trailingRawInline) + (trailingRawInline.indexOf(trailingTextInline) || 0);
// 						const trailingPos = this.doc.positionAt(trailingOffset);
// 						this.tokens.push({
// 							type: 'keyword',
// 							line: trailingPos.line,
// 							character: trailingPos.character,
// 							length: trailingTextInline.length,
// 							text: trailingTextInline
// 						});
// 					}
// 				}

// 				// Exclude the entire matched label span from operator scanning
// 				const labelStart = match.index;
// 				const labelEnd = match.index + match[0].length;
// 				this.operatorExclusionRanges.push({ start: labelStart, end: labelEnd });
// 			}
// 		}

// 		// Route labels: //label_name or //label_name/subroute
// 		const routeLabelRegex = /^([ \t]*)(\/{2,})(\w+)(\/\w+)*/gm;
// 		while ((match = routeLabelRegex.exec(this.text)) !== null) {
// 			if (!this.isInExcludedRegion(match.index)) {
// 				const labelName = match[3];
// 				const offset = match.index + match[0].indexOf(labelName);
// 				const pos = this.doc.positionAt(offset);
// 				this.tokens.push({
// 					type: 'route-label',
// 					modifier: 'definition',
// 					line: pos.line,
// 					character: pos.character,
// 					length: labelName.length,
// 					text: labelName
// 				});

// 				// Treat the leading slashes (e.g. //) as a keyword when at line start
// 				const opRawRoute = match[2];
// 				const opTextRoute = opRawRoute.trim();
// 				if (/^\/+$/ .test(opTextRoute)) {
// 					const opOffset = match.index + match[0].indexOf(opRawRoute) + (opRawRoute.indexOf(opTextRoute) || 0);
// 					const opPos = this.doc.positionAt(opOffset);
// 					this.tokens.push({
// 						type: 'keyword',
// 						line: opPos.line,
// 						character: opPos.character,
// 						length: opTextRoute.length,
// 						text: opTextRoute
// 					});
// 				}

// 					// Exclude the entire matched route label span from operator scanning
// 					const labelStart = match.index;
// 					const labelEnd = match.index + match[0].length;
// 					this.operatorExclusionRanges.push({ start: labelStart, end: labelEnd });
// 			}
// 		}

// 		// Inline route labels: //label_name/subroute that can appear anywhere in a line (not just at start)
// 		const inlineRouteLabelRegex = /(\/{2,})(\w+)(\/\w+)*/g;
// 		while ((match = inlineRouteLabelRegex.exec(this.text)) !== null) {
// 			// Skip if this was already matched by the line-start route label regex
// 			if (!this.isInExcludedRegion(match.index)) {
// 				const priorNewline = this.text.lastIndexOf('\n', match.index - 1);
// 				const prefix = this.text.substring(priorNewline + 1, match.index);
				
// 				// Only process if this is NOT at the start of a line (line-start patterns already handled above)
// 				if (!/^\s*$/.test(prefix)) {
// 					const labelName = match[2];
// 					const offset = match.index + match[0].indexOf(labelName);
// 					const pos = this.doc.positionAt(offset);
// 					this.tokens.push({
// 						type: 'route-label',
// 						modifier: 'definition',
// 						line: pos.line,
// 						character: pos.character,
// 						length: labelName.length,
// 						text: labelName
// 					});

// 					// Exclude the entire matched route label span from operator scanning
// 					const labelStart = match.index;
// 					const labelEnd = match.index + match[0].length;
// 					this.operatorExclusionRanges.push({ start: labelStart, end: labelEnd });
// 				}
// 			}
// 		}
// 	}

// 	private scanKeywords(): void {
// 		const keywordRegex = /\b(def|async|on\s+change|await|global|shared|nonlocal|assigned|temp|client|default|import|if|else|match|case|yield|return|break|continue|pass|raise|try|except|finally|with|class|while|for|in|is|and|or|not|lambda|True|False|None|jump)\b/gi;
// 		let match: RegExpExecArray | null;
// 		while ((match = keywordRegex.exec(this.text)) !== null) {
// 			if (!this.isInExcludedRegion(match.index)) {
// 				const pos = this.doc.positionAt(match.index);
// 				this.tokens.push({
// 					type: 'keyword',
// 					line: pos.line,
// 					character: pos.character,
// 					length: match[0].length,
// 					text: match[0]
// 				});
// 			}
// 		}
// 	}

// 	private scanArrowOperators(): void {
// 		// Arrow operator: ->
// 		const arrowRegex = /->/g;
// 		let match: RegExpExecArray | null;
// 		while ((match = arrowRegex.exec(this.text)) !== null) {
// 			if (!this.isInExcludedRegion(match.index)) {
// 				const pos = this.doc.positionAt(match.index);
// 				this.tokens.push({
// 					type: 'keyword',
// 					line: pos.line,
// 					character: pos.character,
// 					length: 2,
// 					text: '->'
// 				});
// 			}
// 		}
// 	}

// 	private scanVariableDefinitions(): void {
// 		// Variable/style assignments: name = value or $style_name = value
// 		// Modifiers: default, shared, assigned, client, temp
// 		const varDefRegex = /^[\t ]*(default[ \t]+)?((shared|assigned|client|temp)[ \t]+)?(\$?[a-zA-Z_]\w*)[\t ]*(?==[^=])/gm;
// 		let match: RegExpExecArray | null;
		
// 		while ((match = varDefRegex.exec(this.text)) !== null) {
// 			if (!this.isInExcludedRegion(match.index)) {
// 				const varName = match[4];
// 				const offset = match.index + match[0].indexOf(varName);
// 				const pos = this.doc.positionAt(offset);
// 				this.tokens.push({
// 					type: varName.startsWith('$') ? 'style-definition' : 'variable',
// 					modifier: 'definition',
// 					line: pos.line,
// 					character: pos.character,
// 					length: varName.length,
// 					text: varName
// 				});
// 			}
// 		}
// 	}

// 	private scanFunctionDefinitions(): void {
// 		// Function definitions: def function_name(...)
// 		const funcDefRegex = /\bdef\s+([a-zA-Z_]\w*)\s*\(/gi;
// 		let match: RegExpExecArray | null;
		
// 		while ((match = funcDefRegex.exec(this.text)) !== null) {
// 			if (!this.isInExcludedRegion(match.index)) {
// 				const funcName = match[1];
// 				const offset = match.index + match[0].indexOf(funcName);
// 				const pos = this.doc.positionAt(offset);
// 				this.tokens.push({
// 					type: 'function',
// 					modifier: 'definition',
// 					line: pos.line,
// 					character: pos.character,
// 					length: funcName.length,
// 					text: funcName
// 				});
// 			}
// 		}

// 		// Async function definitions: async def function_name(...)
// 		const asyncFuncDefRegex = /\basync\s+def\s+([a-zA-Z_]\w*)\s*\(/gi;
// 		while ((match = asyncFuncDefRegex.exec(this.text)) !== null) {
// 			if (!this.isInExcludedRegion(match.index)) {
// 				const funcName = match[1];
// 				const offset = match.index + match[0].indexOf(funcName);
// 				const pos = this.doc.positionAt(offset);
// 				this.tokens.push({
// 					type: 'function',
// 					modifier: 'definition',
// 					line: pos.line,
// 					character: pos.character,
// 					length: funcName.length,
// 					text: funcName
// 				});
// 			}
// 		}
// 	}

// 	private scanClassDefinitions(): void {
// 		// Class definitions: class ClassName(...)
// 		const classDefRegex = /\bclass\s+([a-zA-Z_]\w*)/gi;
// 		let match: RegExpExecArray | null;
		
// 		while ((match = classDefRegex.exec(this.text)) !== null) {
// 			if (!this.isInExcludedRegion(match.index)) {
// 				const className = match[1];
// 				const offset = match.index + match[0].indexOf(className);
// 				const pos = this.doc.positionAt(offset);
// 				this.tokens.push({
// 					type: 'class',
// 					modifier: 'definition',
// 					line: pos.line,
// 					character: pos.character,
// 					length: className.length,
// 					text: className
// 				});
// 			}
// 		}
// 	}

// 	private scanOperators(): void {
// 		// Common operators: =, ==, !=, <=, >=, <, >, +, -, *, /, //, %, **, &, |, ^, ~, <<, >>
// 		const operatorRegex = /(==|!=|<=|>=|<<|>>|\*\*|[+\-*/%&|^~<>=])/g;
// 		let match: RegExpExecArray | null;
		
// 		while ((match = operatorRegex.exec(this.text)) !== null) {
// 			if (!this.isInExcludedRegion(match.index)) {
// 				// Skip operator tokens that are purely sequences of '=', '+', '-', or '/' at line start
// 				const opText = match[0];
// 				const priorNewline = this.text.lastIndexOf('\n', match.index - 1);
// 				const prefix = this.text.substring(priorNewline + 1, match.index);
// 				if (/^\s*$/.test(prefix) && (/^=+$/.test(opText) || /^-+$/.test(opText) || /^\++$/.test(opText) || /^\/+$/ .test(opText))) {
// 					continue;
// 				}
// 				const pos = this.doc.positionAt(match.index);
// 				this.tokens.push({
// 					type: 'operator',
// 					line: pos.line,
// 					character: pos.character,
// 					length: match[0].length,
// 					text: match[0]
// 				});
// 			}
// 		}
// 	}

// 	private scanNumbers(): void {
// 		// Numbers: integers, floats, hex, binary, octal
// 		const numberRegex = /\b(0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|\d+\.\d+|\d+)\b/g;
// 		let match: RegExpExecArray | null;
		
// 		while ((match = numberRegex.exec(this.text)) !== null) {
// 			if (!this.isInExcludedRegion(match.index)) {
// 				const pos = this.doc.positionAt(match.index);
// 				this.tokens.push({
// 					type: 'number',
// 					line: pos.line,
// 					character: pos.character,
// 					length: match[0].length,
// 					text: match[0]
// 				});
// 			}
// 		}
// 	}

// 	public getTokens(): TokenInfo[] {
// 		return this.tokens;
// 	}
// }

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
	private expectImportModuleReference: boolean = false;
	private expectFromModuleReference: boolean = false;
	private expectFromImportedReference: boolean = false;
	private inFromImportStatement: boolean = false;
	private activeLineStringDelimiter: string | null = null;
	// When a line begins with a single '+' we expect a string to follow;
	// after that string the next identifier should be treated as a label reference.
	private expectPlusDirective: boolean = false;
	private expectPlusLabelReference: boolean = false;
	private knownLabelNames: Set<string> = new Set();
	private knownSubLabelNamesByRange: Array<{ start: number; end: number; names: Set<string> }> = [];

	private addKnownLabelName(name: string): void {
		const n = (name || '').trim();
		if (!n) return;

		this.knownLabelNames.add(n.toLowerCase());
		if (n.startsWith('//')) {
			this.knownLabelNames.add(n.substring(2).toLowerCase());
		} else {
			this.knownLabelNames.add(`//${n}`.toLowerCase());
		}
	}

	private hydrateKnownLabelsFromCache(): void {
		try {
			if (!this.doc?.uri || this.doc.uri.trim() === '') {
				return;
			}
			const cache = getCache(this.doc.uri);
			const labels = cache.getLabels(this.doc, false);
			for (const current of labels) {
				if (!current) continue;
				// Inline (+/-) labels are scope-local sublabels. Keep them out of the global
				// known-label set so they don't leak into other scopes.
				if (current.type !== 'inline') {
					this.addKnownLabelName(current.name || '');
				}
			}

			const thisFileLabels = cache.getLabels(this.doc, true);
			for (const main of thisFileLabels) {
				if (!main || !Array.isArray(main.subLabels) || main.subLabels.length === 0) {
					continue;
				}
				const names = new Set<string>();
				for (const sub of main.subLabels) {
					const n = (sub?.name || '').trim().toLowerCase();
					if (n) {
						names.add(n);
					}
				}
				if (names.size > 0) {
					this.knownSubLabelNamesByRange.push({
						start: Math.max(0, main.start || 0),
						end: Math.max(0, main.end || 0),
						names
					});
				}
			}
		} catch (e) {
			debug(`hydrateKnownLabelsFromCache failed: ${e}`);
		}
	}

	private hydrateKnownLabelsFromDocumentText(): void {
		// Main labels: ==name==
		const mainLabelRegex = /^([ \t]*)(={2,}[ \t]*)(\w+)([ \t]*(={2,})?)/gm;
		let m: RegExpExecArray | null;
		while ((m = mainLabelRegex.exec(this.text)) !== null) {
			this.addKnownLabelName(m[3]);
		}

		// NOTE: Inline labels (--name-- / ++name++) are scope-local and are
		// intentionally not added to global known labels.

		// Route labels: //name or //name/subroute
		const routeLabelRegex = /^([ \t]*)(\/{2,}\w+(?:\/\w+)*)/gm;
		while ((m = routeLabelRegex.exec(this.text)) !== null) {
			this.addKnownLabelName(m[2]);
		}

		// Media labels: @name
		const mediaLabelRegex = /^([ \t]*)@([\w\/]+)/gm;
		while ((m = mediaLabelRegex.exec(this.text)) !== null) {
			this.addKnownLabelName(m[2]);
		}
	}

	constructor(document: TextDocument, knownLabelNames?: Set<string>) {
		this.doc = document;
		this.text = document.getText();
		if (knownLabelNames) {
			for (const name of knownLabelNames) {
				this.addKnownLabelName(name);
			}
		}
		this.hydrateKnownLabelsFromCache();
		this.hydrateKnownLabelsFromDocumentText();
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
				this.expectImportModuleReference = false;
				this.expectFromModuleReference = false;
				this.expectFromImportedReference = false;
				this.inFromImportStatement = false;
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

	// Scan a block comment starting at current pos ('/*') and ending at the
	// next '*/' or EOF. Returns one comment token per covered line.
	private scanBlockComment(): TokenInfo[] {
		const tokens: TokenInfo[] = [];
		const startPos = this.pos;
		const startLine = this.line;
		const startChar = this.char;

		this.advance(); // '/'
		this.advance(); // '*'

		while (this.pos < this.text.length) {
			if (this.text[this.pos] === '*' && this.peek() === '/') {
				this.advance(); // '*'
				this.advance(); // '/'
				break;
			}
			this.advance();
		}

		const fullText = this.text.substring(startPos, this.pos);
		const lines = fullText.split('\n');
		for (let i = 0; i < lines.length; i++) {
			const lineText = lines[i];
			// Keep newline width on non-final lines so the full span remains covered.
			const tokenLength = i < lines.length - 1 ? lineText.length + 1 : lineText.length;
			if (tokenLength === 0) {
				continue;
			}
			tokens.push({
				type: 'comment',
				line: startLine + i,
				character: i === 0 ? startChar : 0,
				length: tokenLength,
				text: lineText
			});
		}

		return tokens;
	}

	// Scan a route label if current position begins with '//' followed by
	// non-whitespace.  Returns an array of tokens or null if not a label.
	private scanRouteLabel(): TokenInfo | null {
		if (this.text[this.pos] !== '/' || this.peek() !== '/') {
			return null;
		}
		if (!this.isLineStart()) {
			return null;
		}
		// look ahead to see if next char after slashes is non-whitespace
		const after = this.text[this.pos + 2];
		if (after === ' ' || after === '\t' || after === '\n' || after === undefined) {
			return null; // regular comment
		}

		const startLine = this.line;
		const startChar = this.char;
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

	// Scan an inline route label reference (//foo/bar) and emit it only if it
	// is known in the current label set. If unknown, do not consume input.
	private scanInlineRouteReference(requireKnown = true): TokenInfo | null {
		if (this.text[this.pos] !== '/' || this.peek() !== '/') {
			return null;
		}
		const startPos = this.pos;
		const startLine = this.line;
		const startChar = this.char;

		// look ahead to see if next char after slashes is non-whitespace
		const after = this.text[this.pos + 2];
		if (after === ' ' || after === '\t' || after === '\n' || after === undefined) {
			return null;
		}

		// consume the reference candidate
		this.advance();
		this.advance();
		while (this.pos < this.text.length && !/[ \t\r\n]/.test(this.text[this.pos])) {
			this.advance();
		}

		const candidate = this.text.substring(startPos, this.pos);
		if (requireKnown && !this.isKnownLabelReferenceName(candidate)) {
			// Unknown route; revert so normal tokenization can handle it.
			this.pos = startPos;
			this.line = startLine;
			this.char = startChar;
			return null;
		}

		return {
			type: 'route-label',
			modifier: 'reference',
			line: startLine,
			character: startChar,
			length: candidate.length,
			text: candidate
		};
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

	private isHexDigit(char: string): boolean {
		return /[0-9a-fA-F]/.test(char);
	}

	// Treat #RGB, #RGBA, #RRGGBB, #RRGGBBAA as YAML value color literals,
	// not comment starts.
	private isYamlColorCodeAt(lineText: string, hashIndex: number): boolean {
		if (lineText[hashIndex] !== '#') {
			return false;
		}

		const prev = hashIndex > 0 ? lineText[hashIndex - 1] : ' ';
		if (prev !== ' ' && prev !== '\t' && prev !== ':' && prev !== '[' && prev !== ',') {
			return false;
		}

		for (const len of [3, 4, 6, 8]) {
			const end = hashIndex + 1 + len;
			if (end > lineText.length) {
				continue;
			}

			let allHex = true;
			for (let i = hashIndex + 1; i < end; i++) {
				if (!this.isHexDigit(lineText[i])) {
					allHex = false;
					break;
				}
			}
			if (!allHex) {
				continue;
			}

			if (end < lineText.length && this.isHexDigit(lineText[end])) {
				continue;
			}

			return true;
		}

		return false;
	}

	private findYamlCommentStart(lineText: string, startAt: number = 0): number {
		let inSingleQuote = false;
		let inDoubleQuote = false;
		let escaped = false;

		for (let i = startAt; i < lineText.length; i++) {
			const ch = lineText[i];

			if (inDoubleQuote) {
				if (escaped) {
					escaped = false;
					continue;
				}
				if (ch === '\\') {
					escaped = true;
					continue;
				}
				if (ch === '"') {
					inDoubleQuote = false;
				}
				continue;
			}

			if (inSingleQuote) {
				if (ch === "'") {
					inSingleQuote = false;
				}
				continue;
			}

			if (ch === '"') {
				inDoubleQuote = true;
				continue;
			}
			if (ch === "'") {
				inSingleQuote = true;
				continue;
			}

			if (ch === '#') {
				if (this.isYamlColorCodeAt(lineText, i)) {
					continue;
				}
				return i;
			}
		}

		return -1;
	}

	private normalizeYamlLabelCandidate(raw: string): string {
		let candidate = (raw || '').trim();
		if ((candidate.startsWith('"') && candidate.endsWith('"')) || (candidate.startsWith("'") && candidate.endsWith("'"))) {
			candidate = candidate.slice(1, -1).trim();
		}
		return candidate;
	}

	private isKnownLabelReferenceName(candidate: string): boolean {
		const normalized = this.normalizeYamlLabelCandidate(candidate).toLowerCase();
		if (!normalized) {
			return false;
		}

		if (this.knownLabelNames.has(normalized)) {
			return true;
		}

		if (normalized.startsWith('//') && this.knownLabelNames.has(normalized.substring(2))) {
			return true;
		}

		// Scope-local sublabels (defined with + / - markers) should only resolve
		// inside the active main-label range.
		const currentOffset = this.pos;
		const scopedName = normalized.startsWith('//') ? normalized.substring(2) : normalized;
		for (const scope of this.knownSubLabelNamesByRange) {
			if (currentOffset < scope.start || currentOffset > scope.end) {
				continue;
			}
			if (scope.names.has(scopedName)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Extract label references from YAML values by matching against known labels
	 * in the current mission cache.
	 */
	private scanYamlLabelReferences(lineStart: number, contentText: string): TokenInfo[] {
		const refs: TokenInfo[] = [];
		const seen = new Set<string>();

		const addRef = (absoluteStart: number, value: string) => {
			const trimmed = this.normalizeYamlLabelCandidate(value);
			if (!trimmed || !this.isKnownLabelReferenceName(trimmed)) {
				return;
			}

			const isRoute = trimmed.startsWith('//');
			const key = `${absoluteStart}:${trimmed.length}:${isRoute ? 'route-label' : 'label'}`;
			if (seen.has(key)) {
				return;
			}
			seen.add(key);

			const pos = this.doc.positionAt(absoluteStart);
			refs.push({
				type: isRoute ? 'route-label' : 'label',
				modifier: 'reference',
				line: pos.line,
				character: pos.character,
				length: trimmed.length,
				text: trimmed
			});
		};

		// Value portion of "key: value" (or full content when there is no key).
		let valueStartRel = 0;
		const colonRel = contentText.indexOf(':');
		if (colonRel > -1) {
			valueStartRel = colonRel + 1;
			while (valueStartRel < contentText.length && /[\t ]/.test(contentText[valueStartRel])) {
				valueStartRel++;
			}
		}

		const valueText = contentText.substring(valueStartRel);
		if (!valueText.trim()) {
			return refs;
		}

		// Route-style references can appear inline in longer YAML values.
		const routeRefRegex = /\/\/[A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)*/g;
		let routeMatch: RegExpExecArray | null;
		while ((routeMatch = routeRefRegex.exec(valueText)) !== null) {
			const absStart = lineStart + valueStartRel + routeMatch.index;
			addRef(absStart, routeMatch[0]);
		}

		const trimmedValue = valueText.trim();
		// YAML list scalar entry: "- label_name" (optionally quoted).
		if (trimmedValue.startsWith('-')) {
			const listMatch = trimmedValue.match(/^-[\t ]*(.+)$/);
			if (listMatch && listMatch[1]) {
				const rawCandidate = listMatch[1].trim();
				const candidate = this.normalizeYamlLabelCandidate(rawCandidate);
				if (candidate) {
					const valueIdx = valueText.indexOf(trimmedValue);
					const candidateInTrimmed = trimmedValue.indexOf(rawCandidate);
					const candidateInRaw = rawCandidate.indexOf(candidate);
					if (valueIdx > -1 && candidateInTrimmed > -1 && candidateInRaw > -1) {
						const scalarStartRel = valueIdx + candidateInTrimmed + candidateInRaw;
						const absStart = lineStart + valueStartRel + scalarStartRel;
						addRef(absStart, candidate);
					}
				}
			}
		}

		if (/^(?:"[^"]+"|'[^']+'|(?:\/\/)?[A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)*)$/.test(trimmedValue)) {
			const scalar = this.normalizeYamlLabelCandidate(trimmedValue);
			if (scalar) {
				const scalarIdx = valueText.indexOf(trimmedValue);
				if (scalarIdx > -1) {
					const scalarStartRel = scalarIdx + trimmedValue.indexOf(scalar);
					const absStart = lineStart + valueStartRel + scalarStartRel;
					addRef(absStart, scalar);
				}
			}
		}

		return refs;
	}

	private tokenizeYamlLine(lineStart: number, lineEnd: number): TokenInfo[] {
		const lineTokens: TokenInfo[] = [];
		const lineText = this.text.substring(lineStart, lineEnd);
		const commentRel = this.findYamlCommentStart(lineText);
		const contentEndRel = commentRel === -1 ? lineText.length : commentRel;
		const contentEnd = lineStart + contentEndRel;
		const contentText = lineText.substring(0, contentEndRel);
		const yamlLabelRefs = this.scanYamlLabelReferences(lineStart, contentText);

		if (contentText.trim().length > 0) {
			const colonRel = contentText.indexOf(':');
			if (colonRel > -1) {
				const preColon = contentText.substring(0, colonRel);
				const keyTrimmed = preColon.trim();
				if (keyTrimmed.length > 0) {
					const keyLeadingWs = preColon.length - preColon.trimStart().length;
					const keyStart = lineStart + keyLeadingWs;
					const keyPos = this.doc.positionAt(keyStart);
					lineTokens.push({
						type: 'yaml.key',
						line: keyPos.line,
						character: keyPos.character,
						length: keyTrimmed.length,
						text: keyTrimmed
					});
				}

				let valueStartRel = colonRel + 1;
				while (valueStartRel < contentText.length && /[\t ]/.test(contentText[valueStartRel])) {
					valueStartRel++;
				}
				if (valueStartRel < contentText.length) {
					const valueStart = lineStart + valueStartRel;
					const valueEnd = contentEnd;
					const refRanges = yamlLabelRefs
						.map((ref) => {
							const start = this.doc.offsetAt({ line: ref.line, character: ref.character });
							return { start, end: start + ref.length };
						})
						.filter((r) => r.end > valueStart && r.start < valueEnd)
						.sort((a, b) => a.start - b.start);

					let cursor = valueStart;
					for (const r of refRanges) {
						const start = Math.max(cursor, r.start);
						if (start > cursor) {
							lineTokens.push(...this.tokenizePlainSegmentWithEmbeddedCode(cursor, start, 'yaml.value'));
						}
						cursor = Math.max(cursor, r.end);
					}

					if (cursor < valueEnd) {
						lineTokens.push(...this.tokenizePlainSegmentWithEmbeddedCode(cursor, valueEnd, 'yaml.value'));
					}
				}
			} else {
				const valueStart = lineStart;
				const valueEnd = contentEnd;
				const refRanges = yamlLabelRefs
					.map((ref) => {
						const start = this.doc.offsetAt({ line: ref.line, character: ref.character });
						return { start, end: start + ref.length };
					})
					.filter((r) => r.end > valueStart && r.start < valueEnd)
					.sort((a, b) => a.start - b.start);

				let cursor = valueStart;
				for (const r of refRanges) {
					const start = Math.max(cursor, r.start);
					if (start > cursor) {
						lineTokens.push(...this.tokenizePlainSegmentWithEmbeddedCode(cursor, start, 'yaml.value'));
					}
					cursor = Math.max(cursor, r.end);
				}

				if (cursor < valueEnd) {
					lineTokens.push(...this.tokenizePlainSegmentWithEmbeddedCode(cursor, valueEnd, 'yaml.value'));
				}
			}

			lineTokens.push(...yamlLabelRefs);
		}

		if (commentRel !== -1) {
			const commentStart = lineStart + commentRel;
			const commentPos = this.doc.positionAt(commentStart);
			lineTokens.push({
				type: 'comment',
				line: commentPos.line,
				character: commentPos.character,
				length: lineEnd - commentStart,
				text: this.text.substring(commentStart, lineEnd)
			});
		}

		return lineTokens;
	}

	private isYamlLikeTripleQuotedContent(contentStart: number, contentEnd: number): boolean {
		if (contentEnd <= contentStart) {
			return false;
		}
		const inner = this.text.substring(contentStart, contentEnd);
		const lines = inner.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
		if (lines.length === 0) {
			return false;
		}
		const yamlLineCount = lines.filter((line) => /^(?:-|["']?[A-Za-z_][\w .-]*["']?)\s*:\s*.*$/.test(line)).length;
		return yamlLineCount > 0 && yamlLineCount >= Math.ceil(lines.length / 2);
	}

	private tokenizeTripleQuotedYamlString(stringStartPos: number, stringEndPos: number, quote: string): TokenInfo[] {
		const tokens: TokenInfo[] = [];
		const delimiterLength = 3;
		const openingPos = this.doc.positionAt(stringStartPos);
		tokens.push({
			type: 'string',
			line: openingPos.line,
			character: openingPos.character,
			length: delimiterLength,
			text: this.text.substring(stringStartPos, stringStartPos + delimiterLength)
		});

		const contentStart = stringStartPos + delimiterLength;
		const hasClosingDelimiter = stringEndPos - stringStartPos >= delimiterLength * 2 && this.text.substring(stringEndPos - delimiterLength, stringEndPos) === quote.repeat(3);
		const contentEnd = hasClosingDelimiter ? stringEndPos - delimiterLength : stringEndPos;
		let lineStart = contentStart;
		while (lineStart <= contentEnd) {
			const nextNewline = this.text.indexOf('\n', lineStart);
			const lineEnd = nextNewline === -1 || nextNewline > contentEnd ? contentEnd : nextNewline;
			tokens.push(...this.tokenizeYamlLine(lineStart, lineEnd));
			if (nextNewline === -1 || nextNewline >= contentEnd) {
				break;
			}
			lineStart = nextNewline + 1;
		}

		if (hasClosingDelimiter) {
			const closingStart = stringEndPos - delimiterLength;
			const closingPos = this.doc.positionAt(closingStart);
			tokens.push({
				type: 'string',
				line: closingPos.line,
				character: closingPos.character,
				length: delimiterLength,
				text: this.text.substring(closingStart, stringEndPos)
			});
		}

		return tokens;
	}

	private tokenizeScannedStringRange(stringStartPos: number, stringEndPos: number, quote: string): TokenInfo[] {
		const tripleDelimiter = quote.repeat(3);
		const isTriple = this.text.substring(stringStartPos, stringStartPos + 3) === tripleDelimiter;
		if (!isTriple) {
			return this.scanFStringInterpolations(stringStartPos, stringEndPos);
		}
		const contentStart = stringStartPos + 3;
		const hasClosingDelimiter = stringEndPos - stringStartPos >= 6 && this.text.substring(stringEndPos - 3, stringEndPos) === tripleDelimiter;
		const contentEnd = hasClosingDelimiter ? stringEndPos - 3 : stringEndPos;
		if (!this.isYamlLikeTripleQuotedContent(contentStart, contentEnd)) {
			return this.scanFStringInterpolations(stringStartPos, stringEndPos);
		}
		return this.tokenizeTripleQuotedYamlString(stringStartPos, stringEndPos, quote);
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
		const keywords = ['def', 'async', 'await', 'import', 'from', 'as', 'if', 'elif', 'else', 'match', 'case', 'yield', 'return', 'break', 'continue', 'pass', 'raise', 'try', 'except', 'finally', 'with', 'class', 'while', 'for', 'in', 'is', 'and', 'or', 'not', 'lambda', 'on', 'change', 'signal'];
		for (const kw of variableModifiers) {
			keywords.push(kw[0]);
		}
		if (text === 'from') {
			this.inFromImportStatement = true;
			this.expectFromModuleReference = true;
			this.expectFromImportedReference = false;
			this.expectImportModuleReference = false;
			return null;
		}

		// Special-case `jump` keyword: emit following identifier as label
		if (text === 'jump') {
			const jt = this.scanJumpTarget();
			return jt; // may be null if no valid target
		}

		// Special-case `import` keyword: next identifier is a module reference.
		if (text === 'import') {
			if (this.inFromImportStatement) {
				this.expectFromImportedReference = true;
				this.expectFromModuleReference = false;
			} else {
				this.expectImportModuleReference = true;
			}
			return null;
		}

		if (text === 'as') {
			// Alias token is a keyword; the alias identifier that follows should not
			// be treated as a module reference in from-import mode.
			if (this.inFromImportStatement) {
				this.expectFromImportedReference = false;
			}
			return null;
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

		const assignmentModifier = this.getAssignmentModifierAfterIdentifier(this.pos);

		const builtInConstants = ['True', 'False', 'None', 'client_id'];
		
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

		// All-caps identifiers (with optional underscores/digits) are treated as constants
		if (/^[A-Z][A-Z0-9_]+$/.test(text)) {
			return {
				type: 'builtInConstant',
				modifier: assignmentModifier,
				line: startLine,
				character: startChar,
				length: text.length,
				text
			};
		}
		
		if (keywords.includes(text)) {
			return null; // Keywords are parsed but not emitted
		}

		if (this.expectImportModuleReference || this.expectFromModuleReference || this.expectFromImportedReference) {
			const isFromModule = this.expectFromModuleReference;
			const isFromImported = this.expectFromImportedReference;
			this.expectImportModuleReference = false;
			this.expectFromModuleReference = false;
			this.expectFromImportedReference = false;
			// Extend the module token to include dotted suffixes, such as
			// `common_console_selection.py` or `pkg.submodule`.
			let moduleEnd = this.pos;
			while (moduleEnd < this.text.length && this.text[moduleEnd] === '.') {
				const segStart = moduleEnd + 1;
				if (segStart >= this.text.length || !this.isIdentifierStart(this.text[segStart])) {
					break;
				}
				moduleEnd = segStart + 1;
				while (moduleEnd < this.text.length && this.isIdentifierPart(this.text[moduleEnd])) {
					moduleEnd++;
				}
			}
			if (moduleEnd > this.pos) {
				this.advanceTo(moduleEnd);
			}
			const moduleText = this.text.substring(startPos, moduleEnd);
			if (isFromImported) {
				// End from-import context after consuming first imported symbol.
				this.inFromImportStatement = false;
			} else if (isFromModule) {
				// Keep from-import context alive until we encounter `import`.
				this.inFromImportStatement = true;
			}
			return {
				type: 'module',
				modifier: 'reference',
				line: startLine,
				character: startChar,
				length: moduleText.length,
				text: moduleText
			};
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
		const isDotAccess = this.isPrecededByDot(startPos);
		const isMethodCall = isFunctionCall && isDotAccess;
		const isKnownLabelRef = this.isKnownLabelReferenceName(text);
		const tokenStartAbs = this.doc.offsetAt({ line: startLine, character: startChar });
		const isLambdaParam = this.findLambdaScopesInLine(startLine).some((scope) =>
			scope.params.some((param) => tokenStartAbs === param.start && text === param.name)
		);

		if (isFunctionCall) {
			return {
				type: isMethodCall ? 'method' : 'function',
				modifier: 'reference',
				line: startLine,
				character: startChar,
				length: text.length,
				text
			};
		}

		if (!isDotAccess && isKnownLabelRef) {
			return {
				type: text.startsWith('//') ? 'route-label' : 'label',
				modifier: 'reference',
				line: startLine,
				character: startChar,
				length: text.length,
				text
			};
		}

		// If this would otherwise be a plain variable reference, consult known
		// mission symbols to reclassify callbacks as function references.
		if (!isDotAccess && !isLambdaParam && assignmentModifier !== 'definition') {
			if (this.doc?.uri && this.doc.uri.trim() !== '') {
				const cache = getCache(this.doc.uri);
				if (cache.getCallableForName(text, true)) {
					return {
						type: 'function',
						modifier: 'reference',
						line: startLine,
						character: startChar,
						length: text.length,
						text
					};
				}
			}
		}
		return {
			type: isDotAccess ? 'property' : 'variable',
			modifier: isDotAccess ? undefined : (isLambdaParam ? 'definition' : assignmentModifier),
			line: startLine,
			character: startChar,
			length: text.length,
			text
		};
	}

	private getAssignmentModifierAfterIdentifier(checkPos: number, endExclusive: number = this.text.length): TokenInfo['modifier'] {
		let i = checkPos;
		while (i < endExclusive && /[\t ]/.test(this.text[i])) {
			i++;
		}

		if (i >= endExclusive) {
			return 'reference';
		}

		const threeCharAssignOps = ['**=', '//=', '>>=', '<<='];
		for (const op of threeCharAssignOps) {
			if (i + op.length <= endExclusive && this.text.substring(i, i + op.length) === op) {
				return 'reference';
			}
		}

		const twoCharAssignOps = ['+=', '-=', '*=', '/=', '%=', '&=', '|=', '^='];
		for (const op of twoCharAssignOps) {
			if (i + op.length <= endExclusive && this.text.substring(i, i + op.length) === op) {
				return 'reference';
			}
		}

		if (this.text[i] === '=' && (i + 1 >= endExclusive || this.text[i + 1] !== '=')) {
			return 'definition';
		}

		return 'reference';
	}

	private isPrecededByDot(offset: number): boolean {
		let i = offset - 1;
		while (i >= 0 && /[\t ]/.test(this.text[i])) {
			i--;
		}
		return i >= 0 && this.text[i] === '.';
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
		const tripleDelimiter = quote.repeat(3);
		const isTriple = this.text.substring(this.pos, this.pos + 3) === tripleDelimiter;
		
		if (isTriple) {
			this.advance();
			this.advance();
			this.advance();
			while (this.pos < this.text.length) {
				if (this.text.substring(this.pos, this.pos + 3) === tripleDelimiter) {
					this.advance();
					this.advance();
					this.advance();
					break;
				}
				if (this.text[this.pos] === '\\') {
					this.advance();
					if (this.pos < this.text.length) {
						this.advance();
					}
				} else {
					this.advance();
				}
			}
		} else {
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

	private findEmbeddedCallRanges(rangeStart: number, rangeEnd: number): Array<{ start: number; end: number }> {
		const ranges: Array<{ start: number; end: number }> = [];
		let i = rangeStart;

		while (i < rangeEnd) {
			const ch = this.text[i];
			if (!this.isIdentifierStart(ch)) {
				i++;
				continue;
			}

			const identStart = i;
			i++;
			while (i < rangeEnd && this.isIdentifierPart(this.text[i])) {
				i++;
			}

			let j = i;
			while (j < rangeEnd && /[\t ]/.test(this.text[j])) {
				j++;
			}
			if (j >= rangeEnd || this.text[j] !== '(') {
				continue;
			}

			let k = j + 1;
			let depth = 1;
			let quote: string | null = null;
			let escaped = false;

			while (k < rangeEnd && depth > 0) {
				const c = this.text[k];
				if (quote !== null) {
					if (escaped) {
						escaped = false;
					} else if (c === '\\') {
						escaped = true;
					} else if (c === quote) {
						quote = null;
					}
					k++;
					continue;
				}

				if (c === '"' || c === "'") {
					quote = c;
					k++;
					continue;
				}
				if (c === '(') depth++;
				else if (c === ')') depth--;
				k++;
			}

			if (depth === 0) {
				ranges.push({ start: identStart, end: k });
				i = k;
				continue;
			}

			// Unclosed call - stop scanning this range.
			break;
		}

		return ranges;
	}

	private tokenizePlainSegmentWithEmbeddedCode(rangeStart: number, rangeEnd: number, plainType: 'string' | 'yaml.value'): TokenInfo[] {
		if (rangeEnd <= rangeStart) {
			return [];
		}

		const callRanges = this.findEmbeddedCallRanges(rangeStart, rangeEnd);
		if (callRanges.length === 0) {
			const p = this.doc.positionAt(rangeStart);
			return [{
				type: plainType,
				line: p.line,
				character: p.character,
				length: rangeEnd - rangeStart,
				text: this.text.substring(rangeStart, rangeEnd)
			}];
		}

		const out: TokenInfo[] = [];
		let cursor = rangeStart;
		for (const r of callRanges) {
			if (r.start > cursor) {
				const p = this.doc.positionAt(cursor);
				out.push({
					type: plainType,
					line: p.line,
					character: p.character,
					length: r.start - cursor,
					text: this.text.substring(cursor, r.start)
				});
			}
			out.push(...this.tokenizeInterpolationExpression(r.start, r.end));
			cursor = r.end;
		}

		if (cursor < rangeEnd) {
			const p = this.doc.positionAt(cursor);
			out.push({
				type: plainType,
				line: p.line,
				character: p.character,
				length: rangeEnd - cursor,
				text: this.text.substring(cursor, rangeEnd)
			});
		}

		return out;
	}

	/**
	 * Treat all MAST strings as f-strings.
	 * Splits string ranges around { ... } expressions:
	 * - string segments are emitted as `string`
	 * - expression content is emitted as `variable`
	 * Handles {{ and }} as escaped braces (remain part of string text).
	 */
	private scanFStringInterpolations(stringStartPos: number, stringEndPos: number): TokenInfo[] {
		const tokens: TokenInfo[] = [];
		let segmentStart = stringStartPos;
		let i = stringStartPos;
		while (i < stringEndPos) {
			if (this.text[i] === '{') {
				// {{ is an escaped brace, skip both
				if (i + 1 < stringEndPos && this.text[i + 1] === '{') {
					i += 2;
					continue;
				}

				// Emit string segment before interpolation
				if (i > segmentStart) {
					tokens.push(...this.tokenizePlainSegmentWithEmbeddedCode(segmentStart, i, 'string'));
				}

				// Otherwise it's an interpolation expression
				const exprStart = i + 1;
				let depth = 1;
				let j = exprStart;
				let quote: string | null = null;
				let escaped = false;
				while (j < stringEndPos && depth > 0) {
					const ch = this.text[j];

					if (quote !== null) {
						if (escaped) {
							escaped = false;
						} else if (ch === '\\') {
							escaped = true;
						} else if (ch === quote) {
							quote = null;
						}
					} else {
						if (ch === '"' || ch === "'") {
							quote = ch;
						} else if (ch === '{') {
							depth++;
						} else if (ch === '}') {
							depth--;
						}
					}
					if (depth > 0) j++;
					else break;
				}
				// text[exprStart..j] is the expression content
				const exprLen = j - exprStart;
				if (exprLen > 0) {
					tokens.push(...this.tokenizeInterpolationExpression(exprStart, j));
				}
				i = j + 1; // skip past '}'
				segmentStart = i;
			} else {
				// }} is an escaped brace, keep as string text
				if (this.text[i] === '}' && i + 1 < stringEndPos && this.text[i + 1] === '}') {
					i += 2;
					continue;
				}
				i++;
			}
		}

		// Emit trailing string segment
		if (stringEndPos > segmentStart) {
			tokens.push(...this.tokenizePlainSegmentWithEmbeddedCode(segmentStart, stringEndPos, 'string'));
		}

		return tokens;
	}

	/**
	 * Tokenizes expression content inside a single f-string interpolation { ... }.
	 * - quoted literals are emitted as `string`
	 * - everything else is emitted as `variable`
	 */
	private tokenizeInterpolationExpression(exprStart: number, exprEnd: number): TokenInfo[] {
		const tokens: TokenInfo[] = [];
		let pos = exprStart;
		const keywords = new Set([
			'def', 'async', 'await', 'shared', 'import', 'from', 'as', 'if', 'elif', 'else', 'match', 'case', 'yield',
			'return', 'break', 'continue', 'pass', 'raise', 'try', 'except', 'finally', 'with', 'class',
			'while', 'for', 'in', 'is', 'and', 'or', 'not', 'lambda', 'on', 'change', 'signal', 'jump'
		]);
		const builtInConstants = new Set(['True', 'False', 'None', 'client_id']);

		while (pos < exprEnd) {
			const ch = this.text[pos];

			// Whitespace
			if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
				pos++;
				continue;
			}

			// String literal
			if (ch === '"' || ch === "'") {
				const start = pos;
				const quote = ch;
				pos++;
				let escaped = false;
				while (pos < exprEnd) {
					const c = this.text[pos];
					if (escaped) {
						escaped = false;
						pos++;
						continue;
					}
					if (c === '\\') {
						escaped = true;
						pos++;
						continue;
					}
					if (c === quote) {
						pos++;
						break;
					}
					pos++;
				}
				const p = this.doc.positionAt(start);
				tokens.push({ type: 'string', line: p.line, character: p.character, length: pos - start, text: this.text.substring(start, pos) });
				continue;
			}

			// Number literal
			if (this.isDigit(ch)) {
				const start = pos;
				if (this.text[pos] === '0' && pos + 1 < exprEnd && (this.text[pos + 1] === 'x' || this.text[pos + 1] === 'X')) {
					pos += 2;
					while (pos < exprEnd && /[0-9a-fA-F_]/.test(this.text[pos])) pos++;
				} else if (this.text[pos] === '0' && pos + 1 < exprEnd && (this.text[pos + 1] === 'b' || this.text[pos + 1] === 'B')) {
					pos += 2;
					while (pos < exprEnd && /[01_]/.test(this.text[pos])) pos++;
				} else if (this.text[pos] === '0' && pos + 1 < exprEnd && (this.text[pos + 1] === 'o' || this.text[pos + 1] === 'O')) {
					pos += 2;
					while (pos < exprEnd && /[0-7_]/.test(this.text[pos])) pos++;
				} else {
					while (pos < exprEnd && /[0-9_]/.test(this.text[pos])) pos++;
					if (pos < exprEnd && this.text[pos] === '.' && pos + 1 < exprEnd && /[0-9]/.test(this.text[pos + 1])) {
						pos++;
						while (pos < exprEnd && /[0-9_]/.test(this.text[pos])) pos++;
					}
				}
				const p = this.doc.positionAt(start);
				tokens.push({ type: 'number', line: p.line, character: p.character, length: pos - start, text: this.text.substring(start, pos) });
				continue;
			}

			// Identifier / keyword / constant / function reference
			if (this.isIdentifierStart(ch)) {
				const start = pos;
				pos++;
				while (pos < exprEnd && this.isIdentifierPart(this.text[pos])) pos++;
				const ident = this.text.substring(start, pos);
				const assignmentModifier = this.getAssignmentModifierAfterIdentifier(pos, exprEnd);

				let tokenType: TokenInfo['type'] = 'variable';
				let modifier: TokenInfo['modifier'] | undefined = undefined;
				if (builtInConstants.has(ident)) {
					tokenType = 'builtInConstant';
				} else if (/^[A-Z][A-Z0-9_]+$/.test(ident)) {
					tokenType = 'builtInConstant';
					modifier = assignmentModifier;
				} else if (keywords.has(ident)) {
					tokenType = 'keyword';
				} else {
					let check = pos;
					while (check < exprEnd && /[\t ]/.test(this.text[check])) check++;
					const isDotAccess = this.isPrecededByDot(start);
					if (check < exprEnd && this.text[check] === '(') {
						tokenType = isDotAccess ? 'method' : 'function';
						modifier = 'reference';
					} else if (isDotAccess) {
						tokenType = 'property';
					} else {
						modifier = assignmentModifier;
					}
				}

				if (tokenType === 'variable' && !this.isPrecededByDot(start) && this.isKnownLabelReferenceName(ident)) {
					tokenType = ident.startsWith('//') ? 'route-label' : 'label';
					modifier = 'reference';
				}

				const p = this.doc.positionAt(start);
				tokens.push({ type: tokenType, modifier, line: p.line, character: p.character, length: pos - start, text: ident });
				continue;
			}

			// Operator / punctuation
			const start = pos;
			const two = pos + 1 < exprEnd ? this.text.substring(pos, pos + 2) : '';
			const twoOps = new Set(['==', '!=', '<=', '>=', '<<', '>>', '**', '->']);
			if (twoOps.has(two)) {
				pos += 2;
			} else {
				pos += 1;
			}
			if (/[+\-*/%&|^~<>=()\[\],.:]/.test(this.text[start])) {
				const p = this.doc.positionAt(start);
				tokens.push({ type: this.text.substring(start, pos) === '->' ? 'keyword' : 'operator', line: p.line, character: p.character, length: pos - start, text: this.text.substring(start, pos) });
			}
		}

		return tokens;
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
		if (/[+\-*/%&|^~<>=(,\[\]{}]/.test(char)) {
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
		this.skipWhitespace();
		if (this.pos < this.text.length && this.text[this.pos] === "[") {
			const startChar = this.char;
			const startPos = this.pos;
			while (this.pos < this.text.length && this.text[this.pos] !== "]") {
				this.advance();
			}
			const name = this.text.substring(startPos, this.pos);
			return {
				type: 'style-definition',
				modifier: 'reference',
				line: this.line,
				character: startChar,
				length: name.length,
				text: name
			}
		}
		return null;
	}

	private scanCommsMessage(): TokenInfo[] {
		const commsThings = [
			"<<",
			">>",
			"()",
			"<scan>",
			"<all>",
			"<var"
			// + and * identifiers not included because they've already been checked.	
		]

		this.skipWhitespace();


		const tokenList:TokenInfo[] = [];

		for (const c of commsThings) {
			if (this.text.substring(this.pos).startsWith(c)) {
				// debug(c)
				// debug(this.text[this.pos] + this.peek())
				// const commsStart = this.pos;
				tokenList.push({
					type: 'comms.button',
					line: this.line,
					character: this.char,
					length: c.length,
					text: c
				})
				this.advanceTo(this.pos+c.length);
				break;
			}
		}

		const styleDef = this.scanStyleDefRef();
		if (styleDef) {
			tokenList.push(styleDef);
			this.advance();
		}
		this.skipWhitespace();
		if (this.text[this.pos] === '"' || this.text[this.pos] === "'") {
			const quote = this.text[this.pos];
			const strStart = this.pos;
			this.scanString(quote);
			tokenList.push(...this.tokenizeScannedStringRange(strStart, this.pos, quote));
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
			// We are already in a button context after the label string, so the
			// inline // is always a route reference — skip the known-label guard.
			lbl = this.scanInlineRouteReference(false);
		} else {
			lbl = this.scanJumpTarget();
		}
		if (lbl) {
			tokenList.push(lbl);
		}
		return tokenList;
	}

	private splitTopLevelCommaSegments(text: string): Array<{ start: number; end: number }> {
		const segments: Array<{ start: number; end: number }> = [];
		let segStart = 0;
		let depthParen = 0;
		let depthBracket = 0;
		let depthBrace = 0;
		let inSingle = false;
		let inDouble = false;
		let escaped = false;

		for (let i = 0; i < text.length; i++) {
			const ch = text[i];

			if (inDouble) {
				if (escaped) {
					escaped = false;
					continue;
				}
				if (ch === '\\') {
					escaped = true;
					continue;
				}
				if (ch === '"') {
					inDouble = false;
				}
				continue;
			}

			if (inSingle) {
				if (ch === "'") {
					inSingle = false;
				}
				continue;
			}

			if (ch === '"') {
				inDouble = true;
				continue;
			}
			if (ch === "'") {
				inSingle = true;
				continue;
			}

			if (ch === '(') depthParen++;
			else if (ch === ')' && depthParen > 0) depthParen--;
			else if (ch === '[') depthBracket++;
			else if (ch === ']' && depthBracket > 0) depthBracket--;
			else if (ch === '{') depthBrace++;
			else if (ch === '}' && depthBrace > 0) depthBrace--;

			if (ch === ',' && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
				segments.push({ start: segStart, end: i });
				segStart = i + 1;
			}
		}

		segments.push({ start: segStart, end: text.length });
		return segments;
	}

	private findTopLevelInKeyword(text: string): number {
		let depthParen = 0;
		let depthBracket = 0;
		let depthBrace = 0;
		let inSingle = false;
		let inDouble = false;
		let escaped = false;

		for (let i = 0; i < text.length; i++) {
			const ch = text[i];

			if (inDouble) {
				if (escaped) {
					escaped = false;
					continue;
				}
				if (ch === '\\') {
					escaped = true;
					continue;
				}
				if (ch === '"') {
					inDouble = false;
				}
				continue;
			}

			if (inSingle) {
				if (ch === "'") {
					inSingle = false;
				}
				continue;
			}

			if (ch === '"') {
				inDouble = true;
				continue;
			}
			if (ch === "'") {
				inSingle = true;
				continue;
			}

			if (ch === '(') depthParen++;
			else if (ch === ')' && depthParen > 0) depthParen--;
			else if (ch === '[') depthBracket++;
			else if (ch === ']' && depthBracket > 0) depthBracket--;
			else if (ch === '{') depthBrace++;
			else if (ch === '}' && depthBrace > 0) depthBrace--;

			if (depthParen === 0 && depthBracket === 0 && depthBrace === 0 && text.startsWith(' in ', i)) {
				return i;
			}
		}

		return -1;
	}

	private getForLoopTargetOffsetsByLine(): Map<number, Set<number>> {
		const byLine = new Map<number, Set<number>>();

		for (let line = 0; line < this.doc.lineCount; line++) {
			const lineStart = this.doc.offsetAt({ line, character: 0 });
			const lineEnd = line + 1 < this.doc.lineCount
				? this.doc.offsetAt({ line: line + 1, character: 0 }) - 1
				: this.text.length;
			if (lineEnd <= lineStart) {
				continue;
			}

			const lineText = this.text.substring(lineStart, lineEnd);
			const commentIndex = lineText.indexOf('#');
			const statement = (commentIndex >= 0 ? lineText.substring(0, commentIndex) : lineText).trim();
			if (statement.length === 0) {
				continue;
			}

			let targetStartInStatement = -1;
			if (statement.startsWith('for ')) {
				targetStartInStatement = 4;
			} else if (statement.startsWith('async for ')) {
				targetStartInStatement = 10;
			} else {
				continue;
			}

			const afterFor = statement.substring(targetStartInStatement);
			const inIndex = this.findTopLevelInKeyword(afterFor);
			if (inIndex < 0) {
				continue;
			}

			const targetExpr = afterFor.substring(0, inIndex);
			if (!targetExpr.trim()) {
				continue;
			}

			const leadingWs = lineText.length - lineText.trimStart().length;
			const targetAbsStart = lineStart + leadingWs + targetStartInStatement;
			const targetOffsets = new Set<number>();

			const idRe = /[A-Za-z_][A-Za-z0-9_]*/g;
			let m: RegExpExecArray | null;
			while ((m = idRe.exec(targetExpr)) !== null) {
				targetOffsets.add(targetAbsStart + m.index);
			}

			if (targetOffsets.size > 0) {
				byLine.set(line, targetOffsets);
			}
		}

		return byLine;
	}

	private findLambdaScopesInLine(line: number): Array<{
		lambdaStart: number,
		lambdaEnd: number,
		params: Array<{ name: string, start: number, end: number }>,
		bodyStart: number,
		bodyEnd: number
	}> {
		const scopes: Array<{
			lambdaStart: number,
			lambdaEnd: number,
			params: Array<{ name: string, start: number, end: number }>,
			bodyStart: number,
			bodyEnd: number
		}> = [];

		const lineStart = this.doc.offsetAt({ line, character: 0 });
		const lineEnd = line + 1 < this.doc.lineCount
			? this.doc.offsetAt({ line: line + 1, character: 0 }) - 1
			: this.text.length;
		if (lineEnd <= lineStart) {
			return scopes;
		}

		const lineText = this.text.substring(lineStart, lineEnd);
		let i = 0;
		let inSingle = false;
		let inDouble = false;
		let escaped = false;

		while (i < lineText.length) {
			const ch = lineText[i];

			if (inDouble) {
				if (escaped) {
					escaped = false;
					i++;
					continue;
				}
				if (ch === '\\') {
					escaped = true;
					i++;
					continue;
				}
				if (ch === '"') {
					inDouble = false;
				}
				i++;
				continue;
			}

			if (inSingle) {
				if (ch === "'") {
					inSingle = false;
				}
				i++;
				continue;
			}

			if (ch === '#') {
				break;
			}
			if (ch === '"') {
				inDouble = true;
				i++;
				continue;
			}
			if (ch === "'") {
				inSingle = true;
				i++;
				continue;
			}

			if (lineText.startsWith('lambda', i)) {
				const prev = i > 0 ? lineText[i - 1] : ' ';
				const next = i + 6 < lineText.length ? lineText[i + 6] : ' ';
				if (/[A-Za-z0-9_]/.test(prev) || /[A-Za-z0-9_]/.test(next)) {
					i++;
					continue;
				}

				const paramsStart = i + 6;
				let j = paramsStart;
				let dParen = 0;
				let dBracket = 0;
				let dBrace = 0;
				let qSingle = false;
				let qDouble = false;
				let qEsc = false;

				while (j < lineText.length) {
					const cj = lineText[j];
					if (qDouble) {
						if (qEsc) {
							qEsc = false;
							j++;
							continue;
						}
						if (cj === '\\') {
							qEsc = true;
							j++;
							continue;
						}
						if (cj === '"') qDouble = false;
						j++;
						continue;
					}
					if (qSingle) {
						if (cj === "'") qSingle = false;
						j++;
						continue;
					}

					if (cj === '"') {
						qDouble = true;
						j++;
						continue;
					}
					if (cj === "'") {
						qSingle = true;
						j++;
						continue;
					}

					if (cj === '(') dParen++;
					else if (cj === ')' && dParen > 0) dParen--;
					else if (cj === '[') dBracket++;
					else if (cj === ']' && dBracket > 0) dBracket--;
					else if (cj === '{') dBrace++;
					else if (cj === '}' && dBrace > 0) dBrace--;

					if (cj === ':' && dParen === 0 && dBracket === 0 && dBrace === 0) {
						break;
					}
					j++;
				}

				if (j >= lineText.length || lineText[j] !== ':') {
					i++;
					continue;
				}

				const paramsText = lineText.substring(paramsStart, j);
				const params: Array<{ name: string, start: number, end: number }> = [];
				for (const seg of this.splitTopLevelCommaSegments(paramsText)) {
					let k = seg.start;
					while (k < seg.end && /[\t ]/.test(paramsText[k])) k++;
					if (k + 1 < seg.end && paramsText[k] === '*' && paramsText[k + 1] === '*') {
						k += 2;
					} else if (k < seg.end && paramsText[k] === '*') {
						k += 1;
					}
					while (k < seg.end && /[\t ]/.test(paramsText[k])) k++;
					if (k >= seg.end || !/[A-Za-z_]/.test(paramsText[k])) {
						continue;
					}
					const nameStartRel = paramsStart + k;
					let z = k + 1;
					while (z < seg.end && /[A-Za-z0-9_]/.test(paramsText[z])) z++;
					const name = paramsText.substring(k, z);
					const absStart = lineStart + nameStartRel;
					params.push({
						name,
						start: absStart,
						end: absStart + name.length
					});
				}

				scopes.push({
					lambdaStart: lineStart + i,
					lambdaEnd: lineStart + j + 1,
					params,
					bodyStart: lineStart + j + 1,
					bodyEnd: lineEnd
				});

				i = j + 1;
				continue;
			}

			i++;
		}

		return scopes;
	}

	private applyLambdaPostProcessing(): void {
		const lambdaTokens: TokenInfo[] = [];

		for (let line = 0; line < this.doc.lineCount; line++) {
			const scopes = this.findLambdaScopesInLine(line);
			for (const scope of scopes) {
				const lambdaPos = this.doc.positionAt(scope.lambdaStart);
				lambdaTokens.push({
					type: 'lambda',
					line: lambdaPos.line,
					character: lambdaPos.character,
					length: scope.lambdaEnd - scope.lambdaStart,
					text: this.text.substring(scope.lambdaStart, scope.lambdaEnd)
				});

				for (const token of this.tokens) {
					if (token.type !== 'variable' || token.line !== line) {
						continue;
					}
					const tokenStart = this.doc.offsetAt({ line: token.line, character: token.character });
					for (const param of scope.params) {
						if (tokenStart === param.start && token.text === param.name) {
							token.modifier = 'definition';
							break;
						}
					}
				}
			}
		}

		if (lambdaTokens.length > 0) {
			this.tokens.push(...lambdaTokens);
		}
	}

	private applyForLoopPostProcessing(): void {
		const forLoopTargetsByLine = this.getForLoopTargetOffsetsByLine();
		if (forLoopTargetsByLine.size === 0) {
			return;
		}

		for (const token of this.tokens) {
			if (token.type !== 'variable' || token.line < 0) {
				continue;
			}
			const targetOffsets = forLoopTargetsByLine.get(token.line);
			if (!targetOffsets || targetOffsets.size === 0) {
				continue;
			}
			const tokenStart = this.doc.offsetAt({ line: token.line, character: token.character });
			if (targetOffsets.has(tokenStart)) {
				token.modifier = 'definition';
			}
		}
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
					}

					// Tokenize the current YAML line
					const lineStart = this.pos;
					while (this.pos < this.text.length && this.text[this.pos] !== '\n') {
						this.advance();
					}
					const lineEnd = this.pos;
					const lineText = this.text.substring(lineStart, lineEnd);
					const commentRel = this.findYamlCommentStart(lineText);
					const contentEndRel = commentRel === -1 ? lineText.length : commentRel;
					const contentEnd = lineStart + contentEndRel;
					const contentText = lineText.substring(0, contentEndRel);
					const yamlLabelRefs = this.scanYamlLabelReferences(lineStart, contentText);

					if (contentText.trim().length > 0) {
						const colonRel = contentText.indexOf(':');
						if (colonRel > -1) {
							const preColon = contentText.substring(0, colonRel);
							const keyTrimmed = preColon.trim();
							if (keyTrimmed.length > 0) {
								const keyLeadingWs = preColon.length - preColon.trimStart().length;
								const keyStart = lineStart + keyLeadingWs;
								const keyPos = this.doc.positionAt(keyStart);
								this.tokens.push({
									type: 'yaml.key',
									line: keyPos.line,
									character: keyPos.character,
									length: keyTrimmed.length,
									text: keyTrimmed
								});
							}

							let valueStartRel = colonRel + 1;
							while (valueStartRel < contentText.length && /[\t ]/.test(contentText[valueStartRel])) {
								valueStartRel++;
							}
							if (valueStartRel < contentText.length) {
								const valueStart = lineStart + valueStartRel;
								const valueEnd = contentEnd;

								// Keep yaml.value segments only for spans that are not explicit
								// label references inside YAML values.
								const refRanges = yamlLabelRefs
									.map((ref) => {
										const start = this.doc.offsetAt({ line: ref.line, character: ref.character });
										return { start, end: start + ref.length };
									})
									.filter((r) => r.end > valueStart && r.start < valueEnd)
									.sort((a, b) => a.start - b.start);

								let cursor = valueStart;
								for (const r of refRanges) {
									const start = Math.max(cursor, r.start);
									if (start > cursor) {
										this.tokens.push(...this.tokenizePlainSegmentWithEmbeddedCode(cursor, start, 'yaml.value'));
									}
									cursor = Math.max(cursor, r.end);
								}

								if (cursor < valueEnd) {
									this.tokens.push(...this.tokenizePlainSegmentWithEmbeddedCode(cursor, valueEnd, 'yaml.value'));
								}
							}
						} else {
							// No key:value separator on this line (e.g. list scalar `- value`).
							// Emit as yaml.value, split around label refs so label refs own
							// their exact spans.
							const valueStart = lineStart;
							const valueEnd = contentEnd;
							const refRanges = yamlLabelRefs
								.map((ref) => {
									const start = this.doc.offsetAt({ line: ref.line, character: ref.character });
									return { start, end: start + ref.length };
								})
								.filter((r) => r.end > valueStart && r.start < valueEnd)
								.sort((a, b) => a.start - b.start);

							let cursor = valueStart;
							for (const r of refRanges) {
								const start = Math.max(cursor, r.start);
								if (start > cursor) {
									this.tokens.push(...this.tokenizePlainSegmentWithEmbeddedCode(cursor, start, 'yaml.value'));
								}
								cursor = Math.max(cursor, r.end);
							}

							if (cursor < valueEnd) {
								this.tokens.push(...this.tokenizePlainSegmentWithEmbeddedCode(cursor, valueEnd, 'yaml.value'));
							}
						}

						// Detect label-like references in YAML values (e.g. //route or list items)
						// and emit first-class label tokens for navigation features.
						this.tokens.push(...yamlLabelRefs);
					}

					if (commentRel !== -1) {
						const commentStart = lineStart + commentRel;
						const commentPos = this.doc.positionAt(commentStart);
						this.tokens.push({
							type: 'comment',
							line: commentPos.line,
							character: commentPos.character,
							length: lineEnd - commentStart,
							text: this.text.substring(commentStart, lineEnd)
						});
					}

					if (this.pos < this.text.length && this.text[this.pos] === '\n') {
						this.advance();
					}
					continue;
				}
				// Safety fallback when inside YAML and not at line start
				this.advance();
				continue;
			}

			const current = this.text[this.pos];

			// If we are inside a multi-line delimiter-based string block (e.g. ^^^...^^^ or """..."""),
			// treat each full line as f-string content until a closing delimiter is encountered.
			if (this.activeLineStringDelimiter !== null && this.isLineStart()) {
				const lineStart = this.pos;
				let firstNonWs = this.pos;
				while (firstNonWs < this.text.length && (this.text[firstNonWs] === ' ' || this.text[firstNonWs] === '\t')) {
					firstNonWs++;
				}

				// Closing delimiter line: only the delimiter portion is string;
				// tokenize the remainder of the line normally (e.g. trailing `if ...`).
				const isCaretBlock = this.activeLineStringDelimiter === '^';
				const caretCloseMatch = isCaretBlock ? this.text.substring(firstNonWs).match(/^(\^{3,})/) : null;
				if ((isCaretBlock && caretCloseMatch !== null) || (!isCaretBlock && this.text.substring(firstNonWs).startsWith(this.activeLineStringDelimiter))) {
					const closeLen = isCaretBlock ? caretCloseMatch![1].length : this.activeLineStringDelimiter.length;
					const closeEnd = firstNonWs + closeLen;
					this.advanceTo(closeEnd);
					this.tokens.push(...this.scanFStringInterpolations(lineStart, this.pos));
					this.activeLineStringDelimiter = null;

					// Trailing content after a closing delimiter (e.g. `if ...`) is parsed as an expression
					// so keywords/operators/constants get semantic tokens.
					const trailingStart = this.pos;
					let trailingEnd = this.pos;
					while (trailingEnd < this.text.length && this.text[trailingEnd] !== '\n') {
						trailingEnd++;
					}
					if (trailingEnd > trailingStart) {
						this.tokens.push(...this.tokenizeInterpolationExpression(trailingStart, trailingEnd));
						this.advanceTo(trailingEnd);
					}
					continue;
				}

				while (this.pos < this.text.length && this.text[this.pos] !== '\n') {
					this.advance();
				}
				this.tokens.push(...this.scanFStringInterpolations(lineStart, this.pos));
				if (this.pos < this.text.length && this.text[this.pos] === '\n') {
					this.advance();
				}
				continue;
			}

			// // when a plus directive is in effect, skip any whitespace or
			// // optional bracketed metadata before the string itself.
			// if (this.expectPlusDirective) {
			// 	if (current === '[') {
			// 		this.advance();
			// 		while (this.pos < this.text.length && this.text[this.pos] !== ']') {
			// 			this.advance();
			// 		}
			// 		if (this.pos < this.text.length && this.text[this.pos] === ']') {
			// 			this.advance();
			// 		}
			// 		continue;
			// 	}
			// 	if (current === ' ' || current === '\t') {
			// 		this.advance();
			// 		continue;
			// 	}
			// }
			if (this.isLineStart() && (current === '"' || current === "'" || current === '%' || current === '^')) {
				if (current === '"' || current === "'" || current === '^') {
					let runLen = 0;
					while (this.pos + runLen < this.text.length && this.text[this.pos + runLen] === current) {
						runLen++;
					}
					if (runLen >= 3) {
						const delimiter = current === '^' ? '^' : current.repeat(runLen);
						const lineStart = this.pos;
						const lineEnd = this.text.indexOf('\n', lineStart) === -1
							? this.text.length
							: this.text.indexOf('\n', lineStart);
						let sameLineClose = -1;
						let sameLineCloseLen = runLen;
						if (current === '^') {
							const rem = this.text.substring(lineStart + runLen, lineEnd);
							const m = rem.match(/\^{3,}/);
							if (m && m.index !== undefined) {
								sameLineClose = lineStart + runLen + m.index;
								sameLineCloseLen = m[0].length;
							}
						} else {
							sameLineClose = this.text.indexOf(delimiter, lineStart + runLen);
						}

						// Inline delimited string: ^^^ ... ^^^ (or repeated quote delimiters)
						if (sameLineClose !== -1 && sameLineClose < lineEnd) {
							const strStart = this.pos;
							this.advanceTo(sameLineClose + sameLineCloseLen);
							this.tokens.push(...this.scanFStringInterpolations(strStart, this.pos));
							continue;
						}

						// Multi-line block start: consume this line as string, then stay in block mode
						const strStart = this.pos;
						while (this.pos < this.text.length && this.text[this.pos] !== '\n') {
							this.advance();
						}
						this.tokens.push(...this.scanFStringInterpolations(strStart, this.pos));
						this.activeLineStringDelimiter = delimiter;
						if (this.pos < this.text.length && this.text[this.pos] === '\n') {
							this.advance();
						}
						continue;
					}
				}

				// Standard line-start string (single-line)
				if (current === '%' || current === '"' || current === "'") {
					// For quoted strings ("..." or '...'), check for a key:value pattern
					// like `"start_time": sim.time_tick_counter` where the value after ':'
					// should NOT be tokenized as a string.
					if (current === '"' || current === "'") {
						const quote = current;
						let scanAhead = this.pos + 1;
						let closePos = -1;
						while (scanAhead < this.text.length && this.text[scanAhead] !== '\n') {
							if (this.text[scanAhead] === '\\') {
								scanAhead += 2;
								continue;
							}
							if (this.text[scanAhead] === quote) {
								closePos = scanAhead + 1; // position after closing quote
								break;
							}
							scanAhead++;
						}
						if (closePos !== -1) {
							// Skip optional whitespace after closing quote
							let afterClose = closePos;
							while (afterClose < this.text.length && /[ \t]/.test(this.text[afterClose])) {
								afterClose++;
							}
							// If followed by ':' (but not '::'), it's a key:value pattern
							if (afterClose < this.text.length && this.text[afterClose] === ':' &&
								this.text[afterClose + 1] !== ':') {
								// Emit the quoted key as a string token
								const strStart = this.pos;
								this.advanceTo(closePos);
								this.tokens.push(...this.scanFStringInterpolations(strStart, this.pos));
								// Skip the colon and any trailing whitespace
								this.advanceTo(afterClose + 1); // skip ':'
								this.skipWhitespace();
								// Tokenize the value as an expression
								const valueStart = this.pos;
								let valueEnd = this.pos;
								while (valueEnd < this.text.length && this.text[valueEnd] !== '\n') {
									valueEnd++;
								}
								if (valueEnd > valueStart) {
									this.tokens.push(...this.tokenizeInterpolationExpression(valueStart, valueEnd));
									this.advanceTo(valueEnd);
								}
								continue;
							}
						}
					}
					const strStart = this.pos;
					this.scanLineStartString();
					this.tokens.push(...this.scanFStringInterpolations(strStart, this.pos));
					continue;
				}
			}

			// Route label definitions take precedence over comments.  They
			// begin with // followed by non-whitespace and run until the
			// first space or newline.
			if (current === '/' && this.peek() === '/') {
				if (this.isLineStart()) {
					const routeToken = this.scanRouteLabel();
					if (routeToken) {
						this.tokens.push(routeToken);
						continue;
					}
				} else {
					const routeRefToken = this.scanInlineRouteReference();
					if (routeRefToken) {
						this.tokens.push(routeRefToken);
						continue;
					}
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

			// Lines beginning with a single '+' signify a button definition
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
					this.tokens = this.tokens.concat(cms);
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
				this.tokens = this.tokens.concat(cms);
				this.advance();
				continue;
			}

			// Comms targets like <all>, <scan>, <var ...> at line start
			if (current === "<" && this.isLineStart()) {
				const cms = this.scanCommsMessage();
				if (cms.length > 0) {
					this.tokens = this.tokens.concat(cms);
					this.advance();
					continue;
				}
			}

			// Comments
			//#region Comments
			if (current === '/' && this.peek() === '*') {
				const blockCommentTokens = this.scanBlockComment();
				this.tokens.push(...blockCommentTokens);
				continue;
			}

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
					const strStart = this.pos;
					this.scanString(next); // Parse but don't emit outer string
					this.tokens.push(...this.tokenizeScannedStringRange(strStart, this.pos, next));
					continue;
				}
			}

			if (current === '"' || current === "'") {
				// handle plus directive
				if (this.expectPlusDirective) {
					this.expectPlusDirective = false;
					this.expectPlusLabelReference = true;
				}
				const strStart = this.pos;
				this.scanString(current); // Parse but don't emit outer string
				this.tokens.push(...this.tokenizeScannedStringRange(strStart, this.pos, current));
				continue;
			}

			// Number literals (supports separators like 60_000)
			if (this.isDigit(current)) {
				const token = this.scanNumber();
				this.tokens.push(token);
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
					// Emit parsed label definition tokens
					this.tokens.push(...labelTokens);
					continue;
				}
			}

			// Operators
			if (/[+\-*/%&|^~<>=(,\[\]{}]/.test(current)) {
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

		this.applyLambdaPostProcessing();
		this.applyForLoopPostProcessing();
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
export function buildSemanticTokens(tokens: TokenInfo[], doc: TextDocument): SemanticTokens {
	const builder = new SemanticTokensBuilder();
	convertVariableTokensToLabelOrFunction(tokens, doc);
	for (const token of tokens) {
		// Keep string tokens available to server-side analyzers, but do not
		// emit them in the semantic token stream returned to the client.
		if (token.type === 'string') {
			continue;
		}
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


export function tokenizeDocument(document: TextDocument): TokenInfo[] {
	// Always use the state-machine lexer.
	// The regex lexer does not currently build exclusion ranges for strings/comments,
	// which can incorrectly emit keyword/operator/number tokens inside string text.
	// const USE_REGEX_LEXER = false;
	
	// let tokens: TokenInfo[];
	// if (USE_REGEX_LEXER) {
	// 	const lexer = new MastLexer(document);
	// 	tokens = lexer.tokenize();
	// } else {
	// 	const lexer = new MastStateMachineLexer(document);
	// 	tokens = lexer.tokenize();
	// }
	const lexer = new MastStateMachineLexer(document);
	const tokens = lexer.tokenize();
	return tokens;
}

/**
 * Get semantic tokens for a document
 */
export function getSemanticTokens(document: TextDocument): SemanticTokens {
	let tokens: TokenInfo[] = tokenizeDocument(document);
	return buildSemanticTokens(tokens,document);
}

/**
 * Build empty semantic tokens (for error cases)
 */
export function getEmptySemanticTokens(): SemanticTokens {
	return new SemanticTokensBuilder().build();
}
