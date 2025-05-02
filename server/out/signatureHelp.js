"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onSignatureHelp = onSignatureHelp;
exports.getCurrentMethodName = getCurrentMethodName;
exports.getMethodName = getMethodName;
const console_1 = require("console");
const cache_1 = require("./cache");
// let functionSigs: SignatureInformation[] = [];
// With new system, this function will be depracated
// export function prepSignatures(files: PyFile[]) {
// 	debug("Prepping signatures");
// 	for (const i in files) {
// 		const pyFile = files[i];
// 		for (const f in pyFile.defaultFunctions) {
// 			const func = pyFile.defaultFunctions[f];
// 			let si:SignatureInformation = func.buildSignatureInformation();
// 			functionSigs.push(si);
// 		}
// 		for (const c in pyFile.classes) {
// 			functionSigs = functionSigs.concat(pyFile.classes[c].methodSignatureInformation);
// 		}
// 	}
// }
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
    const lastClose = iStr.lastIndexOf(")");
    if (lastClose > last) {
    }
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
const test = "testing(a(),function(1,5, 10)";
function getMethodName(iStr) {
    iStr = test;
    let ret = "";
    let token = "";
    let tokens = [];
    let last = "";
    let level = 0;
    let t;
    while (t = test.match(/\w+\(/)) {
        if (t === null)
            break;
        if (t.index !== undefined)
            break;
        // const line = iStr.substring()
    }
    for (const char of iStr) {
        // We can just ignore spaces
        if (char.match(/\w/)) {
            token += char;
            last = "char";
            continue;
        }
        if (char === "(") {
            level += 1;
            last = "functionOpen";
            continue;
        }
        if (char === (")")) {
            level -= 1;
            last = "functionClose";
            continue;
        }
        if (char !== "") {
        }
    }
    return ret;
}
//# sourceMappingURL=signatureHelp.js.map