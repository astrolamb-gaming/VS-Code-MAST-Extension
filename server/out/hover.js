"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onHover = onHover;
const console_1 = require("console");
const vscode_languageserver_1 = require("vscode-languageserver");
const comments_1 = require("./comments");
const cache_1 = require("./cache");
function onHover(_pos, text) {
    //return {contents:""}
    const docPos = text.offsetAt(_pos.position);
    // Get Hover Range
    const pos = text.offsetAt(_pos.position);
    const startOfLine = pos - _pos.position.character;
    const after = text.getText().substring(startOfLine);
    // const range: Range = {
    // 	start: t.positionAt(m.index),
    // 	end: t.positionAt(m.index + m[0].length)
    // }
    //debug("Getting line");
    let hoveredLine = getCurrentLineFromTextDocument(_pos, text);
    // If it's a comment, we'll just ignore it.
    if ((0, comments_1.isInComment)(pos)) {
        return { contents: "comment" };
    }
    if ((0, comments_1.isInString)(pos)) {
        return { contents: "string" };
    }
    const symbol = getHoveredSymbol(hoveredLine, _pos.position.character);
    (0, console_1.debug)(symbol);
    //hover.contents = symbol;
    let hoverText = symbol;
    if (isClassMethod(hoveredLine, symbol)) {
        const c = getClassOfMethod(hoveredLine, symbol);
        const classObj = (0, cache_1.getCache)(text.uri).missionClasses.find((value) => { value.name === c; });
        const func = classObj?.methods.find((value) => { value.name === symbol; });
        hoverText = "";
    }
    else if (isFunction(hoveredLine, symbol)) {
        hoverText += "\nFunction";
    }
    // let str: MarkupContent = {
    // 	kind: 'plaintext', // 'markdown' or 'plaintext'
    // 	value: ''
    // }
    const hover = {
        contents: symbol //str
    };
    return hover;
}
function getCurrentLineFromTextDocument(_pos, text) {
    const pos = text.offsetAt(_pos.position);
    const startOfLine = pos - _pos.position.character;
    const endPosition = vscode_languageserver_1.Position.create(_pos.position.line + 1, 0);
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
    const words = /[a-zA-Z_]\w*/g;
    let m;
    let res = "";
    let regexCounter = 0;
    while (m = words.exec(str)) {
        //const start = str.indexOf(m[0]);
        const start = m.index;
        const end = start + m[0].length;
        if (pos >= start && pos <= end) {
            res = str.substring(start, end);
            break;
        }
        regexCounter += 1;
        if (regexCounter > 10) {
            break;
        }
    }
    return res;
}
function isFunction(line, token) {
    const start = line.indexOf(token);
    const end = start + token.length;
    (0, console_1.debug)(line.substring(end).trim());
    if (line.substring(end).trim().startsWith("(")) {
        (0, console_1.debug)("TRUE");
        return true;
    }
    return false;
}
function isClassMethod(line, token) {
    const start = line.indexOf(token);
    const end = start + token.length;
    if (isFunction(line, token)) {
        (0, console_1.debug)(line.substring(0, start));
        if (line.substring(0, start).trim().endsWith(".")) {
            return true;
        }
    }
    return false;
}
function getClassOfMethod(line, token) {
    const start = line.indexOf(token);
    const end = start + token.length;
    line = line.substring(0, start - 1);
    const className = /[a-zA-Z_]\w*$/m;
    let m;
    while (m = className.exec(line)) {
        const c = m[0];
        (0, console_1.debug)(c);
        return c;
    }
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