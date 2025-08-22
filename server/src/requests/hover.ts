import { debug } from 'console';
import { Hover, integer, Location, MarkupContent, Position, TextDocumentPositionParams } from 'vscode-languageserver';
import { Range, TextDocument } from 'vscode-languageserver-textdocument';
import { CRange, isInComment, isInString } from '../tokens/comments';
import { getCache } from '../cache';
import { getGlobals } from '../globals';
import { getClassOfMethod, isClassMethod, isFunction } from '../tokens/tokens';
import { variableModifiers } from '../tokens/variables';
import { buildLabelDocs, getMainLabelAtPos } from '../tokens/labels';
import { getCurrentArgumentNames } from './autocompletion';
import { Function } from '../data/function';
import path = require('path');
import { fixFileName } from '../fileFunctions';

export function onHover(_pos: TextDocumentPositionParams, text: TextDocument) : Hover | undefined {
	if (text.languageId !== "mast") {
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
	
	// const range: Range = {
	// 	start: t.positionAt(m.index),
	// 	end: t.positionAt(m.index + m[0].length)
	// }
	//debug("Getting line");
	let hoveredLine = getCurrentLineFromTextDocument(_pos.position, text);
	const symbol = getHoveredSymbol(hoveredLine, _pos.position.character);
	// If it's a comment, we'll just ignore it.
	if (isInComment(text,pos)) {
		return undefined;
	}
	if (isInString(text,pos)) {
		const func = before.lastIndexOf("(");
		if (func > 0) {
			const end = before.substring(0,func);
			if (end.endsWith("get") || end.endsWith("set")) {
				for (const b of getGlobals().data_set_entries) {
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
	// debug(hoveredLine);
	if (isClassMethod(hoveredLine, _pos.position.character)) {
		// debug("class method")
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
						hoverText = m.buildCompletionItem().detail;// + "\n\n" + m.completionItem.documentation;
						// debug(hoverText)
						// debug(m.documentation as string);
						// let mc: MarkupContent = {
						// 	kind: "markdown",
						// 	value: "```javascript\n" + m.buildFunctionDetails() + "\n```\n```text\n\n" + (m.documentation as string) + "\n```\n"
						// }
						let mc = m.buildMarkUpContent();
						//mc.value = m.documentation.toString();
						hoverText = mc;
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


		//const func = classObj?.methods.find((value)=>{value.name===symbol});
		
		//hoverText = ""
	} else if (isFunction(hoveredLine,symbol)) {
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
	} else {
		// debug("not class method or function")
		// Check if it's a label
		// debug("Checking if it's a label");
		// debug(path.basename(text.uri));

		const mainLabels = getCache(text.uri).getLabelsAtPos(text, text.offsetAt(_pos.position), false);

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
			if (main.name === symbol) {
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
	let func = getCache(text.uri).getMethod(symbol);
	if (func) {
		return {contents: func.buildMarkUpContent()}
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

export function getHoveredRoute(str: string) {
	const routeLabel: RegExp = /^([ \t]*)(\/{2,})(\w+)(\/\w+)*/m;
	let m: RegExpMatchArray | null;
	let res = "";
	m = str.match(routeLabel);
	if (m) {
		return true;
	}
	return false;
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
