"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onHover = onHover;
const server_1 = require("./server");
const vscode_languageserver_1 = require("vscode-languageserver");
function onHover(_pos, text) {
    // Get Hover Range
    const pos = text.offsetAt(_pos.position);
    const startOfLine = pos - _pos.position.character;
    const after = text.getText().substring(startOfLine);
    let str = {
        kind: 'plaintext', // 'markdown' or 'plaintext'
        value: ''
    };
    const hover = {
        contents: str
    };
    // const range: Range = {
    // 	start: t.positionAt(m.index),
    // 	end: t.positionAt(m.index + m[0].length)
    // }
    //debug("Getting line");
    let hoveredLine = getCurrentLineFromTextDocument(_pos, text);
    // If it's a comment, we'll just ignore it.
    const comment = hoveredLine.indexOf("#");
    if (comment !== -1 && comment < _pos.position.character) {
        return hover;
    }
    const symbol = getHoveredSymbol(hoveredLine, _pos.position.character);
    //debug(symbol);
    return hover;
}
function getEndOfSymbol(str) {
    let ret = 0;
    const eosList = [" ", "(", ")", ".", "\n"];
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
    (0, server_1.debug)("Hovering at position: " + pos);
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
    const words = /\w+/g;
    let m;
    let res = "";
    let regexCounter = 0;
    while (m = words.exec(str)) {
        const start = str.indexOf(m[0]);
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
    regexCounter = 0;
    const checkIsString = /\".+\w+.+\"/;
    let isString = false;
    while (m = checkIsString.exec(str)) {
        if (m[0].indexOf(res) !== -1) {
            isString = true;
            break;
        }
        regexCounter += 1;
        if (regexCounter > 10) {
            break;
        }
    }
    const isVariableInString = /\{.+\w+.+\}/;
    let isVar = false;
    if (isString) {
        regexCounter = 0;
        while (m = isVariableInString.exec(str)) {
            if (m[0].indexOf(res) !== -1) {
                isVar = true;
                break;
            }
            regexCounter += 1;
            if (regexCounter > 10) {
                break;
            }
        }
    }
    if (isString && !isVar) {
        return "";
    }
    return res;
}
//# sourceMappingURL=hover.js.map