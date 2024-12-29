"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onSignatureHelp = onSignatureHelp;
const console_1 = require("console");
const server_1 = require("./server");
function onSignatureHelp(_textDocPos, text) {
    let sh = {
        signatures: []
    };
    //const text = documents.get(_textDocPos.textDocument.uri);
    const t = text?.getText();
    if (text === undefined) {
        (0, console_1.debug)("Document ref is undefined");
        return sh;
    }
    if (t === undefined) {
        (0, console_1.debug)("Document text is undefined");
        return sh;
    }
    // Calculate the position in the text's string value using the Position value.
    const pos = text.offsetAt(_textDocPos.position);
    const startOfLine = pos - _textDocPos.position.character;
    // Somehow a +1 to pos helps with things. Makes it not necessary to have a space after the comma following a parameter. But messes up other stuff
    const iStr = t.substring(startOfLine, pos);
    // Calculate which parameter is the active one
    let m;
    let last = iStr.lastIndexOf("(");
    let sub = iStr.substring(last, iStr.length - 1).replace(/ /g, "");
    let arr = sub.split(",");
    sh.activeParameter = arr.length - 1;
    //if (iStr.endsWith("(")) {
    let res = iStr.substring(0, last);
    (0, console_1.debug)("RES: ");
    (0, console_1.debug)(res);
    const lastFunc = /\w+?$/g;
    //m = func.exec(res);
    //let f = res?.replace(/[\(\)]/g,"");
    //debug("Starting WHile loop");
    const functionData = (0, server_1.getFunctionData)();
    while (m = lastFunc.exec(res)) {
        const f = m[0];
        (0, console_1.debug)(f);
        for (const i in functionData) {
            if (functionData[i].label === m[0]) {
                let s2 = {
                    label: functionData[i].label,
                    parameters: functionData[i].parameters,
                    documentation: functionData[i].documentation,
                };
                sh.signatures.push(s2);
                //debug(m[0]);
                (0, console_1.debug)(JSON.stringify(functionData[i]));
                break;
            }
        }
    }
    (0, console_1.debug)(sh);
    // debug("WHile loop done");
    // //sh.signatures.push(si);
    let p = {
        label: "Parameter 1",
        documentation: "Param 1 Documentation"
    };
    let p2 = {
        label: "Parameter 2",
        documentation: "Param 2 Documentation"
    };
    let si = {
        label: "SignatureInformation",
        documentation: "Documentation",
        parameters: []
    };
    si.parameters?.push(p);
    si.parameters?.push(p2);
    //sh.signatures.push(si);
    return sh;
    // debug(JSON.stringify(sh));
}
//# sourceMappingURL=signatureHelp.js.map