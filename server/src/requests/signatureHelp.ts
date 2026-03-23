import { SignatureHelpParams, SignatureHelp, integer, SignatureInformation, ParameterInformation, Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { debug } from 'console';
import { getCache } from './../cache';
import { CRange, replaceRegexMatchWithUnderscore } from './../tokens/comments';
import { getCurrentLineFromTextDocument, getHoveredSymbol } from './hover';
import { isClassMethod } from './../tokens/tokens';
import { findNamedArg } from './autocompletion';
import { TokenInfo } from './../requests/semanticTokens';



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
		debug(`Token-based: func="${func}", param=${pNum}, named=${callContext.parameterName || ''}`);
		
		// Get the method and build signature
		const method = cache.getMethod(func);
		if (method) {
			const sig = method.buildSignatureInformation();
			if (callContext.parameterName && method.parameters && method.parameters.length > 0) {
				const namedIndex = method.parameters.findIndex(p => p.name === callContext.parameterName);
				if (namedIndex >= 0) {
					pNum = namedIndex;
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
	let method = cache.getMethod(func);

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
): { functionName: string; parameterIndex: number; parameterName?: string } | undefined {
	const targetOffset = document.offsetAt(position);

	// Find the token at or before the cursor
	let tokenAtCursor = -1;
	for (let i = tokens.length - 1; i >= 0; i--) {
		const tok = tokens[i];
		const tokOffset = document.offsetAt({ line: tok.line, character: tok.character });
		if (tokOffset <= targetOffset) {
			tokenAtCursor = i;
			break;
		}
	}

	if (tokenAtCursor === -1) {
		return undefined;
	}

	// Walk backward from cursor, tracking parenthesis depth
	let parenDepth = 0;
	let commaCount = 0;
	let foundOpenParen = false;
	let openParenIndex = -1;

	for (let i = tokenAtCursor; i >= 0; i--) {
		const tok = tokens[i];

		// Skip string tokens (unless inside interpolation)
		if (tok.type === 'string') {
			continue;
		}

		if (tok.type === 'operator') {
			if (tok.text === ')') {
				parenDepth++;
			} else if (tok.text === '(') {
				if (parenDepth === 0) {
					foundOpenParen = true;
					openParenIndex = i;
					break;
				}
				parenDepth--;
			} else if (tok.text === ',' && parenDepth === 0) {
				commaCount++;
			}
		}
	}

	if (!foundOpenParen || openParenIndex === -1) {
		return undefined;
	}

	// Look backward from the opening paren for the function/method name
	let funcIndex = -1;
	for (let i = openParenIndex - 1; i >= 0; i--) {
		const tok = tokens[i];
		if (tok.type === 'function' || tok.type === 'method') {
			funcIndex = i;
			break;
		}
		// Skip whitespace/operator tokens like '.', but stop on other operators
		if (tok.type === 'operator' && tok.text !== '.') {
			break;
		}
	}

	if (funcIndex === -1) {
		return undefined;
	}

	// Determine whether the current argument segment is named (e.g. foo(bar=1)).
	let argDepth = 0;
	let activeArgStart = openParenIndex + 1;
	for (let i = openParenIndex + 1; i <= tokenAtCursor; i++) {
		const tok = tokens[i];
		if (tok.type !== 'operator') {
			continue;
		}
		if (tok.text === '(' || tok.text === '[' || tok.text === '{') {
			argDepth++;
			continue;
		}
		if (tok.text === ')' || tok.text === ']' || tok.text === '}') {
			if (argDepth > 0) {
				argDepth--;
			}
			continue;
		}
		if (tok.text === ',' && argDepth === 0) {
			activeArgStart = i + 1;
		}
	}

	let parameterName: string | undefined = undefined;
	argDepth = 0;
	for (let i = activeArgStart; i <= tokenAtCursor; i++) {
		const tok = tokens[i];
		if (tok.type === 'operator') {
			if (tok.text === '(' || tok.text === '[' || tok.text === '{') {
				argDepth++;
				continue;
			}
			if (tok.text === ')' || tok.text === ']' || tok.text === '}') {
				if (argDepth > 0) {
					argDepth--;
				}
				continue;
			}
			if (tok.text === '=' && argDepth === 0) {
				for (let j = i - 1; j >= activeArgStart; j--) {
					const prev = tokens[j];
					if (prev.type === 'operator') {
						if (prev.text === '.') {
							continue;
						}
						break;
					}
					if (/^[a-zA-Z_]\w*$/.test(prev.text)) {
						parameterName = prev.text;
					}
					break;
				}
				break;
			}
		}
	}

	return {
		functionName: tokens[funcIndex].text,
		parameterIndex: commaCount,
		parameterName
	};
}
