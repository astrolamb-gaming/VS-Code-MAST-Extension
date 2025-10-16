"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRolesForFile = getRolesForFile;
exports.getRolesAsCompletionItem = getRolesAsCompletionItem;
exports.getInventoryKeysForFile = getInventoryKeysForFile;
exports.getKeysAsCompletionItem = getKeysAsCompletionItem;
exports.getBlobKeysForFile = getBlobKeysForFile;
const console_1 = require("console");
const vscode_languageserver_1 = require("vscode-languageserver");
const fileFunctions_1 = require("../fileFunctions");
const comments_1 = require("./comments");
function getRolesForFile(text) {
    let roles = [];
    const regExpArr = [
        /role\([\"\'](.*?)[\"\']\)/g, // string
        /all_roles\([\"\'](.*?)[\"\']\)/g, // comma-separated string
        /add_role\(.*?,[\t ]*[\"\'](.*?)[\"\']\)/g, // id, string
        /any_role\([\"\'](.*?)[\"\']\)/g, // comma-separated string
        /has_role\(.*?,[\t ]*[\"\'](.*?)[\"\']\)/g, // id, string
        /has_roles\(.*?,[\t ]*[\"\'](.*?)[\"\']\)/g, // id, string
        /remove_role\(.*?,[\t ]*[\"\'](.*?)[\"\']\)/g // id, string
    ];
    for (const r of regExpArr) {
        const exp = getRolesForRegEx(r, text);
        roles = roles.concat(exp);
    }
    // Remove duplicates
    roles = [...new Set(roles)];
    return roles;
}
function getRolesForRegEx(re, text) {
    let roles = [];
    let m;
    while (m = re.exec(text)) {
        const list = m[1].split(",");
        for (const i of list) {
            if (i !== "") {
                roles.push(i);
            }
        }
    }
    return roles;
}
function getRolesAsCompletionItem(roles) {
    roles = [...new Set(roles)];
    const ci = [];
    for (const r of roles) {
        const c = {
            label: r,
            kind: vscode_languageserver_1.CompletionItemKind.Text,
            labelDetails: { description: "Role" }
        };
        ci.push(c);
    }
    return ci;
}
function getInventoryKeysForFile(doc) {
    let regex = /((((get|set|remove)_)?(shared_)?inventory_value)|(inventory_set))\([^,]*?,[ \t]*(?<val>([\"\']))([^\"\'\n\r]*)\k<val>,[ \t]*(.*)?\)/g;
    let m;
    let ret = [];
    while (m = regex.exec(doc.getText())) {
        if (m[9] !== undefined) {
            // keys.push(m[9]);
            const v = m[9];
            const start = m[0].indexOf(v) + m.index;
            const end = start + m[0].length;
            if (!(0, comments_1.isInComment)(doc, m.index)) { //!isInString(doc, m.index) || 
                const range = { start: doc.positionAt(start), end: doc.positionAt(end) };
                let found = false;
                for (const w of ret) {
                    if (w.name === v) {
                        w.locations.push({ uri: (0, fileFunctions_1.fileFromUri)(doc.uri), range: range });
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    let var1 = {
                        name: v,
                        locations: [{
                                uri: (0, fileFunctions_1.fileFromUri)(doc.uri),
                                range: range
                            }]
                    };
                    ret.push(var1);
                }
            }
        }
    }
    // filters out any duplicates
    // keys = [...new Set(keys)];
    return ret;
}
function getKeysAsCompletionItem(keys) {
    // keys = [...new Set(keys)];
    const ci = [];
    for (const r of keys) {
        const c = {
            label: r.name,
            kind: vscode_languageserver_1.CompletionItemKind.Text,
            labelDetails: { description: "Inventory Key" }
        };
        ci.push(c);
    }
    return ci;
}
function getBlobKeysForFile(doc) {
    let blob = /(data_set|blob)\.(get|set)\([\"\'](\w+)[\"\']/g;
    let data_set_value = /(get|set)_data_set_value\(.*,[ \t]*[\"\'](\w+)[\"\']/g;
    let keys = [];
    let m;
    let ret = [];
    while (m = blob.exec(doc.getText())) {
        // let key = m[2];
        const v = m[2];
        const start = m[0].indexOf(v) + m.index;
        const end = start + m[0].length;
        if (!(0, comments_1.isInComment)(doc, m.index)) { //!isInString(doc, m.index) || 
            const range = { start: doc.positionAt(start), end: doc.positionAt(end) };
            let found = false;
            for (const w of ret) {
                if (w.name === v) {
                    w.locations.push({ uri: (0, fileFunctions_1.fileFromUri)(doc.uri), range: range });
                    found = true;
                    break;
                }
            }
            if (!found) {
                let var1 = {
                    name: v,
                    locations: [{
                            uri: (0, fileFunctions_1.fileFromUri)(doc.uri),
                            range: range
                        }]
                };
                ret.push(var1);
            }
        }
    }
    while (m = data_set_value.exec(doc.getText())) {
        const v = m[2];
        const start = m[0].indexOf(v) + m.index;
        const end = start + m[0].length;
        if (!(0, comments_1.isInComment)(doc, m.index)) { //!isInString(doc, m.index) || 
            const range = { start: doc.positionAt(start), end: doc.positionAt(end) };
            let found = false;
            for (const w of ret) {
                if (w.name === v) {
                    w.locations.push({ uri: (0, fileFunctions_1.fileFromUri)(doc.uri), range: range });
                    found = true;
                    break;
                }
            }
            if (!found) {
                let var1 = {
                    name: v,
                    locations: [{
                            uri: (0, fileFunctions_1.fileFromUri)(doc.uri),
                            range: range
                        }]
                };
                ret.push(var1);
            }
        }
    }
    (0, console_1.debug)(ret);
    return ret;
}
//# sourceMappingURL=roles.js.map