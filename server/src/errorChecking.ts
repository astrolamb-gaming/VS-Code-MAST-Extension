import { Range, TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticRelatedInformation, DiagnosticSeverity, integer } from 'vscode-languageserver/node';
import {ErrorInstance, hasDiagnosticRelatedInformationCapability} from './server';
import { debug } from 'console';
import { isInComment, isInString, replaceRegexMatchWithUnderscore, isInSquareBrackets, getTokenTypeAtOffset } from './tokens/comments';
import { getCache } from './cache';

/**
 * Checks if the file ends with an empty line.
 * @param textDocument 
 * @returns 
 */
export function checkLastLine(textDocument: TextDocument): Diagnostic | undefined {
	if (textDocument.languageId !== "mast") return undefined;
	if (textDocument.uri.endsWith("__init__.mast")) return undefined;
	const text = textDocument.getText();
	textDocument.lineCount
	const lastLinePos = textDocument.offsetAt({
		line: textDocument.lineCount - 1,
		character: 0
	});
	const arr: string[] = text.split("\n");
	//const lastLine = text.substring(lastLinePos);
	const lastLine = arr[arr.length-1].trim();
	if (lastLine !== "") {
		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Error,
			range: {
				start: textDocument.positionAt(text.length - lastLine.length),
				end: textDocument.positionAt(text.length)
			},
			message: "MAST Compiler Error: File must end with an empty line.",
			source: "MAST Compiler "+ __filename
		};
		return diagnostic
	}
	return undefined;
}

// export function findDiagnostic(pattern: RegExp, textDocument: TextDocument, severity: DiagnosticSeverity, message: string, source: string, relatedInfo: string, maxProblems: integer, problems: integer): Diagnostic[] {
export function findDiagnostic(e:ErrorInstance, textDocument: TextDocument, problems:integer, maxProblems:integer) {
	let text = textDocument.getText();
	const cache = getCache(textDocument.uri);
	const tokens = cache.getMastFile(textDocument.uri)?.tokens || [];

	const mapTokenType = (tokenType: string): 'string' | 'yaml' | 'comment' | 'other' => {
		if (tokenType === 'comment' || tokenType === 'codetag') return 'comment';
		if (tokenType === 'string' || tokenType === 'stringOption') return 'string';
		if (tokenType.includes('yaml')) return 'yaml';
		return 'other';
	};

	const matchTouchesTokenType = (start: integer, end: integer, type: 'string' | 'yaml' | 'comment'): boolean => {
		for (const token of tokens) {
			const mappedType = mapTokenType(token.type);
			if (mappedType !== type) continue;
			const tokenStart = textDocument.offsetAt({ line: token.line, character: token.character });
			const tokenEnd = tokenStart + token.length;
			if (tokenEnd > start && tokenStart < end) {
				return true;
			}
		}
		return false;
	};
	// const commentsStrings = getComments(textDocument).concat(getStrings(textDocument));
	// // TODO: This doesn't work right for weighted text in particular.
	// for (const c of commentsStrings) {
	// 	text = replaceRegexMatchWithUnderscore(text,c)
	// }
	
	
	let m: RegExpExecArray | null;
	const diagnostics: Diagnostic[] = [];
	while ((m = e.pattern.exec(text)) && problems < maxProblems) {
		//debug(JSON.stringify(m));
		const start = m.index;
		const end = m.index + m[0].length;
		
		if (e.excludeFrom.includes("string")) {
			let isInString = matchTouchesTokenType(start, end, 'string');
			if (isInString) {
				continue;
			}
		}
		if (e.excludeFrom.includes("metadata")) {
			let isInYaml = matchTouchesTokenType(start, end, 'yaml');
			if (isInYaml) {
				continue;
			}
		}
		if (e.excludeFrom.includes("comment")) {
			let isInComment = matchTouchesTokenType(start, end, 'comment');
			if (isInComment) {
				continue;
			}
		}
		// if (e.excludeFrom.includes("squreBrackets")) {
		// 	if ()
		// }
		// if (e.excludeFrom.includes("curlyBraces")) {
		// 	if ()
		// }
		problems++;
		const diagnostic: Diagnostic = {
			severity: e.severity,
			range: {
				start: textDocument.positionAt(m.index),
				end: textDocument.positionAt(m.index + m[0].length)
			},
			message: e.message,
			source: e.source
		};

		if (hasDiagnosticRelatedInformationCapability) {
			diagnostic.relatedInformation = [
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnostic.range)
					},
					message: e.relatedMessage
				}
			];
		}
		diagnostics.push(diagnostic);
	}
	return diagnostics;
}



