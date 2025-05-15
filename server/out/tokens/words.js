"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseWords = parseWords;
exports.getWordRangeAtPosition = getWordRangeAtPosition;
const vscode_languageserver_1 = require("vscode-languageserver");
const comments_1 = require("./comments");
const ignore = [
    "if",
    "else",
    "await",
    "not",
    "is",
    "None",
    "yaml",
    "in",
    "True",
    "False",
    "shared",
    "while"
];
function parseWords(doc) {
    let ret = [];
    const variableRX = /([\w_\/]+)/gm;
    const num = /(\d+)/;
    const text = doc.getText();
    let m;
    const strings = (0, comments_1.getStrings)(doc).concat((0, comments_1.getComments)(doc));
    while (m = variableRX.exec(text)) {
        const v = m[1];
        const start = m[0].indexOf(v) + m.index;
        const end = start + m[0].length;
        if (!(0, comments_1.isInString)(doc, m.index) || !(0, comments_1.isInComment)(doc, m.index) || v.match(num)?.[0] !== null) {
            const range = { start: doc.positionAt(start), end: doc.positionAt(end) };
            let var1 = {
                name: v,
                range: range,
                doc: doc.uri
            };
            ret.push(var1);
        }
    }
    ret = [...new Map(ret.map(v => [v.range, v])).values()];
    // debug(ret);
    return ret;
}
function getWordRangeAtPosition(doc, _pos) {
    const wordRE = /([\w_\/]+)/;
    const pos = doc.offsetAt(_pos);
    const startOfLine = pos - _pos.character;
    const endPosition = vscode_languageserver_1.Position.create(_pos.line + 1, 0);
    const end = doc.offsetAt(endPosition);
    const sub = doc.getText().substring(startOfLine, end - 1);
    let m;
    while (m = wordRE.exec(sub)) {
        let w = m[1];
        if (m.index <= _pos.character && m.index + w.length >= _pos.character) {
            return w;
        }
    }
    return "";
}
//# sourceMappingURL=words.js.map