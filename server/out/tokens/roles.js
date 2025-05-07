"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRolesForFile = getRolesForFile;
exports.getRolesAsCompletionItem = getRolesAsCompletionItem;
exports.getInventoryKeysForFile = getInventoryKeysForFile;
exports.getKeysAsCompletionItem = getKeysAsCompletionItem;
const vscode_languageserver_1 = require("vscode-languageserver");
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
function getInventoryKeysForFile(text) {
    let regex = /inventory_value\(\w+,(?<val>([\"\']))([^\"\']*)\k<val>(,.*)?\)/g;
    let m;
    let keys = [];
    while (m = regex.exec(text)) {
        if (m[3] !== undefined) {
            keys.push(m[3]);
        }
    }
    keys = [...new Set(keys)];
    return keys;
}
function getKeysAsCompletionItem(keys) {
    keys = [...new Set(keys)];
    const ci = [];
    for (const r of keys) {
        const c = {
            label: r,
            kind: vscode_languageserver_1.CompletionItemKind.Text,
            labelDetails: { description: "Inventory Key" }
        };
        ci.push(c);
    }
    return ci;
}
//# sourceMappingURL=roles.js.map