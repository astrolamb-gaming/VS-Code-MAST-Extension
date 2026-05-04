import { SignatureHelpParams, SignatureHelp, integer, SignatureInformation, ParameterInformation, Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { debug } from 'console';
import { getCache } from './../cache';
import { CRange, replaceRegexMatchWithUnderscore } from './../tokens/comments';
import { getCurrentLineFromTextDocument, getHoveredSymbol } from './hover';
import { isClassMethod } from './../tokens/tokens';
import { findNamedArg } from './autocompletion';
import { TokenInfo } from './../requests/semanticTokens';

function toParameterName(name: string | undefined): string | undefined {
	if (!name) {
		return undefined;
	}
	const cleaned = name.split('=')[0].split(':')[0].trim();
	return cleaned.length > 0 ? cleaned : undefined;
}

export function splitTopLevelArgs(argsText: string): string[] {
	const segments: string[] = [];
	let start = 0;
	let dParen = 0;
	let dBracket = 0;
	let dBrace = 0;
	let quote: string | null = null;
	let escaped = false;
	let inLineComment = false;
	let inBlockComment = false;

	for (let i = 0; i < argsText.length; i++) {
		const ch = argsText[i];
		const next = i + 1 < argsText.length ? argsText[i + 1] : '';

		if (inLineComment) {
			if (ch === '\n') inLineComment = false;
			continue;
		}
		if (inBlockComment) {
			if (ch === '*' && next === '/') {
				inBlockComment = false;
				i++;
			}
			continue;
		}
		if (quote !== null) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (ch === '\\') {
				escaped = true;
				continue;
			}
			if (ch === quote) {
				quote = null;
			}
			continue;
		}

		if (ch === '#') {
			inLineComment = true;
			continue;
		}
		if (ch === '/' && next === '*') {
			inBlockComment = true;
			i++;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			continue;
		}
		if (ch === '(') dParen++;
		else if (ch === ')' && dParen > 0) dParen--;
		else if (ch === '[') dBracket++;
		else if (ch === ']' && dBracket > 0) dBracket--;
		else if (ch === '{') dBrace++;
		else if (ch === '}' && dBrace > 0) dBrace--;

		if (ch === ',' && dParen === 0 && dBracket === 0 && dBrace === 0) {
			segments.push(argsText.substring(start, i));
			start = i + 1;
		}
	}

	segments.push(argsText.substring(start));
	return segments;
}

export function getFirstUnusedParameterIndex(
	parameters: Array<{ name: string }>,
	argsTextBeforeCursor: string,
	currentNamedArg?: string
): number | undefined {
	if (!parameters || parameters.length === 0) {
		return undefined;
	}

	const paramNames = parameters.map((p) => toParameterName(p.name));
	const satisfied = new Set<number>();

	const segments = splitTopLevelArgs(argsTextBeforeCursor);
	const completedSegments = segments.length > 0 ? segments.slice(0, -1) : [];

	const namedArgs = new Set<string>();
	let positionalCount = 0;
	for (const raw of completedSegments) {
		const seg = raw.trim();
		if (seg === '') continue;

		const named = seg.match(/^([A-Za-z_]\w*)\s*=/);
		if (named) {
			namedArgs.add(named[1]);
			continue;
		}
		if (seg.startsWith('*')) {
			continue;
		}
		positionalCount++;
	}

	for (let i = 0; i < paramNames.length; i++) {
		const pn = paramNames[i];
		if (!pn) continue;
		if (namedArgs.has(pn)) {
			satisfied.add(i);
		}
	}

	for (let i = 0; i < paramNames.length && positionalCount > 0; i++) {
		if (satisfied.has(i)) continue;
		const pn = paramNames[i];
		if (!pn || pn === '/' || pn.startsWith('*') || pn === 'self') continue;
		satisfied.add(i);
		positionalCount--;
	}

	if (currentNamedArg) {
		const namedIndex = paramNames.findIndex((p) => p === currentNamedArg);
		// Only highlight if this named arg isn't already satisfied (not already provided earlier)
		if (namedIndex >= 0 && !satisfied.has(namedIndex)) {
			return namedIndex;
		}
	}

	if (namedArgs.size === 0) {
		return undefined;
	}

	for (let i = 0; i < paramNames.length; i++) {
		if (satisfied.has(i)) continue;
		const pn = paramNames[i];
		if (!pn || pn === '/' || pn.startsWith('*') || pn === 'self') continue;
		return i;
	}

	return undefined;
}


