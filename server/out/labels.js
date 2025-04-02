"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LabelType = void 0;
exports.parseLabels = parseLabels;
exports.parseLabelsInFile = parseLabelsInFile;
exports.checkForDuplicateLabelsInList = checkForDuplicateLabelsInList;
exports.checkLabels = checkLabels;
exports.getMainLabelAtPos = getMainLabelAtPos;
const vscode_languageserver_1 = require("vscode-languageserver");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const errorChecking_1 = require("./errorChecking");
const server_1 = require("./server");
const console_1 = require("console");
const cache_1 = require("./cache");
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
    const combined = /^([ \t]*)(((\/{2,})(\w+)(\/\w+)*)|((={2,}[ \t]*)(\w+)([ \t]*(={2,})?)))/gm;
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
        const li = {
            type: type,
            name: str,
            start: m.index,
            end: 0,
            length: m[0].length,
            metadata: "",
            subLabels: [],
            srcFile: src
        };
        if (m[0].trim().startsWith("//")) {
            li.type = "route";
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
    if (labels[i] !== undefined) {
        labels[i].end = text.length;
    }
    // TODO: Get Comments or Weighted Text immediately following the label
    // for (const lbl of labels) {
    // 	const desc = getLabelDescription(text.substring(lbl.start,lbl.end), 0);
    // 	debug(desc);
    // }
    // Add END as a main label, last so we don't need to mess with it in earlier iterations.
    // Also add "main" as a main label, since it can happen that sublabels are defined before any user-defined main labels.
    if (type === "main") {
        const endLabel = { type: "main", name: "END", start: text.length - 1, end: text.length, length: 3, metadata: "", subLabels: [], srcFile: src };
        labels.push(endLabel);
        let end = text.length;
        for (const i in labels) {
            if (labels[i].start < end) {
                end = labels[i].start - 1;
            }
        }
        const mainLabel = { type: "main", name: "main", start: 0, end: end, length: 4, metadata: "", subLabels: [], srcFile: src };
        labels.push(mainLabel);
    }
    //debug(labels);
    return labels;
}
function getMetadata(text) {
    let ret = "";
    const start = text.indexOf("```");
    const end = text.lastIndexOf("```");
    if (start === -1 || end === -1) {
        return ret;
    }
    text = text.replace(/```/g, "").trim();
    text = text.substring(text.indexOf("\n"));
    return text;
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
        for (const j in labels) {
            // debug(labels[j])
            if (j === i) {
                break;
            }
            if (labels[i].name === labels[j].name) {
                const d = {
                    range: {
                        start: textDocument.positionAt(labels[i].start),
                        end: textDocument.positionAt(labels[i].start + labels[i].length)
                    },
                    severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                    message: "Label names can only be used once.",
                    source: "mast",
                };
                const message = (subLabels) ? "This inline label name is already used inside this parent label." : "This label name is used elsewhere in this file.";
                d.relatedInformation = (0, errorChecking_1.relatedMessage)(textDocument, d.range, message);
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
    const mainLabels = (0, cache_1.getCache)(textDocument.uri).getLabels(textDocument); //getLabelsInFile(text,textDocument.uri);
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
    (0, server_1.updateLabelNames)(mainLabels);
    //debug("Iterating over called labels");
    while (m = calledLabel.exec(text)) {
        const str = m[0].replace(/(->)|(jump )/g, "").trim();
        if (str === "END") {
            continue;
        }
        //debug(str);
        let found = false;
        const ml = getMainLabelAtPos(m.index, mainLabels);
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
                                message: "Sub-label cannot be called from outside of its parent label.",
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
        const labels = (0, cache_1.getCache)(textDocument.uri).getLabels(textDocument);
        for (const lbl of labels) {
            if (str === lbl.name) {
                found = true;
                break;
            }
            else {
                for (const sl of lbl.subLabels) {
                    if (str === sl.name) {
                        const d = {
                            range: {
                                start: textDocument.positionAt(sl.start),
                                end: textDocument.positionAt(sl.start + sl.length)
                            },
                            severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                            message: "Sub-label cannot be called from outside of its parent label.",
                            source: "mast",
                        };
                        d.relatedInformation = (0, errorChecking_1.relatedMessage)(textDocument, d.range, "This sub-label is a child of the " + lbl.name + " main label.\nYou can only jump to a sub-label from within its parent label.");
                        diagnostics.push(d);
                        (0, console_1.debug)("Second iteration");
                    }
                }
            }
        }
        if (!found) {
            const d = {
                range: {
                    start: textDocument.positionAt(m.index),
                    end: textDocument.positionAt(m.index + m[0].length)
                },
                severity: vscode_languageserver_1.DiagnosticSeverity.Warning,
                message: "Specified label does not exist in this file. Make sure that this label is defined before use.",
                source: "mast"
            };
            //d.relatedInformation = relatedMessage(textDocument, d.range, "Labels must be defined in a format beginning (and optionally ending) with two or more = or - signs. They may use A-Z, a-z, 0-9, and _ in their names. Other characters are not allowed.");
            //d.relatedInformation = relatedMessage(textDocument, d.range, "");
            diagnostics.push(d);
        }
    }
    diagnostics = diagnostics.concat(checkForDuplicateLabelsInList(textDocument, mainLabels));
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
        if (!formatCheck.test(m[0])) {
            let message = "Route label format is incorrect. Proper formats include: \n//comms\n//spawn/grid\n//enable/science if has_roles(COMMS_SELECTED_ID, \"raider\")";
            if (m[0].endsWith("/")) {
                message = "Route labels cannot end with a slash. ";
            }
            const d = {
                range: {
                    start: t.positionAt(m.index),
                    end: t.positionAt(m.index + m[0].length)
                },
                severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                message: message,
                source: "mast"
            };
            d.relatedInformation = (0, errorChecking_1.relatedMessage)(t, d.range, "See https://artemis-sbs.github.io/sbs_utils/mast/routes/ for more details on routes.");
            diagnostics.push(d);
        }
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
function getMainLabelAtPos(pos, labels = []) {
    if (labels.length === 0) {
        // TODO: labelNames is a global variable. Should change?
        labels = server_1.labelNames;
    }
    // debug(labels)
    // debug(pos);
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
//# sourceMappingURL=labels.js.map