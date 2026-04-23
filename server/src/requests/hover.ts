import { debug } from 'console';
import { performance } from 'perf_hooks';
import { Hover, integer, MarkupContent, Position, TextDocumentPositionParams } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CRange, getTokenContextAtPosition, getTokenTypeAtOffset, getTokenTypeAtPosition, isInComment, isInString } from '../tokens/comments';
import { getCache } from '../cache';
import { getArtemisGlobals } from '../artemisGlobals';
import { getClassOfMethod } from '../tokens/tokens';
import { getArgDocForLabel, variableModifiers } from '../tokens/variables';
import { buildLabelDocs, getMainLabelAtPos } from '../tokens/labels';
import { Function } from '../data/function';

export function onHover(_pos: TextDocumentPositionParams, text: TextDocument) : Hover | undefined {
	const _t0 = performance.now();
	const _prof = (label: string) => debug(`[hover] ${label}: ${(performance.now() - _t0).toFixed(2)}ms`);

	if (text.languageId !== "mast") {
		// _prof('exit: not mast');
		return undefined;
	}
	//return {contents:""}
	const docPos = text.offsetAt(_pos.position);
	// debug("Char: " + _pos.position.character)

	// Get Hover Range
	const pos : integer = text.offsetAt(_pos.position);
	const startOfLine : integer = pos - _pos.position.character;
	const after: string = text.getText().substring(startOfLine);
	const before: string = text.getText().substring(startOfLine,pos);
	
	const cache = getCache(text.uri);
	const tokens = cache.getMastFile(text.uri)?.tokens;
	// _prof('cache + tokens fetched');
	const tokenContext = getTokenContextAtPosition(text, tokens || [], _pos.position);
	// _prof('getTokenContextAtPosition');

	let hoveredLine = getCurrentLineFromTextDocument(_pos.position, text);
	// const symbol = getHoveredSymbol(hoveredLine, _pos.position.character);
	let symbol = tokenContext.token?.text;
	if (symbol === undefined) {
		// _prof('exit: no symbol');
		symbol = getHoveredSymbol(hoveredLine, _pos.position.character);
	}
	// _prof('get hovered symbol');
	// If it's a comment, we'll just ignore it.
	const isInComment = getTokenTypeAtOffset(text, tokens, pos) === "comment";
	if (isInComment) {
		// _prof('exit: in comment');
		return undefined;
	}
	const isInString = getTokenTypeAtOffset(text, tokens, pos) === "string";
	if (isInString) {
		// _prof('in string check');
		const func = before.lastIndexOf("(");
		if (func > 0) {
			const end = before.substring(0,func);
			if (end.endsWith("get") || end.endsWith("set")) {
				for (const b of getArtemisGlobals().data_set_entries) {
					if (symbol === b.name) {
						const hover: Hover = {
							contents: b.docs
						}
						return hover;
					}
				}
			}
		}
		return undefined;
	}
	for (const s of variableModifiers) {
		if (s[0] === symbol) {
			return {contents: s[1]};
		}
	}
	
	// debug(symbol);
	//hover.contents = symbol;
	
	let hoverText: string|MarkupContent|undefined = symbol;
	const symbolCandidates = new Set<string>();
	if (symbol) {
		const base = symbol.trim();
		if (base.length > 0) {
			symbolCandidates.add(base);
			if (base.startsWith('//')) {
				symbolCandidates.add(base.substring(2));
			} else {
				symbolCandidates.add(`//${base}`);
			}
		}
	}

	if (tokenContext.token?.type === "variable" && symbol) {
		const vars = cache.getVariables(text);
		const mainLabel = getMainLabelAtPos(docPos, cache.getMastFile(text.uri).labelNames);
		const candidates = [];
		for (const v of vars) {
			if (v.name !== symbol || !v.doc || v.doc.trim() === '') {
				continue;
			}
			const varOffset = text.offsetAt(v.range.start);
			if (mainLabel && (varOffset < mainLabel.start || varOffset > mainLabel.end)) {
				continue;
			}
			candidates.push(v);
		}

		if (candidates.length > 0) {
			let best = candidates[0];
			let bestOffset = text.offsetAt(best.range.start);
			for (const v of candidates) {
				const vOffset = text.offsetAt(v.range.start);
				if (vOffset <= docPos && vOffset >= bestOffset) {
					best = v;
					bestOffset = vOffset;
				}
			}

			let varHover = `Description:\n${best.doc.trim()}`;
			if (best.types && best.types.length > 0) {
				const uniqTypes = [...new Set(best.types.filter(t => t && t.trim().length > 0))];
				if (uniqTypes.length > 0) {
					varHover += `\n\nPossible types:\n${uniqTypes.join('\n')}`;
				}
			}

			return { contents: varHover };
		}

		if (mainLabel) {
			const argDoc = getArgDocForLabel(text, tokens || [], mainLabel.range.start.line, symbol);
			if (argDoc && argDoc.trim() !== '') {
				return { contents: `Description:\n${argDoc.trim()}` };
			}
		}
		// Don't want to do this because python (and mast) can take function names as arguments.
		// return undefined;
	}
	// debug(hoveredLine);
	if (tokenContext.token?.type === "method") {
		debug(tokenContext.token.text);
	// if (isClassMethod(hoveredLine, _pos.position.character)) {
		debug("class method")
		const c = getClassOfMethod(hoveredLine,symbol);
		// debug(c);
		const classObj = cache.getClasses();
		const otherFunctions: Function[] = [];
		let found = false;
		for (const co of classObj) {
			
			if (c === undefined || c === "") {
				debug("not a class name")
			}
			// if (co.name === c) {
			// 	debug("FOUND")
			// 	debug(c);
				for (const m of co.methods) {
					if(m.name === symbol) {
						// hoverText = m.buildCompletionItem().detail;// + "\n\n" + m.completionItem.documentation;
						hoverText = m.buildMarkUpContent();
						if (hoverText === undefined) {
							debug("Error, hoverText is undefined")
							hoverText = ""
						}
						
						if (co.name === c) {
							found = true;
							break;
						}
						otherFunctions.push(m);
					}
				}
			// }
			if (found) {
				break;
			}
		}
		// Here we get possible functions for other things...
		if (!found) {
			let info: MarkupContent = {
				kind: 'markdown',
				value: ''
			}
			for (const m of otherFunctions) {
				let mc = m.buildMarkUpContent();
				info.value = info.value + "\n" + mc.value;
				// info = info + m.documentation + "\n"
			}
			hoverText = info;
		}
		return {
			contents: hoverText
		}
	} else if (tokenContext.token?.type === "function") {
	// } else if (isFunction(hoveredLine,symbol)) {
		debug("function")
		// hoverText += "\nFunction"
		for (const p of cache.missionPyModules) {
			for (const m of p.defaultFunctions) {
				if (m.name === symbol) {
					hoverText = m.buildCompletionItem().detail;// + "\n\n" + m.completionItem.documentation;
				// debug(m.documentation.toString())
				// let mc: MarkupContent = {
				// 	kind: "markdown",
				// 	value: "```javascript\n" + m.buildFunctionDetails() + "\n```\n\n```text\n\n" + m.documentation.toString() + "\n```\n"
				// }
				let mc = m.buildMarkUpContent();
				// mc.value = m.documentation.toString();
				hoverText = mc;
				return {contents: mc}
				}
			}
		}
		for (const m of cache.pyFileCache) {
			for (const p of m.defaultFunctions) {
				if (p.name === symbol) {
					return {contents: p.buildMarkUpContent()}
				}
			}
		}
		// Class constructor call, e.g. Vec3()
		for (const c of cache.getClasses()) {
			if (c.name === symbol) {
				if (c.constructorFunction) {
					return { contents: c.constructorFunction.buildMarkUpContent() };
				}
				return { contents: c.documentation };
			}
		}
	} else {
		debug("not class method or function");

		// Check if it's a label
		// debug("Checking if it's a label");
		// debug(path.basename(text.uri));

		// _prof('before getLabelsAtPos');
		const mainLabels = getCache(text.uri).getLabelsAtPos(text, text.offsetAt(_pos.position), false);
		// _prof('getLabelsAtPos');

		// debug("Labels at Pos")
		// debug(getCache(text.uri).getLabelsAtPos(text,text.offsetAt(_pos.position),true));

		// const mainLabels = getCache(text.uri).getLabels(text, false);
		// debug(mainLabels);
		
		// const mainLabelAtPos = getMainLabelAtPos(text.offsetAt(_pos.position),mainLabels);
		// // debug(mainLabelAtPos)
		// // debug(mainLabelAtPos.subLabels)
		// for (const sub of mainLabelAtPos.subLabels) {
		// 	if (sub.name === symbol) {
		// 		// debug(sub);
		// 		// hoverText = sub.comments;
		// 		return {contents: buildLabelDocs(sub)}
		// 	}
		// }
		for (const main of mainLabels) {
			if (symbolCandidates.has(main.name)) {
				// debug(main);
				return {contents: buildLabelDocs(main)}
			}
		}
		for (const key of variableModifiers) {
			if (key[0] === symbol) {
				return {contents: key[1]}
			}
		}
		for (const c of cache.getClasses()) {
			if (c.name === symbol) {
				return {contents: c.documentation}
			}
		}
	}

	// Now we'll check for any instance where it COULD be a function name. Because Python.
	// _prof('before getMethod')
	debug("Checking for method match")
	let func = getCache(text.uri).getMethod(symbol);
	// _prof('getMethod');
	debug("Method: " + func?.name);
	if (func) {
		// _prof('exit: found method');
		return {contents: func.buildMarkUpContent()}
	}

	// Constructor/class fallback, including cases where token classification is ambiguous.
	for (const c of cache.getClasses()) {
		if (c.name === symbol) {
			if (c.constructorFunction) {
				return { contents: c.constructorFunction.buildMarkUpContent() };
			}
			return { contents: c.documentation };
		}
	}

	// debug("something else")

	


	// Now we'll check for variables
	// for (const file of getCache(text.uri).mastFileCache) {
	// 	for (const v of file.variables) {
	// 		if (v.name === symbol) {
	// 			let doc: string = "Possible types:\n"
	// 			for (const t of v.types) {
	// 				if (!doc.includes(t)) {
	// 					doc = doc + "\n"
	// 				}
	// 			}
	// 			return {contents: doc}
	// 		}
	// 	}
	// }

	// let str: MarkupContent = {
	// 	kind: 'plaintext', // 'markdown' or 'plaintext'
	// 	value: ''
	// }
	//hoverText = mc;
	const hover: Hover = {
		contents: hoverText//str
	}

	_prof('total (no match)');
	return undefined;
}

