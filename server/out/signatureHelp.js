"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepSignatures = prepSignatures;
exports.onSignatureHelp = onSignatureHelp;
exports.getCurrentMethodName = getCurrentMethodName;
const console_1 = require("console");
const cache_1 = require("./cache");
let functionSigs = [];
// With new system, this function will be depracated
function prepSignatures(files) {
    (0, console_1.debug)("Prepping signatures");
    for (const i in files) {
        const pyFile = files[i];
        for (const f in pyFile.defaultFunctions) {
            const func = pyFile.defaultFunctions[f];
            let si = func.buildSignatureInformation();
            functionSigs.push(si);
        }
        for (const c in pyFile.classes) {
            functionSigs = functionSigs.concat(pyFile.classes[c].methodSignatureInformation);
        }
    }
}
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
    const iStr = t.substring(startOfLine, pos);
    // Calculate which parameter is the active one
    let m;
    let last = iStr.lastIndexOf("(");
    let sub = iStr.substring(last + 1, pos).replace(/ /g, "");
    let arr = sub.split(",");
    //debug(arr);
    sh.activeParameter = arr.length - 1;
    // Check for the current function name and get SignatureInformation for that function.
    let f = getCurrentMethodName(iStr);
    (0, console_1.debug)(f);
    // let sigs = getCache(text.uri).getMethodSignatures(f);
    // debug(sigs);
    // for (const sig of sigs) {
    // 	if (sig.label === f) {
    // 		debug(sig);
    // 		sh.signatures.push(sig);
    // 	}
    // }
    let sig = (0, cache_1.getCache)(text.uri).getSignatureOfMethod(f);
    (0, console_1.debug)(sig);
    if (sig !== undefined) {
        sh.signatures.push(sig);
    }
    // for (const i in functionSigs) {
    // 	if (functionSigs[i].label === f) {
    // 		sh.signatures.push(functionSigs[i]);
    // 	}
    // }
    // This is just for testing
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
function getCurrentMethodName(iStr) {
    const last = iStr.lastIndexOf("(");
    const priorCheck = iStr.substring(0, last - 1);
    let prior = priorCheck.lastIndexOf("(");
    if (prior === -1) {
        prior = priorCheck.lastIndexOf(".");
    }
    if (prior === -1) {
        prior = priorCheck.lastIndexOf(" ");
    }
    if (prior === -1) {
        prior = 0;
    }
    return iStr.substring(prior, last).replace(/\.|\(| |\"|\'/g, "");
}
//# sourceMappingURL=signatureHelp.js.map