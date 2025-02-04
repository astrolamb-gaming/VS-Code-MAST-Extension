"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseLabels = parseLabels;
exports.getLabelsInFile = getLabelsInFile;
exports.checkLabels = checkLabels;
exports.getMainLabelAtPos = getMainLabelAtPos;
const vscode_languageserver_1 = require("vscode-languageserver");
const errorChecking_1 = require("./errorChecking");
const server_1 = require("./server");
/**
 * Get valid labels, but only main or sublabels, not both.
 * @param textDocument
 * @param main search for main labels (==main_label==) if true, or sublabels (--sublabel--) if false
 * @returns
 */
function parseLabels(text, src, main = true) {
    // let src = textDocument.uri;
    // if (src.startsWith("file")) {
    // 	src = URI.parse(src).fsPath;
    // }
    let definedLabel;
    if (main) {
        definedLabel = /^(\s*)(={2,}\s*[ \t]*)(\w+)([ \t]*(={2,})?)/gm;
    }
    else {
        definedLabel = /^(\s*)(-{2,}\s*[ \t]*)(\w+)([ \t]*(-{2,})?)/gm;
    }
    let m;
    //const text = textDocument.getText();
    const labels = [];
    //debug("Iterating over defined labels");
    while (m = definedLabel.exec(text)) {
        const str = m[0].replace(/(=|-)/g, "").trim();
        if (main) {
            const lbl = m[3];
            //debug(m[0]);
            //debug("Main label: " + lbl);
        }
        const li = {
            main: main,
            name: str,
            start: m.index,
            end: 0,
            length: m[0].length,
            subLabels: [],
            srcFile: src
        };
        //debug(str);
        labels.push(li);
    }
    // Here we have to iterate over the labels again to properly get the end position.
    let i = 0;
    while (i < labels.length - 1) {
        labels[i].end = labels[i + 1].start - 1;
        i++;
    }
    if (labels[i] !== undefined) {
        labels[i].end = text.length;
    }
    // Add END as a main label, last so we don't need to mess with it in earlier iterations.
    // Also add "main" as a main label, since it can happen that sublabels are defined before any user-defined main labels.
    if (main) {
        const endLabel = { main: true, name: "END", start: text.length - 1, end: text.length, length: 3, subLabels: [], srcFile: src };
        labels.push(endLabel);
        let end = text.length;
        for (const i in labels) {
            if (labels[i].start < end) {
                end = labels[i].start - 1;
            }
        }
        const mainLabel = { main: true, name: "main", start: 0, end: end, length: 4, subLabels: [], srcFile: src };
        labels.push(mainLabel);
    }
    return labels;
}
function getLabelsInFile(text, src) {
    const mainLabels = parseLabels(text, src, true);
    //debug(mainLabels);
    const subLabels = parseLabels(text, src, false);
    // Add child labels to their parent
    for (const i in mainLabels) {
        const ml = mainLabels[i];
        for (const j in subLabels) {
            const sl = subLabels[j];
            if (sl.start > ml.start && sl.start < ml.end) {
                ml.subLabels.push(sl.name);
            }
        }
    }
    return mainLabels;
}
function checkForDuplicateLabels(t, main, sub) {
    let diagnostics = [];
    for (const i in main) {
        for (const j in sub) {
            if (main[i].subLabels.includes(sub[j].name)) {
                const d = {
                    range: {
                        start: t.positionAt((main[i].start > sub[j].start) ? main[i].start : sub[j].start),
                        end: t.positionAt((main[i].start > sub[j].start) ? main[i].start + main[i].length : sub[j].start + sub[j].length)
                    },
                    severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                    message: "Label names can only be used once.",
                    source: "mast",
                };
                d.relatedInformation = (0, errorChecking_1.relatedMessage)(t, d.range, "This label name is used elsewhere in this file.");
                diagnostics.push(d);
            }
        }
    }
    return diagnostics;
}
function checkLabels(textDocument) {
    const text = textDocument.getText();
    let diagnostics = [];
    const calledLabel = /(^ *?-> *?[0-9A-Za-z_]{1,})|(^ *?jump *?[0-9A-Za-z_]{1,})/gm;
    let m;
    const mainLabels = parseLabels(textDocument.getText(), textDocument.uri, true);
    const subLabels = parseLabels(textDocument.getText(), textDocument.uri, false);
    // Add child labels to their parent
    for (const i in mainLabels) {
        const ml = mainLabels[i];
        for (const j in subLabels) {
            const sl = subLabels[j];
            if (sl.start > ml.start && sl.start < ml.end) {
                ml.subLabels.push(sl.name);
            }
        }
    }
    (0, server_1.updateLabelNames)(mainLabels);
    //debug("Iterating over called labels");
    while (m = calledLabel.exec(text)) {
        const str = m[0].replace(/(->)|(jump )/g, "").trim();
        if (str === "END") {
            continue;
        }
        //debug(str);
        let found = false;
        for (const i in mainLabels) {
            if (str === mainLabels[i].name) {
                found = true;
            }
            else {
                for (const j in mainLabels[i].subLabels) {
                    const sl = mainLabels[i].subLabels[j];
                    if (str === sl) {
                        if (m.index < mainLabels[i].start || m.index > mainLabels[i].end) {
                            const d = {
                                range: {
                                    start: textDocument.positionAt(m.index),
                                    end: textDocument.positionAt(m.index + m[0].length)
                                },
                                severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                                message: "Sub-label cannot be used outside of parent label.",
                                source: "mast",
                            };
                            d.relatedInformation = (0, errorChecking_1.relatedMessage)(textDocument, d.range, "This sub-label is a child of the " + mainLabels[i].name + " main label.\nYou can only jump to a sub-label from within its parent label.");
                            diagnostics.push(d);
                        }
                        found = true;
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
    const specialLabel = /=\w+:/;
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
        let tr = good.test(lbl);
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
            if (specialLabel.test(m[0])) {
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
        tr = whiteSpaceWarning.test(m[0]);
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
    }
    return diagnostics;
}
function getMainLabelAtPos(pos, labels) {
    let closestLabel = labels[0];
    for (const i in labels) {
        if (labels[i].start < pos && labels[i].end > pos) {
            closestLabel = labels[i];
            return closestLabel;
        }
    }
    return closestLabel;
}
//# sourceMappingURL=labels.js.map