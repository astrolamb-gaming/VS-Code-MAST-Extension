"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShipData = void 0;
const console_1 = require("console");
const path = require("path");
const fileFunctions_1 = require("./fileFunctions");
const roles_1 = require("./roles");
class ShipData {
    constructor(artemisDir) {
        this.roles = [];
        this.data = [];
        this.fileExists = false;
        try {
            this.load(artemisDir);
        }
        catch (e) {
            (0, console_1.debug)(e);
        }
    }
    load(artemisDir) {
        const file = path.join(artemisDir, "data", "shipData.json");
        if (file !== null) {
            (0, fileFunctions_1.readFile)(file).then((contents) => {
                contents = contents.replace(/\/\/.*?(\n|$)/gm, "");
                try {
                    this.data = JSON.parse(contents)["#ship-list"];
                }
                catch (e) {
                    (0, console_1.debug)("shipData.json NOT parsed properly");
                    (0, console_1.debug)(e);
                }
                (0, console_1.debug)(this.data);
                this.fileExists = true;
                this.roles = this.parseRoles();
            });
        }
        else {
            //throw new Error("shipData.json not found!");
            this.fileExists = false;
        }
    }
    parseRoles() {
        let roles = [];
        for (const ship of this.data) {
            let newRoles = ship["roles"];
            if (newRoles) {
                const list = newRoles.split(",");
                for (const l of list) {
                    roles.push(l.trim());
                }
            }
            newRoles = ship["side"];
            if (newRoles) {
                const list = newRoles.split(",");
                for (const l of list) {
                    roles.push(l.trim());
                }
            }
        }
        roles = [...new Set(roles)];
        return (0, roles_1.getRolesAsCompletionItem)(roles);
    }
}
exports.ShipData = ShipData;
//# sourceMappingURL=shipData.js.map