export function onSignatureHelp(_textDocPos: SignatureHelpParams, text: TextDocument): SignatureHelp | undefined {
	let sh : SignatureHelp = {
		signatures: []
	}
	//const text = documents.get(_textDocPos.textDocument.uri);
	
	if (text === undefined) {
		debug("Document ref is undefined");
		return sh;
	}
	const t = text.getText();
	if (t === undefined) {
		debug("Document text is undefined");
		return sh;
	}

	const cache = getCache(text.uri);

	// Try token-based approach first (more reliable)
	const tokens = cache.getMastFile(text.uri)?.tokens || [];
	let callContext = getCallContextFromTokens(tokens, _textDocPos.position, text);
	
	if (callContext) {
		const func = callContext.functionName;
		let pNum = callContext.parameterIndex;
		// parameterName is only set when the user explicitly typed `name=` in the current segment
		const explicitNamedArg = callContext.parameterName;
		
		// Get the best callable for this symbol and build signature
		const method = cache.getCallableForName(func, callContext.isMethodCall);
		if (method) {
			debug(`Token-based: func="${func}", param=${pNum}, named=${explicitNamedArg || ''}`);
			const sig = method.buildSignatureInformation();
			if (method.parameters && method.parameters.length > 0) {
				const computed = getFirstUnusedParameterIndex(
					method.parameters,
					callContext.argsTextBeforeCursor || '',
					explicitNamedArg
				);
				if (computed !== undefined) {
					pNum = computed;
				}
			}
			sh.activeParameter = pNum;
			if (sig && sig.parameters && pNum < sig.parameters.length) {
				sh.signatures.push(sig);
				return sh;
			}
		}
	}

	// Fallback to line-based parsing
	debug("Falling back to line-based parsing");

	// Calculate the position in the text's string value using the Position value.
	const pos : integer = text.offsetAt(_textDocPos.position);
	const startOfLine : integer = pos - _textDocPos.position.character;


	const iStr : string = t.substring(startOfLine,pos);
	// const line = getCurrentLineFromTextDocument(_textDocPos.position,text);
	

	// Calculate which parameter is the active one
	const func = getCurrentMethodName(iStr);
	debug(func)
	if (func === "") return;
	const fstart = iStr.lastIndexOf(func);
	let wholeFunc = iStr.substring(fstart,iStr.length);
	
	
	let obj = /{.*?(}|$)/gm;
	//TODO: I THINK this will handle nested functions... test later
	// let obj = /(\w+\(.*\))|({.*?(}|$))/gm;

	// let isClassMethodRes = isClassMethod(line, fstart);
	let isClassMethodRes = isClassMethod(iStr, fstart);
	// Check for the current function name and get SignatureInformation for that function.
	/**The {@link SignatureInformation SignatureInformation} for this function. */
	let sig = cache.getSignatureOfMethod(func,isClassMethodRes);

	/**The name of the current argument */
	let arg:string|undefined = "";
	// Check if there's a named argument
	arg = findNamedArg(iStr);
	if (arg !== undefined && sig !== undefined && sig.parameters) {
		for (const s in sig.parameters) {
			if (sig.parameters[s].label === arg) {
				// If a named arg is found, set the arg name and return
				sig.activeParameter = parseInt(s);
				debug(s)
				debug(sig.activeParameter)
				sh.signatures.push(sig);
				return sh;
			}
		}
	}
	debug("Not using sig")
	// Currently probably never runs, but you never know

	
	/** Here we get rid of some things that could cause parsing issues.
	 We replace fstrings and nested functions with _, and anythnig within quotes to just empty quotes.
	 This eliminates commas that mess with the current parameter, as well as functions etc in fstrings */
	wholeFunc = wholeFunc.replace(obj, "_").replace(/\".*?\"/,'""');
	const arr = wholeFunc.split(",");
	/** The current array index */
	const pNum = arr.length - 1;
	sh.activeParameter = pNum;
	arg = arr[pNum];
	
	
	
	/**The {@link Function Function} in question */
	let method = cache.getCallableForName(func, isClassMethodRes);

	// TODO:
	// - Keep copy of arg list from param list
	// - If the arg is not yet named,
	// - remove any arg that is already used in the function def
	// - Use the index of the first arg as the active sig
	
	if (method) {
		sig = method.buildSignatureInformation();
		let usedArgs = [];
		for (const p of method.parameters) {
			if (wholeFunc.includes(p.name + "=") || wholeFunc.includes(p.name + " =")) {
				usedArgs.push(p.name);
			}
		}
		for (const p in method.parameters) {
			let found = false;
			for (const a of arr) {
				// Exclude already listed args
				// debug(a);
				// debug(p);
				if (a.split("=")[0].trim() === p) {
					found = true;
				}
			}
			if (found) continue;
			const name = method.parameters[p].name;
			if (name === arg) {
				sh.activeParameter = parseInt(p);
				if (sig) {
					sh.signatures.push(sig);
					return sh;
				}
			}
		}
	}

	
	// debug(sig)
	if (sig !== undefined) {
		sh.signatures.push(sig);
	}

//#region Testing
	// This is just for testing
	let p: ParameterInformation = {
		label: "Parameter 1",
		documentation: "Param 1 Documentation"
	}
	let p2: ParameterInformation = {
		label: "Parameter 2",
		documentation: "Param 2 Documentation"
	}
	let si: SignatureInformation = {
		label: "SignatureInformation",
		documentation: "Documentation",
		parameters: []
	}
	si.parameters?.push(p);
	si.parameters?.push(p2);
//#endregion
	return sh;
}

/**
 * Given a string, this function will return the name of the function which is having parameters added to it.
 * @param iStr The string
 * @returns A string representing the name of the function.
 */
export function getCurrentMethodName(iStr: string): string {
	let t: RegExpMatchArray | null;
	t = iStr.match(/\w+\(([^\(\)])*\)/g);
	while (t) {
		let s = iStr.indexOf(t[0])
		let r: CRange = {
			start: s,
			end: t[0].length + s
		}
		iStr = replaceRegexMatchWithUnderscore(iStr,r);
		t = iStr.match(/\w+\(([^\(\)])*\)/g);
	}
	let last = iStr.lastIndexOf("(");
	let symbol = getHoveredSymbol(iStr,last);
	// debug(symbol);
	return symbol;
}

/**
 * Walk backward through tokens from cursor position to find the current function call
 * and determine which parameter we're on.
 * 
 * @param tokens TokenInfo array from the lexer
 * @param position Cursor position (line, character)
 * @param document TextDocument
 * @returns { functionName, parameterIndex, parameterName? } or undefined if not in a call
 */
export function getCallContextFromTokens(
	tokens: TokenInfo[],
	position: Position,
	document: TextDocument
): { functionName: string; parameterIndex: number; parameterName?: string; argsTextBeforeCursor?: string; isMethodCall: boolean } | undefined {
	const targetOffset = document.offsetAt(position);
	if (targetOffset <= 0 || tokens.length === 0) {
		return undefined;
	}
	const tokenOffsets = tokens.map(tok => document.offsetAt({ line: tok.line, character: tok.character }));

	let tokenAtCursor = -1;
	for (let i = tokens.length - 1; i >= 0; i--) {
		if (tokenOffsets[i] <= targetOffset) {
			tokenAtCursor = i;
			break;
		}
	}
	if (tokenAtCursor === -1) {
		return undefined;
	}

	let openParenIndex = -1;
	let parenDepth = 0;
	let bracketDepth = 0;
	let braceDepth = 0;
	for (let i = tokenAtCursor; i >= 0; i--) {
		const tok = tokens[i];
		if (tok.type !== 'operator') {
			continue;
		}
		switch (tok.text) {
			case ')':
				parenDepth++;
				break;
			case ']':
				bracketDepth++;
				break;
			case '}':
				braceDepth++;
				break;
			case '(':
				if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
					openParenIndex = i;
					break;
				}
				if (parenDepth > 0) {
					parenDepth--;
				}
				break;
			case '[':
				if (bracketDepth > 0) {
					bracketDepth--;
				}
				break;
			case '{':
				if (braceDepth > 0) {
					braceDepth--;
				}
				break;
		}
		if (openParenIndex !== -1) {
			break;
		}
	}
	if (openParenIndex === -1) {
		return undefined;
	}

	let funcIndex = -1;
	for (let i = openParenIndex - 1; i >= 0; i--) {
		const tok = tokens[i];
		if (tok.type === 'function' || tok.type === 'method') {
			funcIndex = i;
			break;
		}
		if (tok.type === 'operator' && tok.text === '.') {
			continue;
		}
		break;
	}
	if (funcIndex === -1) {
		return undefined;
	}

	let parameterIndex = 0;
	let segmentStart = tokenOffsets[openParenIndex] + tokens[openParenIndex].length;
	parenDepth = 0;
	bracketDepth = 0;
	braceDepth = 0;
	let callClosedBeforeCursor = false;
	for (let i = openParenIndex + 1; i <= tokenAtCursor; i++) {
		const tok = tokens[i];
		if (tok.type !== 'operator') {
			continue;
		}
		switch (tok.text) {
			case '(':
				parenDepth++;
				break;
			case ')':
					if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
						// We passed the closing paren of the call itself; cursor is no longer in this call context.
						callClosedBeforeCursor = true;
						break;
					}
				if (parenDepth > 0) {
					parenDepth--;
				}
				break;
			case '[':
				bracketDepth++;
				break;
			case ']':
				if (bracketDepth > 0) {
					bracketDepth--;
				}
				break;
			case '{':
				braceDepth++;
				break;
			case '}':
				if (braceDepth > 0) {
					braceDepth--;
				}
				break;
			case ',':
				if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
					parameterIndex++;
					segmentStart = tokenOffsets[i] + tok.length;
				}
				break;
		}
		if (callClosedBeforeCursor) {
			break;
		}
	}

	if (callClosedBeforeCursor) {
		return undefined;
	}

	const text = document.getText();
	const argsTextBeforeCursor = text.substring(tokenOffsets[openParenIndex] + tokens[openParenIndex].length, targetOffset);
	const segmentText = text.substring(segmentStart, targetOffset);
	let parameterName: string | undefined = undefined;
	let quote: string | null = null;
	let escaped = false;
	let inLineComment = false;
	let inBlockComment = false;
	let nestedParenDepth = 0;
	let nestedBracketDepth = 0;
	let nestedBraceDepth = 0;

	for (let i = 0; i < segmentText.length; i++) {
		const ch = segmentText[i];
		const next = i + 1 < segmentText.length ? segmentText[i + 1] : '';

		if (inLineComment) {
			if (ch === '\n') {
				inLineComment = false;
			}
			continue;
		}
		if (inBlockComment) {
			if (ch === '*' && next === '/') {
				inBlockComment = false;
				i++;
			}
			continue;
		}
		if (quote !== null) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (ch === '\\') {
				escaped = true;
				continue;
			}
			if (ch === quote) {
				quote = null;
			}
			continue;
		}
		if (ch === '#') {
			inLineComment = true;
			continue;
		}
		if (ch === '/' && next === '*') {
			inBlockComment = true;
			i++;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			continue;
		}
		if (ch === '(') {
			nestedParenDepth++;
			continue;
		}
		if (ch === ')' && nestedParenDepth > 0) {
			nestedParenDepth--;
			continue;
		}
		if (ch === '[') {
			nestedBracketDepth++;
			continue;
		}
		if (ch === ']' && nestedBracketDepth > 0) {
			nestedBracketDepth--;
			continue;
		}
		if (ch === '{') {
			nestedBraceDepth++;
			continue;
		}
		if (ch === '}' && nestedBraceDepth > 0) {
			nestedBraceDepth--;
			continue;
		}
		if (ch === '=' && nestedParenDepth === 0 && nestedBracketDepth === 0 && nestedBraceDepth === 0) {
			const prev = i > 0 ? segmentText[i - 1] : '';
			const nextEq = i + 1 < segmentText.length ? segmentText[i + 1] : '';
			const isComparisonOrCompound = prev === '=' || nextEq === '=' || /[!<>+\-*/%&|^]/.test(prev);
			if (isComparisonOrCompound) {
				continue;
			}
			const leftSide = segmentText.substring(0, i).trim();
			const nameMatch = leftSide.match(/^([A-Za-z_]\w*)$/);
			if (nameMatch) {
				parameterName = nameMatch[1];
				break;
			}
		}
	}

	return {
		functionName: tokens[funcIndex].text,
		parameterIndex,
		parameterName,
		argsTextBeforeCursor,
		isMethodCall: tokens[funcIndex].type === 'method'
	};
}
