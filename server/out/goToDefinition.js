"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onDefinition = onDefinition;
const fileFunctions_1 = require("./fileFunctions");
const comments_1 = require("./tokens/comments");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const console_1 = require("console");
const hover_1 = require("./hover");
const tokens_1 = require("./tokens/tokens");
const cache_1 = require("./cache");
const vscode_uri_1 = require("vscode-uri");
async function onDefinition(doc, pos) {
    // First, let's check if it's in a comment or string
    if ((0, comments_1.isInComment)(doc, doc.offsetAt(pos)) || (0, comments_1.isInString)(doc, doc.offsetAt(pos)) || (0, comments_1.isInYaml)(doc, doc.offsetAt(pos))) {
        (0, console_1.debug)("Is a comment, string, or metadata");
        return undefined;
    }
    const text = doc.getText();
    const str = text.substring(0, doc.offsetAt(pos));
    const lstart = str.lastIndexOf("\n") + 1; // The +1 gets rid of the newline character
    const line = str.substring(lstart, str.length);
    (0, console_1.debug)(line);
    let hoveredLine = (0, hover_1.getCurrentLineFromTextDocument)(pos, doc);
    const symbol = (0, hover_1.getHoveredSymbol)(hoveredLine, pos.character);
    // Now we determine what type of symbol it is.
    // TODO: Expand on this.
    // NOTE:
    // At this point, we're NOT going to get stuff from sbs or sbs_utils.
    // Even LegendaryMissions can be a later thing.
    // We're going to focus on just stuff within the current mission folder.
    // First, let's check if it has a period in front of it
    const s = hoveredLine.indexOf(symbol);
    const icm = (0, tokens_1.isClassMethod)(hoveredLine, symbol);
    const isFunc = (0, tokens_1.isFunction)(hoveredLine, symbol);
    if (s + symbol.length == pos.character) {
        if (isFunc) {
            // Check if this is a function in a .py file within the current mission.
            for (const p of (0, cache_1.getCache)(doc.uri).pyFileCache) {
                (0, console_1.debug)("Checking py file: " + p.uri);
                let uri = vscode_uri_1.URI.parse(p.uri).toString();
                (0, console_1.debug)(uri);
                (0, console_1.debug)(p.defaultFunctions);
                for (const f of p.defaultFunctions) {
                    if (f.name === symbol) {
                        // Now we know which file we need to parse
                        // await sendToClient("showFile",uri); // Probably not how to do this, though I'll keep this around for now, just in case.
                        let loc = await getFunctionDefinitionLocation(f.sourceFile, symbol);
                        if (loc !== undefined)
                            return loc;
                    }
                }
            }
        }
    }
    let start = { line: pos.line, character: 1 };
    let end = { line: pos.line, character: 5 };
    let range = {
        start: start,
        end: end
    };
    let def = {
        uri: doc.uri,
        range: range
    };
    return def;
}
async function getFunctionDefinitionLocation(sourceFile, searchFor) {
    /// TODO: Can't use documents, that's only using OPEN documents. So I'll have to load the file that's needed
    const text = await (0, fileFunctions_1.readFile)(sourceFile);
    const d = vscode_languageserver_textdocument_1.TextDocument.create(sourceFile, "py", 1, text);
    let last = text.lastIndexOf(searchFor);
    while (last !== -1) {
        if (text.substring(0, last).trim().endsWith("def")) {
            break;
        }
    }
    if (last === -1)
        return;
    const range = {
        start: d.positionAt(last),
        end: d.positionAt(last + searchFor.length)
    };
    (0, console_1.debug)(d.uri);
    const loc = { uri: "file:///" + d.uri, range: range };
    (0, console_1.debug)("Location found");
    (0, console_1.debug)(loc);
    return loc;
}
//# sourceMappingURL=goToDefinition.js.map