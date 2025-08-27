"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LabelType = void 0;
exports.parseLabels = parseLabels;
exports.buildLabelDocs = buildLabelDocs;
exports.parseLabelsInFile = parseLabelsInFile;
exports.checkForDuplicateLabelsInList = checkForDuplicateLabelsInList;
exports.checkLabels = checkLabels;
exports.getMainLabelAtPos = getMainLabelAtPos;
exports.getLabelMetadataKeys = getLabelMetadataKeys;
exports.getLabelLocation = getLabelLocation;
exports.getLabelsAsCompletionItems = getLabelsAsCompletionItems;
const vscode_languageserver_1 = require("vscode-languageserver");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const errorChecking_1 = require("../errorChecking");
const console_1 = require("console");
const cache_1 = require("../cache");
const vscode_uri_1 = require("vscode-uri");
const path = require("path");
const fileFunctions_1 = require("../fileFunctions");
const comments_1 = require("./comments");
const hover_1 = require("../requests/hover");
var LabelType;
(function (LabelType) {
    LabelType[LabelType["LABEL"] = 0] = "LABEL";
    LabelType[LabelType["INLINE"] = 1] = "INLINE";
    LabelType[LabelType["ROUTE"] = 2] = "ROUTE";
})(LabelType || (exports.LabelType = LabelType = {}));
/**
 * Get valid labels, but only main or sublabels, not both.
 * @param textDocument
 * @param main search for main labels (==main_label==) if true, or sublabels (--sublabel--) if false
 * @returns
 */
