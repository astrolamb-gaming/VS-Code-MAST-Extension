"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onHover = onHover;
exports.getCurrentLineFromTextDocument = getCurrentLineFromTextDocument;
exports.getHoveredSymbol = getHoveredSymbol;
exports.getHoveredRoute = getHoveredRoute;
const console_1 = require("console");
const vscode_languageserver_1 = require("vscode-languageserver");
const comments_1 = require("./tokens/comments");
const cache_1 = require("./cache");
const globals_1 = require("./globals");
const tokens_1 = require("./tokens/tokens");
const variables_1 = require("./tokens/variables");
const labels_1 = require("./tokens/labels");
function onHover(_pos, text) {
    if (text.languageId !== "mast") {
        return undefined;
    }
    //return {contents:""}
    const docPos = text.offsetAt(_pos.position);
    // Get Hover Range
    const pos = text.offsetAt(_pos.position);
    const startOfLine = pos - _pos.position.character;
    const after = text.getText().substring(startOfLine);
    const before = text.getText().substring(startOfLine, pos);
    const cache = (0, cache_1.getCache)(text.uri);
    // const range: Range = {
    // 	start: t.positionAt(m.index),
    // 	end: t.positionAt(m.index + m[0].length)
    // }
    //debug("Getting line");
    let hoveredLine = getCurrentLineFromTextDocument(_pos.position, text);
    const symbol = getHoveredSymbol(hoveredLine, _pos.position.character);
    // If it's a comment, we'll just ignore it.
    if ((0, comments_1.isInComment)(text, pos)) {
        return undefined;
    }
    if ((0, comments_1.isInString)(text, pos)) {
        const func = before.lastIndexOf("(");
        if (func > 0) {
            const end = before.substring(0, func);
            if (end.endsWith("get") || end.endsWith("set")) {
                for (const b of (0, globals_1.getGlobals)().data_set_entries) {
                    if (symbol === b.name) {
                        const hover = {
                            contents: b.docs
                        };
                        return hover;
                    }
                }
            }
        }
        return undefined;
    }
    for (const s of variables_1.variableModifiers) {
        if (s[0] === symbol) {
            return { contents: s[1] };
        }
    }
    // debug(symbol);
    //hover.contents = symbol;
    let hoverText = symbol;
    if ((0, tokens_1.isClassMethod)(hoveredLine, symbol)) {
        const c = (0, tokens_1.getClassOfMethod)(hoveredLine, symbol);
        const classObj = cache.missionClasses; //.find((value)=>{value.name===c});
        for (const co of classObj) {
            let found = false;
            if (co.name === c) {
                (0, console_1.debug)("FOUND");
                (0, console_1.debug)(c);
                for (const m of co.methods) {
                    if (m.name === symbol) {
                        hoverText = m.buildCompletionItem().detail; // + "\n\n" + m.completionItem.documentation;
                        (0, console_1.debug)(m.documentation);
                        // let mc: MarkupContent = {
                        // 	kind: "markdown",
                        // 	value: "```javascript\n" + m.buildFunctionDetails() + "\n```\n```text\n\n" + (m.documentation as string) + "\n```\n"
                        // }
                        let mc = m.buildMarkUpContent();
                        //mc.value = m.documentation.toString();
                        hoverText = mc;
                        if (hoverText === undefined) {
                            (0, console_1.debug)("Error, hoverText is undefined");
                            hoverText = "";
                        }
                        found = true;
                        break;
                    }
                }
            }
            if (found) {
                break;
            }
        }
        //const func = classObj?.methods.find((value)=>{value.name===symbol});
        //hoverText = ""
    }
    else if ((0, tokens_1.isFunction)(hoveredLine, symbol)) {
        // hoverText += "\nFunction"
        for (const m of cache.missionDefaultFunctions) {
            if (m.name === symbol) {
                hoverText = m.buildCompletionItem().detail; // + "\n\n" + m.completionItem.documentation;
                // debug(m.documentation.toString())
                // let mc: MarkupContent = {
                // 	kind: "markdown",
                // 	value: "```javascript\n" + m.buildFunctionDetails() + "\n```\n\n```text\n\n" + m.documentation.toString() + "\n```\n"
                // }
                let mc = m.buildMarkUpContent();
                // mc.value = m.documentation.toString();
                hoverText = mc;
                return { contents: mc };
            }
        }
        for (const m of cache.pyFileCache) {
            for (const p of m.defaultFunctions) {
                if (p.name === symbol) {
                    return { contents: p.buildMarkUpContent() };
                }
            }
        }
    }
    else {
        // Check if it's a label
        const mainLabels = (0, cache_1.getCache)(text.uri).getLabels(text);
        const mainLabelAtPos = (0, labels_1.getMainLabelAtPos)(text.offsetAt(_pos.position), mainLabels);
        for (const sub of mainLabelAtPos.subLabels) {
            if (sub.name === symbol) {
                (0, console_1.debug)(sub);
                // hoverText = sub.comments;
                return { contents: (0, labels_1.buildLabelDocs)(sub) };
            }
        }
        for (const main of mainLabels) {
            if (main.name === symbol) {
                (0, console_1.debug)(main);
                return { contents: (0, labels_1.buildLabelDocs)(main) };
            }
        }
        for (const key of variables_1.variableModifiers) {
            if (key[0] === symbol) {
                return { contents: key[1] };
            }
        }
    }
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
    const hover = {
        contents: hoverText //str
    };
    return hover;
}
function getCurrentLineFromTextDocument(_pos, text) {
    const pos = text.offsetAt(_pos);
    const startOfLine = pos - _pos.character;
    const endPosition = vscode_languageserver_1.Position.create(_pos.line + 1, 0);
    // endPosition.line += 1;
    // endPosition.character = 0;
    const end = text.offsetAt(endPosition);
    const sub = text.getText().substring(startOfLine, end - 1);
    //debug(sub);
    return sub;
}
/**
 * Works but I think the regex version is more efficient - far fewer iterations
 * @param str
 * @param pos
 * @returns
 */
