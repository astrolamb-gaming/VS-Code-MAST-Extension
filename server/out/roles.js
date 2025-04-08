"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRolesForFile = getRolesForFile;
exports.getRolesAsCompletionItem = getRolesAsCompletionItem;
const console_1 = require("console");
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
    (0, console_1.debug)(roles);
    return roles;
}
function getRolesForRegEx(re, text) {
    let roles = [];
    let m;
    while (m = re.exec(text)) {
        (0, console_1.debug)(m[1]);
        roles.push(m[1]);
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
//# sourceMappingURL=roles.js.map