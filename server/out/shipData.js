"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShipData = void 0;
const console_1 = require("console");
const path = require("path");
const fileFunctions_1 = require("./fileFunctions");
class ShipData {
    constructor(artemisDir) {
        this.roles = [];
        this.data = [];
        this.fileExists = false;
        this.validJSON = true;
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
                    this.validJSON = true;
                    this.roles = this.parseRolesJSON();
                }
                catch (e) {
                    this.validJSON = false;
                    (0, console_1.debug)("shipData.json NOT parsed properly");
                    (0, console_1.debug)(e);
                    this.roles = this.parseRolesText(contents);
                }
                (0, console_1.debug)(this.data);
                this.fileExists = true;
            });
        }
        else {
            //throw new Error("shipData.json not found!");
            this.fileExists = false;
        }
    }
    parseRolesJSON() {
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
        return roles;
    }
    parseRolesText(contents) {
        let roles = [];
        const lines = contents.split("\n");
        for (const line of lines) {
            if (line.trim().startsWith("\"roles\"") || line.trim().startsWith("\"side\"")) {
                const role = line.trim().replace("roles", "").replace("side", "").replace(/\"/g, "").replace(":", "").trim();
                (0, console_1.debug)(role);
                const list = role.split(",");
                for (const r of list) {
                    if (r !== "") {
                        roles.push(r.trim());
                    }
                }
            }
        }
        roles = [...new Set(roles)];
        return roles;
    }
}
exports.ShipData = ShipData;
//# sourceMappingURL=shipData.js.map