"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRolesForFile = getRolesForFile;
exports.getRolesAsCompletionItem = getRolesAsCompletionItem;
exports.getInventoryKeysForFile = getInventoryKeysForFile;
exports.getLinksForFile = getLinksForFile;
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
function getRolesForRegEx(re, doc) {
    let ret = [];
    let m;
    while (m = re.exec(doc.getText())) {
        // const list = m[1].split(",");
        // for (const i of list) {
        // 	if (i !== "") {
        // 		roles.push(i);
        // 	}
        // }
        if (m[1] !== undefined) {
            let str = m[1];
            let roles = str.split(",");
            for (const v of roles) {
                const start = m[0].indexOf(v) + m.index;
                const end = start + v.length;
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
    }
    return ret;
}
function getRolesAsCompletionItem(roles, doc) {
    roles = [...new Set(roles)];
    const ci = [];
    for (const r of roles) {
        let filter = r.name;
        let deets = "Role";
        for (const loc of r.locations) {
            (0, console_1.debug)((0, fileFunctions_1.fixFileName)(doc.uri));
            (0, console_1.debug)((0, fileFunctions_1.fixFileName)(loc.uri));
            if ((0, fileFunctions_1.fixFileName)(doc.uri) === (0, fileFunctions_1.fixFileName)(loc.uri)) {
                filter = "___" + r.name;
                deets = "Role (used in this file)";
                break;
            }
        }
        const c = {
            label: r.name,
            kind: vscode_languageserver_1.CompletionItemKind.Text,
            labelDetails: { description: deets }
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
            const v = m[9];
            const start = m[0].indexOf(v) + m.index;
            const end = start + v.length;
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
function getLinksForFile(doc) {
    // LInks that use the link name as the second argument.
    let regex = /link((ed)?_to)?\(.*?,[ \t]*[\"\'](\w+)[\"\']/g;
    let m;
    let ret = [];
    while (m = regex.exec(doc.getText())) {
        if (m[3] !== undefined) {
            const v = m[3];
            const start = m[0].indexOf(v) + m.index;
            const end = start + v.length;
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
    // Links that use the link name as the first argument
    regex = /(has_|\.remove_|\.add|\.get_dedicated_)?link(s_set)?(_to)?\([ \t]*[\"\'](\w+)[\"\']/g;
    while (m = regex.exec(doc.getText())) {
        if (m[3] !== undefined) {
            const v = m[4];
            const start = m[0].indexOf(v) + m.index;
            const end = start + v.length;
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
    let m;
    let ret = [];
    while (m = blob.exec(doc.getText())) {
        const v = m[3];
        const start = m[0].indexOf(v) + m.index;
        const end = start + v.length;
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
        const end = start + v.length;
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
    return ret;
}
//# sourceMappingURL=roles.js.map