export function relatedMessage(t: TextDocument, range: Range, rm: string): DiagnosticRelatedInformation[] | undefined {
	if (hasDiagnosticRelatedInformationCapability) {
		const dri: DiagnosticRelatedInformation[] = [
			{
				location: {
					uri: t.uri,
					range: Object.assign({}, range)
				},
				message: rm
			}
		];
		return dri;
	}
	return undefined;
}

// Python keywords that look like function calls but aren't
const PYTHON_KEYWORDS = new Set([
	'if', 'elif', 'while', 'for', 'def', 'class', 'lambda', 'return',
	'and', 'or', 'not', 'in', 'is', 'import', 'from', 'with', 'assert',
	'raise', 'del', 'yield', 'await', 'async', 'except', 'print'
]);

/**
 * Extracts the raw argument string from inside parentheses, starting just after
 * the opening '(' at position `afterOpenParen` in `text`. Returns null if no
 * matching ')' is found.
 */
function extractArgString(text: string, afterOpenParen: integer): string | null {
	let depth = 1;
	let i = afterOpenParen;
	let inStr: string | null = null;
	while (i < text.length) {
		const ch = text[i];
		if (inStr) {
			if (ch === '\\') { i += 2; continue; }
			if (ch === inStr) inStr = null;
		} else if (ch === '"' || ch === "'") {
			inStr = ch;
		} else if (ch === '(' || ch === '[' || ch === '{') {
			depth++;
		} else if (ch === ')' || ch === ']' || ch === '}') {
			depth--;
			if (depth === 0) return text.substring(afterOpenParen, i);
		}
		i++;
	}
	return null;
}

/**
 * Parse a raw argument string and return the number of positional arguments
 * and the set of explicitly named argument names supplied.
 */
function parseCallArgs(argsStr: string): { positionalCount: integer; namedArgs: Set<string> } {
	const namedArgs = new Set<string>();
	if (argsStr.trim() === '') return { positionalCount: 0, namedArgs };

	// Split on top-level commas only
	const segments: string[] = [];
	let depth = 0;
	let inStr: string | null = null;
	let start = 0;
	for (let i = 0; i < argsStr.length; i++) {
		const ch = argsStr[i];
		if (inStr) {
			if (ch === '\\') { i++; continue; }
			if (ch === inStr) inStr = null;
		} else if (ch === '"' || ch === "'") {
			inStr = ch;
		} else if (ch === '(' || ch === '[' || ch === '{') {
			depth++;
		} else if (ch === ')' || ch === ']' || ch === '}') {
			depth--;
		} else if (ch === ',' && depth === 0) {
			segments.push(argsStr.substring(start, i).trim());
			start = i + 1;
		}
	}
	segments.push(argsStr.substring(start).trim());

	let positionalCount = 0;
	for (const seg of segments) {
		if (seg === '') continue;
		const eqIdx = seg.indexOf('=');
		if (eqIdx > 0) {
			const namePart = seg.substring(0, eqIdx).trim();
			if (/^\w+$/.test(namePart)) {
				namedArgs.add(namePart);
				continue;
			}
		}
		if (seg.startsWith('**') || seg.startsWith('*')) {
			// *args / **kwargs unpacking — we can't statically count these, so bail out
			return { positionalCount: -1, namedArgs };
		}
		positionalCount++;
	}
	return { positionalCount, namedArgs };
}

/**
 * Returns the required parameters of a function: those with no default value
 * that are not `self`, `*args`, or `**kwargs`.
 */
function getRequiredParams(func: import('./data/function').Function): import('./data/function').IParameter[] {
	return func.parameters.filter(p => {
		const name = (p.name || '').trim();
		if (name === 'self') return false;
		if (name.startsWith('*')) return false; // *args / **kwargs
		if (name === '/') return false;         // positional-only separator
		if (name === '') return false;
		return !p.default || p.default.trim() === '';
	});
}

