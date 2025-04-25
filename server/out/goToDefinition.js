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
const labels_1 = require("./tokens/labels");
const variables_1 = require("./tokens/variables");
async function onDefinition(doc, pos) {
    (0, variables_1.parseVariables)(doc);
    return;
    // First, let's check if it's in a comment or string
    // TODO: Check if it's a styestring or blob string, in which case we should open the applicable file?
    if ((0, comments_1.isInComment)(doc, doc.offsetAt(pos)) || (0, comments_1.isInString)(doc, doc.offsetAt(pos))) {
        (0, console_1.debug)("Is a comment, string, or metadata");
        return undefined;
    }
    const text = doc.getText();
    let hoveredLine = (0, hover_1.getCurrentLineFromTextDocument)(pos, doc);
    (0, console_1.debug)(hoveredLine);
    const symbol = (0, hover_1.getHoveredSymbol)(hoveredLine, pos.character);
    (0, console_1.debug)(symbol);
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
    // Apparently the given position is based off of the last character
    if (s <= pos.character && pos.character <= s + symbol.length) {
        if (icm) {
            // First, we'll check if it's a class function
            // Get the class name
            const className = (0, hover_1.getHoveredSymbol)(hoveredLine, s - 2);
            (0, console_1.debug)(className);
            // For now we're only checking mission py files
            // TODO: Implement definitions for the sbs/sbs_utils stuff
            // 		Will need to figure out a way to convert the uri
            for (const p of (0, cache_1.getCache)(doc.uri).pyFileCache) { //.missionClasses) {
                for (const c of p.classes) {
                    if (c.name === className) {
                        for (const f of c.methods) {
                            if (f.name === symbol) {
                                const loc = f.location;
                                loc.uri = (0, fileFunctions_1.fileFromUri)(loc.uri);
                                return loc;
                            }
                        }
                    }
                }
            }
            // for (const p of getCache(doc.uri).missionPyModules) {
            // 	for (const c of p.classes) {
            // 		if (c.name === className) {
            // 			for (const f of c.methods) {
            // 				if (f.name === symbol) {
            // 					const loc:Location = f.location;
            // 					loc.uri = "file:///" + loc.uri;
            // 					return loc;
            // 				}
            // 			}
            // 		}
            // 	}
            // }
        }
        if (isFunc) {
            // Check if this is a function in a .py file within the current mission.
            for (const p of (0, cache_1.getCache)(doc.uri).pyFileCache) {
                let uri = vscode_uri_1.URI.parse(p.uri).toString();
                for (const f of p.defaultFunctions) {
                    if (f.name === symbol) {
                        // Now we know which file we need to parse
                        // await sendToClient("showFile",uri); // Probably not how to do this, though I'll keep this around for now, just in case.
                        const loc = f.location;
                        loc.uri = (0, fileFunctions_1.fileFromUri)(loc.uri);
                        return loc;
                    }
                }
            }
            for (const p of (0, cache_1.getCache)(doc.uri).missionPyModules) {
                for (const f of p.defaultFunctions) {
                    if (f.name === symbol) {
                        const loc = f.location;
                        loc.uri = (0, fileFunctions_1.fileFromUri)(loc.uri);
                        return loc;
                    }
                }
            }
        }
        // Now let's check over all the labels, to see if it's a label. This will be most useful for most people I think.
        const mainLabels = (0, cache_1.getCache)(doc.uri).getLabels(doc);
        const mainLabelAtPos = (0, labels_1.getMainLabelAtPos)(doc.offsetAt(pos), mainLabels);
        for (const sub of mainLabelAtPos.subLabels) {
            if (sub.name === symbol) {
                (0, console_1.debug)(sub);
                const loc = {
                    uri: (0, fileFunctions_1.fileFromUri)(sub.srcFile),
                    range: sub.range
                };
                return loc;
            }
        }
        for (const main of mainLabels) {
            if (main.name === symbol) {
                (0, console_1.debug)(main);
                const loc = {
                    uri: (0, fileFunctions_1.fileFromUri)(main.srcFile),
                    range: main.range
                };
                return loc;
            }
        }
    }
    // let start: Position = {line: pos.line, character: 1}
    // let end: Position = {line: pos.line, character: 5}
    // let range: Range = {
    // 	start: start,
    // 	end: end
    // }
    // let def: Location = {
    // 	uri: doc.uri,
    // 	range: range
    // }
    return undefined;
}
/**
 * Build a location object.
 * @param doc A {@link TextDocument TextDocument}
 * @param start An {@link integer integer} representing the start of the range in the file.
 * @param end An {@link integer integer} representing the end of the range in the file.
 * @returns
 */
function buildPositionFromIndices(doc, start, end) {
    (0, console_1.debug)(start);
    let startPos = doc.positionAt(start);
    (0, console_1.debug)(startPos);
    let endPos = doc.positionAt(end);
    let range = {
        start: startPos,
        end: endPos
    };
    let loc = {
        uri: doc.uri,
        range: range
    };
    return loc;
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