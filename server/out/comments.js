"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getComments = getComments;
function getComments(textDocument) {
    const text = textDocument.getText();
    const pattern = /\/\*.*\*\//gs;
    let m;
    while (m = pattern.exec(text)) {
        let comment = m[0];
        //debug(comment);
    }
}
//# sourceMappingURL=comments.js.map