/**
 * Checks all function calls in a MAST document for missing required arguments.
 */
export function checkFunctionSignatures(textDocument: TextDocument): Diagnostic[] {
	const text = textDocument.getText();
	const cache = getCache(textDocument.uri);
	const tokens = cache.getMastFile(textDocument.uri)?.tokens || [];
	const diagnostics: Diagnostic[] = [];

	// Match potential function calls: word(
	const callRegex = /\b(\w+)\s*\(/g;
	let m: RegExpExecArray | null;
	while ((m = callRegex.exec(text)) !== null) {
		const funcName = m[1];
		if (PYTHON_KEYWORDS.has(funcName)) continue;

		const callStart = m.index;
		const parenOpenOffset = m.index + m[0].length - 1; // index of '('

		// Detect member calls (obj.func(...)) and keep them in scope for
		// argument validation.
		let prev = callStart - 1;
		while (prev >= 0 && /\s/.test(text[prev])) {
			prev--;
		}
		const isMemberCall = prev >= 0 && text[prev] === '.';

		let receiverName: string | undefined;
		if (isMemberCall) {
			let r = prev - 1;
			while (r >= 0 && /\s/.test(text[r])) {
				r--;
			}
			let end = r;
			while (r >= 0 && /\w/.test(text[r])) {
				r--;
			}
			if (end >= r + 1) {
				receiverName = text.substring(r + 1, end + 1);
			}
		}

		// Skip calls inside comments or strings
		const tokenType = getTokenTypeAtOffset(textDocument, tokens, callStart);
		if (tokenType === 'comment') continue;
		if (tokenType === 'string') continue;

		// Look up the best callable for this name. For member calls, prefer
		// class methods and, when possible, a class/module matching the receiver.
		let method = cache.getCallableForName(funcName, isMemberCall);
		if (isMemberCall && receiverName) {
			const possible = cache.getPossibleMethods(funcName);
			const receiverMatch = possible.find((cand) => (cand.className || '') === receiverName);
			if (receiverMatch) {
				method = receiverMatch;
			}
		}
		if (!method) continue;

		// Extract the raw argument list
		const argsStr = extractArgString(text, parenOpenOffset + 1);
		if (argsStr === null) continue;

		// Parse supplied arguments
		const { positionalCount, namedArgs } = parseCallArgs(argsStr);

		// If unpacking is used we can't validate statically
		if (positionalCount === -1) continue;

		// Determine which required params are satisfied
		const required = getRequiredParams(method);
		const unfulfilled: string[] = [];
		let positionalUsed = 0;
		for (const param of required) {
			const paramName = (param.name || '').replace(/^\*+/, '').trim();
			if (namedArgs.has(paramName)) continue;
			if (positionalUsed < positionalCount) { positionalUsed++; continue; }
			unfulfilled.push(paramName);
		}

		if (unfulfilled.length > 0) {
			const callEnd = parenOpenOffset + 1 + argsStr.length + 1; // +1 for closing ')'
			diagnostics.push({
				severity: DiagnosticSeverity.Error,
				range: {
					start: textDocument.positionAt(callStart),
					end: textDocument.positionAt(callEnd)
				},
				message: `Missing required argument(s): ${unfulfilled.map(n => `'${n}'`).join(', ')}`,
				source: 'mast extension'
			});
		}
	}

	return diagnostics;
}

export function checkForDeprecatedFunctions(textDocument: TextDocument): Diagnostic[] {
	const text = textDocument.getText();
	debug("Starting deprecated function checking")
	const diagnostics : Diagnostic[] = [];


	let cache = getCache(textDocument.uri)
	for (const f of cache.deprecatedFunctions) {
		const regex = new RegExp(`\\b${f.name}\\b`, "g");
		let m: RegExpExecArray | null;
		while (m = regex.exec(text)) {
			const diagnostic: Diagnostic = {
				severity: DiagnosticSeverity.Warning,
				range: {
					start: textDocument.positionAt(m.index),
					end: textDocument.positionAt(m.index + m[0].length)
				},
				message: `The function "${f.name}" is deprecated. Check the documentation for more details.`,
				source: "mast extension"
			};
			diagnostics.push(diagnostic);
		}
	}
	return diagnostics;
}