function parseLabels(text, src, type = "main") {
    let td = vscode_languageserver_textdocument_1.TextDocument.create(src, "mast", 0, text);
    // let src = textDocument.uri;
    // if (src.startsWith("file")) {
    // 	src = URI.parse(src).fsPath;
    // }
    const routeLabel = /^([ \t]*)(\/{2,})(\w+)(\/\w+)*/gm;
    const mainLabel = /^([ \t]*)(={2,}[ \t]*[ \t]*)(\w+)([ \t]*(={2,})?)/gm;
    const combined = /^([ \t]*)(((\/{2,})(\w+)(\/\w+)*)|((={2,}[ \t]*)(\w+)([ \t]*(={2,})?))|(@[\w\/]+))/gm;
    let definedLabel;
    if (type === "main") {
        definedLabel = combined;
        //definedLabel = /^(\s*)(={2,}\s*[ \t]*)(\w+)([ \t]*(={2,})?)/gm
    }
    else if (type === "inline") {
        definedLabel = /^([ \t]*)((-|\+){2,}[ \t]*)(\w+)([ \t]*((-|\+){2,})?)/gm;
    }
    else {
        (0, console_1.debug)("Label type not valid!");
        return [];
    }
    let m;
    //const text = textDocument.getText();
    const labels = [];
    //debug("Iterating over defined labels");
    while (m = definedLabel.exec(text)) {
        const str = m[0].replace(/(=|-|\+)/g, "").trim();
        const startIndex = m[0].indexOf(str) + m.index;
        const range = {
            start: td.positionAt(startIndex),
            end: td.positionAt(startIndex + str.length)
        };
        let comments = "";
        const pos = range.start;
        for (let lineCount = range.start.line; lineCount < td.lineCount - 1; lineCount++) {
            pos.line += 1;
            const line = (0, hover_1.getCurrentLineFromTextDocument)(pos, td).trim();
            if (line.startsWith("\"") || line.startsWith("'")) {
                comments += line.substring(1, line.length).trim() + "  \n";
            }
            else {
                break;
            }
        }
        const li = {
            type: type,
            name: str,
            start: m.index,
            end: 0,
            length: m[0].length,
            metadata: "",
            comments: comments.trim(),
            subLabels: [],
            srcFile: src,
            range: range
        };
        if (m[0].trim().startsWith("//")) {
            li.type = "route";
        }
        else if (m[0].trim().startsWith("@")) {
            li.type = "media";
        }
        labels.push(li);
    }
    // Here we have to iterate over the labels again to properly get the end position.
    let i = 0;
    while (i < labels.length - 1) {
        labels[i].end = labels[i + 1].start - 1;
        labels[i].metadata = getMetadata(text.substring(labels[i].start, labels[i].end));
        i++;
    }
    // This is supposed to get the end of the last label
    if (labels[i] !== undefined) {
        labels[i].end = text.length;
        labels[i].metadata = getMetadata(text.substring(labels[i].start, labels[i].end));
    }
    // TODO: Get Comments or Weighted Text immediately following the label
    // for (const lbl of labels) {
    // 	const desc = getLabelDescription(text.substring(lbl.start,lbl.end), 0);
    // 	debug(desc);
    // }
    // Add END as a main label, last so we don't need to mess with it in earlier iterations.
    // Also add "main" as a main label, since it can happen that sublabels are defined before any user-defined main labels.
    if (type === "main") {
        let loc = {
            start: td.positionAt(text.length - 1),
            end: td.positionAt(text.length)
        };
        const endLabel = { range: loc, type: "main", name: "END", start: text.length - 1, end: text.length, length: 3, metadata: "", comments: "", subLabels: [], srcFile: src };
        labels.push(endLabel);
        let end = text.length;
        for (const i in labels) {
            if (labels[i].start < end) {
                end = labels[i].start - 1;
            }
        }
        loc = {
            start: td.positionAt(0),
            end: td.positionAt(end)
        };
        const mainLabel = { range: loc, type: "main", name: "main", start: 0, end: end, length: 4, metadata: "", comments: "", subLabels: [], srcFile: src };
        labels.push(mainLabel);
    }
    //debug(labels);
    return labels;
}
function getMetadata(text) {
    let ret = "";
    const start = text.indexOf("```");
    if (start === -1)
        return ret;
    text = text.substring(start).replace(/```/, "");
    const end = text.indexOf("```");
    if (end === -1)
        return ret;
    text = text.substring(0, end);
    text = text.replace(/```/g, "").trim();
    // text = text.substring(text.indexOf("\n"));
    return text;
}
function buildLabelDocs(label) {
    let val = "";
    if (label.metadata !== "") {
        val = label.comments + "\n\nDefault metadata:  \n```  \n" + label.metadata + "\n```\n";
    }
    else {
        val = label.comments;
    }
    if (val === "") {
        val = "No information specified for the '" + label.name + "' label.";
    }
    val = "`" + label.name + "` is defined in `" + path.dirname(label.srcFile).replace(/.*?\/missions\//, "") + "/" + path.basename(label.srcFile) + "`  \n" + val;
    let docs = {
        kind: "markdown",
        value: val
    };
    return docs;
}
function getLabelDocs(text) {
    let ret = "";
    const lines = text.split("\n");
    // TODO: figure out how to do the label documentation checking
    // I THINK it'll be just all comments right under the label definition.
    // But I need to check that the comments should always be prior to the metadata
    return ret;
}
function parseLabelsInFile(text, src) {
    let mainLabels = parseLabels(text, src, "main");
    //debug(mainLabels);
    const subLabels = parseLabels(text, src, "inline");
    //const routeLabels : LabelInfo[] = parseLabels(text, src, "route");
    //debug(src);
    //debug(routeLabels);
    // Add child labels to their parent
    for (const i in mainLabels) {
        const ml = mainLabels[i];
        for (const j in subLabels) {
            const sl = subLabels[j];
            if (sl.start > ml.start && sl.start < ml.end) {
                ml.subLabels.push(sl);
            }
        }
    }
    // debug("Parsed labels:")
    // debug(mainLabels)
    //mainLabels = mainLabels.concat(routeLabels);
    return mainLabels;
}
function checkForDuplicateLabelsInList(textDocument, labels = [], subLabels = false) {
    let diagnostics = [];
    if (labels.length === 0 && !subLabels) {
        labels = (0, cache_1.getCache)(textDocument.uri).getLabels(textDocument);
    }
    for (const i in labels) {
        // First we iterate over all labels prior to this one
        // If the label isn't from this file, we don't need to include it in the errors for this file.
        if ((0, fileFunctions_1.fixFileName)(labels[i].srcFile) !== (0, fileFunctions_1.fixFileName)(textDocument.uri)) {
            continue;
        }
        // Exclude main and END
        if (labels[i].name === "main" || labels[i].name === "END" || labels[i].type === "route") {
            // debug("Is route: " + labels[i].name)
            continue;
        }
        for (const j in labels) {
            if (j === i) {
                //break;
                continue;
            }
            if (labels[i].name === labels[j].name) {
                if (labels[i].start === labels[j].start)
                    continue;
                // debug(labels[i].name + " is used more than once");
                // debug(labels[i])
                // debug(labels[j])
                const d = {
                    range: {
                        start: textDocument.positionAt(labels[i].start),
                        end: textDocument.positionAt(labels[i].start + labels[i].length)
                    },
                    severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                    message: "Label names can only be used once.",
                    source: "mast",
                };
                // let file = fileFromUri(labels[j].srcFile);
                // debug(file);
                let message = (subLabels) ? "The inline label \"" + labels[i].name + "\" is already used inside this parent label" : "The label \"" + labels[i].name + "\" is already used in this file";
                if (!subLabels) {
                    let f;
                    if (labels[j].srcFile !== textDocument.uri) {
                        f = path.basename(vscode_uri_1.URI.parse(labels[j].srcFile).fsPath);
                    }
                    else {
                        f = "this file.";
                    }
                    message = "The label \"" + labels[j].name + "\" is already defined in " + f;
                }
                d.relatedInformation = [];
                d.relatedInformation = (0, errorChecking_1.relatedMessage)(textDocument, d.range, message);
                const s = labels[j].range.start;
                // s.character = 1;
                message += " at Line " + s.line + ", Character " + s.character;
                if (d.relatedInformation === undefined)
                    d.relatedInformation = [];
                d.relatedInformation.push({
                    location: {
                        uri: (0, fileFunctions_1.fileFromUri)(labels[j].srcFile),
                        range: labels[j].range
                    },
                    message: '<-- Label also defined here.'
                });
                diagnostics.push(d);
            }
        }
        // Now we need to do the same thing for sub labels
        if (!subLabels) {
            const subs = labels[i].subLabels;
            diagnostics = diagnostics.concat(checkForDuplicateLabelsInList(textDocument, subs, true));
        }
    }
    return diagnostics;
}
// function checkForDuplicateLabelsOld(t: TextDocument, main:LabelInfo[],sub:LabelInfo[]): Diagnostic[] {
// 	let diagnostics: Diagnostic[] = [];
// 	const labels = getCache(t.uri).getLabels(t);
// 	for (const i in main) {
// 		for (const j in sub) {
// 			if (main[i].subLabels.includes(sub[j].name)) {
// 				const d: Diagnostic = {
// 					range: {
// 						start: t.positionAt((main[i].start > sub[j].start) ? main[i].start : sub[j].start),
// 						end: t.positionAt((main[i].start > sub[j].start) ? main[i].start + main[i].length : sub[j].start+ sub[j].length)
// 					},
// 					severity: DiagnosticSeverity.Error,
// 					message: "Label names can only be used once.",
// 					source: "mast",
// 				}
// 				d.relatedInformation = relatedMessage(t,d.range, "This label name is used elsewhere in this file.");
// 				diagnostics.push(d);
// 			}
// 		}
// 	}
// 	return diagnostics;
// }
function checkLabels(textDocument) {
    const text = textDocument.getText();
    let diagnostics = [];
    //const calledLabel : RegExp = /(^[ \t]*?(->|jump)[ \t]*?\w+)/gm;
    const calledLabel = /(?<=^[ \t]*(jump |->)[ \t]*)(\w+)/gm;
    let m;
    let mainLabels = (0, cache_1.getCache)(textDocument.uri).getLabels(textDocument, false); //getLabelsInFile(text,textDocument.uri);
    ///parseLabels(textDocument.getText(),textDocument.uri, true);
    // const subLabels : LabelInfo[] = parseLabels(textDocument.getText(), textDocument.uri, false);
    // // Add child labels to their parent
    // for (const i in mainLabels) {
    // 	const ml = mainLabels[i];
    // 	for (const j in subLabels) {
    // 		const sl = subLabels[j];
    // 		if (sl.start > ml.start && sl.start < ml.end) {
    // 			ml.subLabels.push(sl.name);
    // 		}
    // 	}
    // }
    // updateLabelNames(mainLabels);
    //debug("Iterating over called labels");
    while (m = calledLabel.exec(text)) {
        const str = m[0].replace(/(->)|(jump )/g, "").trim();
        if (str === "END") {
            continue;
        }
        //debug(str);
        let found = false;
        const ml = getMainLabelAtPos(m.index, mainLabels);
        // debug(ml);
        // Check if the label is the main label
        if (str === ml.name) {
            continue;
            // Check if the label is a sub-label of the main label.
        }
        else {
            for (const sub of ml.subLabels) {
                if (str === sub.name) {
                    found = true;
                    break;
                }
            }
            if (found)
                continue;
        }
        // mainLabels = getCache(textDocument.uri).getLabels(textDocument, false);
        // If the label is not a main label, nor a sub-label of the main label,
        // then we need to see if it exists at all.
        for (const main of mainLabels) {
            if (str === main.name) {
                found = true;
                break;
            }
            else {
                for (const sl of main.subLabels) {
                    if (str === sl.name) {
                        if (m.index < main.start || m.index > main.end) {
                            const d = {
                                range: {
                                    start: textDocument.positionAt(m.index),
                                    end: textDocument.positionAt(m.index + m[0].length)
                                },
                                severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                                message: "Sub-label \"" + sl.name + "\" cannot be called from outside of its parent label.",
                                source: "mast",
                            };
                            d.relatedInformation = (0, errorChecking_1.relatedMessage)(textDocument, d.range, "This sub-label is a child of the " + main.name + " main label.\nYou can only jump to a sub-label from within its parent label.");
                            diagnostics.push(d);
                            (0, console_1.debug)(main.subLabels);
                        }
                        found = true;
                        break;
                    }
                }
            }
        }
        // const labels: LabelInfo[] = getCache(textDocument.uri).getLabels(textDocument);
        // for (const lbl of labels) {
        // 	if (str === lbl.name) {
        // 		found = true;
        // 		break;
        // 	} else {
        // 		for (const sl of lbl.subLabels) {
        // 			if (str === sl.name) {
        // 				const d: Diagnostic = {
        // 					range: {
        // 						start: textDocument.positionAt(sl.start),
        // 						end: textDocument.positionAt(sl.start + sl.length)
        // 					},
        // 					severity: DiagnosticSeverity.Error,
        // 					message: "Sub-label \"" + sl.name + "\" cannot be called from outside of its parent label.",
        // 					source: "mast",
        // 				}
        // 				d.relatedInformation = relatedMessage(textDocument,d.range, "This sub-label is a child of the " + lbl.name + " main label.\nYou can only jump to a sub-label from within its parent label.");
        // 				diagnostics.push(d);
        // 				debug("Second iteration")
        // 			}
        // 		}
        // 	}
        // }
        // debug("----------------Start------------------")
        // debug(str);
        // debug(textDocument.uri);
        // debug(m.index)
        // debug(textDocument.positionAt(m.index))
        // let labelLoc = getLabelLocation(str, textDocument, textDocument.positionAt(m.index))
        // debug(labelLoc);
        // debug("-----------------END-----------------")
        // Label not found in file
        if (!found) {
            const d = {
                range: {
                    start: textDocument.positionAt(m.index),
                    end: textDocument.positionAt(m.index + m[0].length)
                },
                severity: vscode_languageserver_1.DiagnosticSeverity.Warning,
                message: "Label defnition not found. Make sure that this label is defined before use.",
                source: "mast"
            };
            //d.relatedInformation = relatedMessage(textDocument, d.range, "Labels must be defined in a format beginning (and optionally ending) with two or more = or - signs. They may use A-Z, a-z, 0-9, and _ in their names. Other characters are not allowed.");
            //d.relatedInformation = relatedMessage(textDocument, d.range, "");
            diagnostics.push(d);
        }
    }
    const dups = checkForDuplicateLabelsInList(textDocument, mainLabels);
    // const susb = checkForDuplicateLabelsInList(textDocument,ml)
    diagnostics = diagnostics.concat(dups);
    //debug(diagnostics);
    diagnostics = diagnostics.concat(findBadLabels(textDocument));
    return diagnostics;
}
/**
 * Check for invalid labels, e.g. using both - and = in the same label
 * @param t
 * @returns
 */
function findBadLabels(t) {
    const text = t.getText();
    const diagnostics = [];
    const any = /(^ *?=+?.*?$)|(^ *?-+?.*?$)/gm;
    const whiteSpaceWarning = /^ +?/;
    const good = /(^(\s*)(={2,}\s*[ \t]*)(\w+)([ \t]*(={2,})?))|(^(\s*)(-{2,}\s*[ \t]*)(\w+)([ \t]*(-{2,})?))/m;
    const bad = /[\!\@\$\%\^\&\*\(\)\.\,\>\<\?\`\[\]\\\/\+\~\{\}\|\'\"\;\:]+?/m;
    // Regex for a good await inline label
    const format = /=\$\w+/;
    const awaitInlineLabel = /=\w+:/;
    let m;
    // Iterate over regular labels
    while (m = any.exec(text)) {
        let lbl = m[0].trim();
        if (lbl.startsWith("#")) {
            continue;
        }
        if (lbl.startsWith("->")) {
            continue;
        }
        if ((0, comments_1.isInYaml)(t, m.index) || (0, comments_1.isInComment)(t, m.index)) {
            continue;
        }
        //debug("Testing " + m[0]);
        let tr = good.test(lbl) || awaitInlineLabel.test(lbl) || format.test(lbl);
        //debug("  Result: " + tr as string);
        if (!tr) {
            //debug("    Bad result");
            let d = {
                range: {
                    start: t.positionAt(m.index),
                    end: t.positionAt(m.index + m[0].length)
                },
                severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                message: "Invalid characters in label designation",
                source: "mast"
            };
            // TODO: Technically this is not reachable. Evaluate if this should be kept around.
            if (awaitInlineLabel.test(m[0])) {
                d.severity = vscode_languageserver_1.DiagnosticSeverity.Warning;
                d.message = "Possible improper label definition";
                d.source = __dirname;
                d.relatedInformation = (0, errorChecking_1.relatedMessage)(t, d.range, "The acceptable use of a label with a single starting '=' is rare, and you'd better know what you're doing.\nOne example useage can be found in the legendarymissions, in hangar/bar.mast. \nIn this situation, the disconnect label is used to tell the server how to handle a disconnected client.");
            }
            else {
                d.relatedInformation = (0, errorChecking_1.relatedMessage)(t, d.range, "Labels must be defined in a format beginning (and optionally ending) with two or more = or - signs. \nThey may use A-Z, a-z, 0-9, and _ in their names. Other characters are not allowed.\nExamples:\"== LabelA\" or \"== LabelA ==\"");
            }
            diagnostics.push(d);
        }
        // Await Inline Labels ignore this error, but other labels should NOT be indented.
        tr = whiteSpaceWarning.test(m[0]) && !awaitInlineLabel.test(lbl) && !format.test(lbl);
        if (tr) {
            //debug("WARNING: Best practice to start the line with label declaration");
            const d = {
                range: {
                    start: t.positionAt(m.index),
                    end: t.positionAt(m.index + m[0].length)
                },
                severity: vscode_languageserver_1.DiagnosticSeverity.Warning,
                message: "Best practice is to start label declaration at the beginning of the line.",
                source: "mast"
            };
            d.relatedInformation = (0, errorChecking_1.relatedMessage)(t, d.range, "Label declarations can cause Mast compiler errors under some circumstances when there are spaces prior to label declaration.");
            diagnostics.push(d);
        }
    }
    // Iterate over possible route labels to check for errors
    const routes = /^.*?\/\/.*?$/gm; // every line that contains "//"
    const badRoute = /[\w\(]+?\/\//; // check for text before the "//"
    const slashCheck = / *?\/\/.+?\/\//; // contains two or more sets of "//"
    const formatCheck = /.*?\/\/\w+(\/(\w+))*.*/m; // checks for proper //something/something/something format
    while (m = routes.exec(text)) {
        /**
         * I still want to implement a more robust version of this someday, but for now
         * we're removing due to the use of // as an operator
         */
        // if (badRoute.test(m[0])) {
        // 	const d: Diagnostic = {
        // 		range: {
        // 			start: t.positionAt(m.index),
        // 			end: t.positionAt(m.index + m[0].length)
        // 		},
        // 		severity: DiagnosticSeverity.Error,
        // 		message: "Route labels can be used only at the beginning of a line.",
        // 		source: "mast"
        // 	}
        // 	d.relatedInformation = relatedMessage(t, d.range, "See https://artemis-sbs.github.io/sbs_utils/mast/routes/ for more details on routes.");
        // 	diagnostics.push(d);
        // }
        if (slashCheck.test(m[0])) {
            const d = {
                range: {
                    start: t.positionAt(m.index),
                    end: t.positionAt(m.index + m[0].length)
                },
                severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                message: "Route label designator (//) may only be used once at the beginning of the line.",
                source: "mast"
            };
            d.relatedInformation = (0, errorChecking_1.relatedMessage)(t, d.range, "See https://artemis-sbs.github.io/sbs_utils/mast/routes/ for more details on routes.");
            diagnostics.push(d);
        }
        // if (!formatCheck.test(m[0])) {
        // 	let message = "Route label format is incorrect. Proper formats include: \n//comms\n//spawn/grid\n//enable/science if has_roles(COMMS_SELECTED_ID, \"raider\")";
        // 	if (m[0].endsWith("/")) {
        // 		message = "Route labels cannot end with a slash. "
        // 	}
        // 	const d: Diagnostic = {
        // 		range: {
        // 			start: t.positionAt(m.index),
        // 			end: t.positionAt(m.index + m[0].length)
        // 		},
        // 		severity: DiagnosticSeverity.Error,
        // 		message: message,
        // 		source: "mast"
        // 	}
        // 	d.relatedInformation = relatedMessage(t, d.range, "See https://artemis-sbs.github.io/sbs_utils/mast/routes/ for more details on routes.");
        // 	diagnostics.push(d);
        // }
        // TODO: Add this later. Need to account for things like:
        /**
         * comms_navigate("//comms/taunt/raider")
         * and
         * + "Give Orders" //comms/give_orders
         */
        // const tr = whiteSpaceWarning.test(m[0]);
        // if (tr) {
        // 	//debug("WARNING: Best practice to start the line with label declaration");
        // 	const d: Diagnostic = {
        // 		range: {
        // 			start: t.positionAt(m.index),
        // 			end: t.positionAt(m.index + m[0].length)
        // 		},
        // 		severity: DiagnosticSeverity.Warning,
        // 		message: "Best practice is to start label declarations at the beginning of the line.",
        // 		source: "mast"
        // 	}
        // 	d.relatedInformation = relatedMessage(t, d.range, "Label declarations can cause Mast compiler errors under some circumstances when there are spaces prior to label declaration.");
        // 	diagnostics.push(d);
        // }
    }
    return diagnostics;
}
function getMainLabelAtPos(pos, labels) {
    let closestLabel = labels[0];
    for (const i in labels) {
        // Could be route or main label
        //debug(labels[i]);
        if (labels[i].type !== "inline") {
            if (labels[i].start <= pos && labels[i].end >= pos) {
                closestLabel = labels[i];
                return closestLabel;
            }
        }
    }
    return closestLabel;
}
function getLabelMetadataKeys(label) {
    const meta = label.metadata;
    const re = /^[ \t]*(\w+):(.*)/gm;
    let m;
    let keys = [];
    (0, console_1.debug)(label);
    (0, console_1.debug)(meta);
    while (m = re.exec(meta)) {
        let key = m[1];
        let def = m[2].trim();
        keys.push([key, def]);
    }
    (0, console_1.debug)(keys);
    keys.push(["START_X", ""]);
    keys.push(["START_Y", ""]);
    keys.push(["START_Z", ""]);
    keys = [...new Map(keys.map(v => [v[0], v])).values()];
    // debug(arrUniq);
    (0, console_1.debug)(keys);
    return keys;
}
let extraDebug = false;
function getLabelLocation(symbol, doc, pos) {
    // debug("Getting location of label: `" + symbol + "` in\n" + doc.uri + " at:")
    // debug(pos)
    // Now let's check over all the labels, to see if it's a label. This will be most useful for most people I think.
    // let mainLabels = getCache(doc.uri).getLabels(doc,true);
    let mainLabels = (0, cache_1.getCache)(doc.uri).getLabelsAtPos(doc, doc.offsetAt(pos), true);
    // debug(mainLabels)
    // for (const l of mainLabels){
    // 	if (l.name.startsWith("@")) {
    // 		debug(l)
    // 	}
    // }
    const mainLabelAtPos = getMainLabelAtPos(doc.offsetAt(pos), mainLabels);
    (0, console_1.debug)("Main Label: " + mainLabelAtPos.name);
    (0, console_1.debug)(symbol);
    (0, console_1.debug)(mainLabelAtPos.subLabels);
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
    mainLabels = (0, cache_1.getCache)(doc.uri).getLabels(doc, false);
    for (const main of mainLabels) {
        if (main.name === symbol) {
            // debug(main);
            const loc = {
                uri: (0, fileFunctions_1.fileFromUri)(main.srcFile),
                range: main.range
            };
            return loc;
        }
    }
}
function getLabelsAsCompletionItems(text, labelNames, lbl) {
    let ci = [];
    for (const i in labelNames) {
        if (labelNames[i].name === "main")
            continue;
        if (labelNames[i].name.startsWith("//"))
            continue;
        if ((0, fileFunctions_1.fixFileName)(labelNames[i].srcFile) !== (0, fileFunctions_1.fixFileName)(text.uri) && labelNames[i].name === "END")
            continue;
        if (labelNames[i].type === "main") {
            ci.push({ documentation: buildLabelDocs(labelNames[i]), label: labelNames[i].name, kind: vscode_languageserver_1.CompletionItemKind.Event, labelDetails: { description: path.basename(labelNames[i].srcFile) } });
        }
    }
    labelNames = (0, cache_1.getCache)(text.uri).getLabels(text, true);
    if (lbl === undefined) {
        return ci;
    }
    else {
        // Check for the parent label at this point (to get sublabels within the same parent)
        if (lbl.srcFile === (0, fileFunctions_1.fixFileName)(text.uri)) {
            (0, console_1.debug)("same file name!");
            let subs = lbl.subLabels;
            (0, console_1.debug)(lbl.name);
            (0, console_1.debug)(subs);
            for (const i in subs) {
                ci.push({ documentation: buildLabelDocs(subs[i]), label: subs[i].name, kind: vscode_languageserver_1.CompletionItemKind.Event, labelDetails: { description: "Sub-label of: " + lbl.name } });
            }
        }
        return ci;
    }
    return ci;
}
//# sourceMappingURL=labels.js.map