function getHoveredSymbolOld(str, pos) {
    (0, console_1.debug)("Hovering at position: " + pos);
    const eosList = [" ", "(", ")", ".", ",", "+", "-", "=", "{", "}", "[", "]", "<", ">", "/", "*", "\n"];
    const priorStr = str.substring(0, pos);
    let start = 0;
    let end = str.length - 1;
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
            start = s1 + 1;
        }
    }
    return str.substring(start, end);
}
/**
 * @return String containing just the hovered symbol. If it's part of a string, return empty string.
 * @param str The string in which you're finding the hovered item. Get this using {@link getCurrentLineFromTextDocument getCurrentLineFromTextDocument}.
 * @param pos The position in the string where you're hovering. Get this from {@link TextDocumentPositionParams TextDocumentPositionParams}.{@link Position Position}.character
 */
function getHoveredSymbol(str, pos) {
    const words = /[a-zA-Z_/]\w*/g;
    let m;
    let res = "";
    let regexCounter = 0;
    while (m = words.exec(str)) {
        //const start = str.indexOf(m[0]);
        const start = m.index;
        const end = start + m[0].length;
        if (pos >= start && pos <= end) {
            res = str.substring(start, end);
            // If it's a route, we're done here.
            if (getHoveredRoute(res))
                break;
            // If it's not a route, but it doesn't contain slashes, then we're good.
            if (res.match(/[a-zA-Z_]\w*/))
                break;
            // Otherwise, we'll just ignore this and move on.
        }
        regexCounter += 1;
        if (regexCounter > 10) {
            break;
        }
    }
    return res;
}
function getHoveredRoute(str) {
    const routeLabel = /^([ \t]*)(\/{2,})(\w+)(\/\w+)*/m;
    let m;
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
//# sourceMappingURL=hover.js.map