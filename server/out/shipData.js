"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShipData = void 0;
const console_1 = require("console");
const path = require("path");
const fileFunctions_1 = require("./fileFunctions");
const server_1 = require("./server");
const Hjson = require("hjson");
class ShipData {
    constructor(artemisDir) {
        this.roles = [];
        this.data = [];
        this.fileExists = false;
        this.validJSON = true;
        this.filePath = "";
        this.artemisDir = artemisDir;
        try {
            this.load();
        }
        catch (e) {
            (0, console_1.debug)(e);
        }
    }
    load() {
        const file = path.join(this.artemisDir, "data", "shipData.json");
        this.filePath = file;
        if (file !== null) {
            (0, fileFunctions_1.readFile)(file).then((contents) => {
                // contents = contents.replace(/\/\/.*?(\n|$)/gm,"");
                try {
                    this.data = Hjson.parse(contents)["#ship-list"];
                    this.validJSON = true;
                    // this.parseShips();
                    this.roles = this.parseRolesJSON();
                }
                catch (e) {
                    const err = e;
                    this.validJSON = false;
                    (0, console_1.debug)("shipData.json NOT parsed properly");
                    (0, console_1.debug)(err);
                    this.shipDataJsonError(err);
                    this.roles = this.parseRolesText(contents);
                }
                // debug(this.data);
                // debug(typeof this.data[0]);
                this.fileExists = true;
            });
        }
        else {
            //throw new Error("shipData.json not found!");
            this.fileExists = false;
        }
    }
    async shipDataJsonError(err) {
        let ret = await server_1.connection.window.showErrorMessage("shipData.json contains an error:\n" + err.name + ": " + err.message, { title: "Open file to fix" }, { title: "Ignore" });
        if (ret === undefined)
            return;
        if (ret.title === "Open file to fix") {
            (0, server_1.sendToClient)("showFile", this.filePath);
        }
        else if (ret.title === "Ignore") { }
    }
    parseShips() {
        const ships = [];
        for (const d of this.data) {
            const ship = {
                key: "",
                name: "",
                side: "",
                artFileRoot: "",
                roles: []
            };
            let key = d["key"];
            if (key)
                ship.key = key;
            let name = d["name"];
            if (name)
                ship.name = name;
            let side = d["side"];
            if (side)
                ship.side = side;
            let art = d["artfileroot"];
            if (art)
                ship.artFileRoot = art;
            let roles = d["roles"];
            if (roles) {
                const roleList = [];
                const list = roles.split(",");
                for (const l of list) {
                    roleList.push(l.trim());
                }
                ship.roles = roleList;
            }
            if (ship.key !== "") {
                ships.push(ship);
            }
        }
        (0, console_1.debug)(ships);
        return ships;
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