export function getCurrentLineFromTextDocument(_pos: Position, text: TextDocument) : string {
	const pos : integer = text.offsetAt(_pos);
	const startOfLine : integer = pos - _pos.character;
	const endPosition = Position.create(_pos.line + 1, 0);
	// endPosition.line += 1;
	// endPosition.character = 0;
	const end : integer = text.offsetAt(endPosition);
	const sub = text.getText().substring(startOfLine,end-1);
	//debug(sub);
	return sub;
}

/**
 * Works but I think the regex version is more efficient - far fewer iterations
 * @param str 
 * @param pos 
 * @returns 
 */
function getHoveredSymbolOld(str: string, pos: integer): string {
	debug("Hovering at position: " + pos);
	const eosList: string[] = [" ", "(", ")", ".", ",", "+", "-", "=", "{", "}", "[", "]", "<", ">", "/", "*", "\n"];
	const priorStr = str.substring(0,pos);
	let start = 0;
	let end = str.length-1;
	for (const c in eosList) {
		//debug("Looking for " + eosList[c]);
		const e1 = str.indexOf(eosList[c], pos); // Start search here, going on to end, so we find the end pos
		const s1 = priorStr.lastIndexOf(eosList[c]); // Start from end, going to beginning, starting from pos
		//debug("e1 = " + e1);
		//debug("s2 = " + s1);
		if (e1 < end && e1 !== -1) {
			end = e1;
		}
		if (s1 > start && s1 !== -1) {
			start = s1+1;
		}
	}
	return str.substring(start,end);
}

