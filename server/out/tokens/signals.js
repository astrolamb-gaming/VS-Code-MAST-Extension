"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeSignalInfo = mergeSignalInfo;
exports.buildSignalInfoListAsCompletionItems = buildSignalInfoListAsCompletionItems;
exports.parseSignalsInFile = parseSignalsInFile;
exports.checkForUnusedSignals = checkForUnusedSignals;
const vscode_languageserver_1 = require("vscode-languageserver");
const fileFunctions_1 = require("../fileFunctions");
const cache_1 = require("../cache");
const comments_1 = require("./comments");
/**
 * Call this after using concat() to merge a bunch of {@link SignalInfo SignalInfo} lists.
 * Takes the {@link SignalInfo SignalInfo}s from different files and merges them into one list for easier use.
 * @param sigs A list of {@link SignalInfo SignalInfo}s
 * @returns A new, merged list of {@link SignalInfo SignalInfo}
 */
function mergeSignalInfo(sigs) {
    let signals = new Map();
    for (const s of sigs) {
        let sig = signals.get(s.name);
        if (!sig) {
            // debug("Adding sig: " + s.name)
            sig = s;
            signals.set(s.name, s);
        }
        else {
            for (const r1 of s.emit) {
                let found = false;
                for (const r2 of sig.emit) {
                    if (r1.range.start === r2.range.start)
                        found = true;
                    break;
                }
                if (!found) {
                    sig.emit.push(r1); // = sig.emit.concat(s.emit);
                }
            }
            for (const r1 of s.triggered) {
                let found = false;
                for (const r2 of sig.triggered) {
                    if (r1.range.start === r2.range.start)
                        found = true;
                    break;
                }
                if (!found) {
                    sig.triggered.push(r1); // = sig.triggered.concat(s.emit);
                }
            }
            // signals.set(sig.name, sig) // Probably not necessary
        }
    }
    return [...signals.values()];
}
function buildSignalInfoListAsCompletionItems(sigs) {
    let ret = [];
    for (const s of sigs) {
        const ci = {
            label: s.name,
            kind: vscode_languageserver_1.CompletionItemKind.Event,
            labelDetails: { description: "Signal Route Label" }
        };
        ret.push(ci);
    }
    return ret;
}
function parseSignalsInFile(doc) {
    const rx = /(signal_emit\([\"'](\w+)[\"'](,.*?)?\)|\/\/(shared\/)?signal\/([\w\/]+))|(on signal (\w+))/g;
    let m;
    let signals = new Map();
    function tryAddSignal(key, index, emit) {
        if ((0, comments_1.isInComment)(doc, index))
            return;
        const range = {
            start: doc.positionAt(index),
            end: doc.positionAt(index + key.length)
        };
        const loc = {
            uri: (0, fileFunctions_1.fileFromUri)(doc.uri),
            range: range
        };
        let sig = signals.get(key);
        if (!sig) {
            sig = {
                name: key,
                emit: [],
                triggered: []
            };
        }
        if (emit) {
            sig.emit.push(loc);
        }
        else {
            sig.triggered.push(loc);
        }
        signals.set(key, sig);
    }
    while (m = rx.exec(doc.getText())) {
        if (m[2]) {
            tryAddSignal(m[2], m.index + m[0].indexOf(m[2]), true);
            // debug("signal emitted: " + m[2] + "  in " + path.basename(doc.uri))
        }
        if (m[5]) {
            tryAddSignal(m[5], m.index + m[0].indexOf(m[5]), false);
            // debug("signal routed: " + m[5] + "  in " + path.basename(doc.uri))
        }
        if (m[7]) {
            tryAddSignal(m[7], m.index + m[0].indexOf(m[7]), false);
            // debug("signal triggered: " + m[7] + "  in " + path.basename(doc.uri))
        }
    }
    //TODO: Need to evaluate if this is what I should do
    // signals = [...new Set(signals)];
    const ret = [...signals.values()];
    // debug(ret);
    return ret;
}
function checkForUnusedSignals(doc) {
    let ret = [];
    const cache = (0, cache_1.getCache)(doc.uri);
    const signals = cache.getSignals();
    for (const s of signals) {
        if (s.emit.length === 0) {
            for (const loc of s.triggered) {
                if ((0, fileFunctions_1.fixFileName)(doc.uri) !== (0, fileFunctions_1.fixFileName)(loc.uri))
                    continue;
                const d = {
                    range: loc.range,
                    message: 'This signal is never emitted',
                    severity: vscode_languageserver_1.DiagnosticSeverity.Warning
                };
                ret.push(d);
            }
        }
        if (s.triggered.length === 0) {
            for (const loc of s.emit) {
                if ((0, fileFunctions_1.fixFileName)(doc.uri) !== (0, fileFunctions_1.fixFileName)(loc.uri))
                    continue;
                const d = {
                    range: loc.range,
                    message: 'This signal is emitted but never used',
                    severity: vscode_languageserver_1.DiagnosticSeverity.Information
                };
                ret.push(d);
            }
        }
    }
    return ret;
}
//# sourceMappingURL=signals.js.map