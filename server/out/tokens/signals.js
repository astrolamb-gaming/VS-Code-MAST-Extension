"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSignalsInFile = parseSignalsInFile;
function parseSignalsInFile(doc) {
    const rx = /signal_emit\([\"'](\w+)[\"']\)|\/\/(shared\/)?signal\/([\w\/]+)/g;
    let m;
    let signals = [];
    while (m = rx.exec(doc.getText())) {
        if (m[1]) {
            signals.push(m[1]);
        }
        if (m[3]) {
            signals.push(m[3]);
        }
    }
    //TODO: Need to evaluate if this is what I should do
    signals = [...new Set(signals)];
    return signals;
}
//# sourceMappingURL=signals.js.map