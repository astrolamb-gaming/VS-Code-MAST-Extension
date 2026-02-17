import { debug } from 'console';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SemanticTokens, SemanticTokensBuilder, integer } from 'vscode-languageserver';
import { getComments, getStrings, getYamls } from '../tokens/comments';
import { CRange } from '../tokens/comments';

/**
 * Semantic token types supported by the MAST language server.
 * Must match the tokenTypes array in server.ts capabilities.
 */
export const TOKEN_TYPES = [
	'keyword',        // 0
	'label',          // 1
	'variable',       // 2
	'string',         // 3
	'comment',        // 4
	'function',       // 5
	'class',          // 6
	'operator',       // 7
	'number',         // 8
	'route-label',    // 9
	'media-label',    // 10
	'resource-label'  // 11
] as const;

export const TOKEN_MODIFIERS = [
	'declaration',    // 0
	'definition',     // 1
	'readonly'        // 2
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
	const lexer = new MastLexer(document);
	const tokens = lexer.tokenize();
	return buildSemanticTokens(tokens);
}

/**
 * Build empty semantic tokens (for error cases)
 */
export function getEmptySemanticTokens(): SemanticTokens {
	return new SemanticTokensBuilder().build();
}