/**
 * @return String containing just the hovered symbol. If it's part of a string, return empty string.
 * @param str The string in which you're finding the hovered item. Get this using {@link getCurrentLineFromTextDocument getCurrentLineFromTextDocument}.
 * @param pos The position in the string where you're hovering. Get this from {@link TextDocumentPositionParams TextDocumentPositionParams}.{@link Position Position}.character
 */
export function getHoveredSymbol(str: string, pos: integer): string {
	let res = "";
	let range = getHoveredWordRange(str,pos);
	res = str.substring(range.start, range.end);
	// let regexCounter = 0;
	// while (m = words.exec(str)) {
		
	// 	//const start = str.indexOf(m[0]);
	// 	const start = m.index;
	// 	const end = start + m[0].length;
	// 	if (pos >= start && pos <= end) {
	// 		res = str.substring(start,end);
	// 		// If it's a route, we're done here.
	// 		if (getHoveredRoute(res)) break;
	// 		// If it's not a route, but it doesn't contain slashes, then we're good.
	// 		if (res.match(/[a-zA-Z_]\w*/)) break;
	// 		// Otherwise, we'll just ignore this and move on.
	// 	}
	// 	regexCounter += 1;
	// 	if (regexCounter > 10) {
	// 		break;
	// 	}
	// }
	return res;
}

export function getHoveredWordRange(str:string, pos: integer): CRange {
	const r: CRange = {
		start: 0,
		end: 0
	}
	const words : RegExp = /[a-zA-Z_/]\w*/g;
	let m: RegExpExecArray | null;
	let res = "";
	while (m = words.exec(str)) {
		//const start = str.indexOf(m[0]);
		const start = m.index;
		const end = start + m[0].length;
		if (pos >= start && pos <= end) {
			// res = str.substring(start,end);
			r.start = start;
			r.end = end;
			// // If it's a route, we're done here.
			// if (getHoveredRoute(res)) break;
			// // If it's not a route, but it doesn't contain slashes, then we're good.
			// if (res.match(/[a-zA-Z_]\w*/)) break;
			// // Otherwise, we'll just ignore this and move on.
		}
	}
	return r;
}


/**
 * a shared variable is shared by all tasks. i.e. global.

All code runs on the server, with signals it is the context that matters.

A shared signal means any client can emit it and the code doesn't run on a specific client CONTEXT. i.e. a global context. 
A non-shared signal runs on the context of the calling client.

A shared signal does not run on the mainserver's GUI context or any GUI context for that matter.



re: assigned, client, and temp

They are additional scopes that I couldn't get stable in time for 1.0.

They may return or may not.

They do nothing now but the intent was.

- client would be 'shared' across all task on a client.
- temp would not be copied to and task scheduled (currently a schedule task inherits a copy all the values of the scheduling task)
- Assigned would be a space object that a task is assigned to
 */
