"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShipData = void 0;
const console_1 = require("console");
const path = require("path");
const fs = require("fs");
const os = require("os");
const fileFunctions_1 = require("./fileFunctions");
const vscode_languageserver_1 = require("vscode-languageserver");
const server_1 = require("./server");
const Hjson = require("hjson");
const artemisGlobals_1 = require("./artemisGlobals");
const sharp = require("sharp");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
class ShipData {
    constructor(artemisDir) {
        this.roles = [];
        this.data = [];
        this.fileExists = false;
        this.validJSON = true;
        this.filePath = "";
        this.ships = [];
        this.artemisDir = artemisDir;
        if (artemisDir === "")
            return;
        // try {
        // 	this.load();
        // } catch(e) {
        // 	debug(e);
        // }
        fs.watch(artemisDir, (eventType, filename) => {
            this.load();
        });
    }
    load() {
        let file = path.join(this.artemisDir, "data", "shipData.yaml");
        if (!fs.existsSync(file)) {
            file = path.join(this.artemisDir, "data", "shipData.json");
        }
        this.filePath = file;
        if (file !== null) {
            (0, fileFunctions_1.readFile)(file).then((contents) => {
                this.textDoc = vscode_languageserver_textdocument_1.TextDocument.create(this.filePath, path.extname(this.filePath), 0, contents);
                // contents = contents.replace(/\/\/.*?(\n|$)/gm,"");
                try {
                    this.data = Hjson.parse(contents)["#ship-list"];
                    this.validJSON = true;
                    this.ships = this.parseShips();
                    // this.roles = this.parseRolesJSON();
                }
                catch (e) {
                    const err = e;
                    this.validJSON = false;
                    (0, console_1.debug)("shipData.json NOT parsed properly");
                    (0, console_1.debug)(err);
                    this.shipDataJsonError(err);
                }
                this.roles = this.parseRolesText(this.textDoc);
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
                roles: [],
                completionItem: {
                    label: "",
                    kind: vscode_languageserver_1.CompletionItemKind.Text
                }
            };
            let key = d["key"];
            if (key)
                ship.key = key;
            ship.completionItem.label = key;
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
                    roleList.push(l.trim().toLowerCase());
                }
                ship.roles = roleList;
            }
            if (ship.key !== "") {
                ships.push(ship);
            }
            ship.completionItem.filterText = [
                key,
                name,
                side,
                roles
            ].join(" ");
            // TODO: Add additional information about the shipdata entry
            const documentation = {
                kind: 'markdown',
                value: this.findArtFile(art)
            };
            ship.completionItem.documentation = documentation;
        }
        // debug(ships);
        return ships;
    }
    findArtFile(artfileroot) {
        const tempPath = path.join(os.tmpdir(), "cosmosImages");
        if (!fs.existsSync(tempPath)) {
            fs.mkdirSync(tempPath, { recursive: true });
        }
        let tempFile = path.join(tempPath, artfileroot + "_150.png");
        let tempDiffuse = path.join(tempPath, artfileroot + "_diffuse_150.png");
        // Check if the 150p file exists
        if (!fs.existsSync(tempFile) || !fs.existsSync(tempDiffuse)) {
            // If it doesn't exist, we need to create the new file
            let artDir = path.join(this.artemisDir, "data", "graphics", "ships");
            // This should always exist
            let diffuse = path.join(artDir, artfileroot + "_diffuse.png");
            // At least one of these should exist...
            let png = path.join(artDir, artfileroot + ".png");
            if (!fs.existsSync(png)) {
                png = path.join(artDir, artfileroot + "256.png");
                if (!fs.existsSync(png)) {
                    png = path.join(artDir, artfileroot + "1024.png");
                    (0, console_1.debug)("PNG MAY NOT EXIST FOR " + png);
                }
            }
            if (!fs.existsSync(png) || !fs.existsSync(diffuse)) {
                (0, console_1.debug)("WARNING, file not found: " + png);
            }
            else {
                // File definitely exists
                try {
                    (0, console_1.debug)(tempFile);
                    (0, console_1.debug)(tempDiffuse);
                    sharp(png).resize(150, 150).toFile(tempFile);
                    sharp(diffuse).resize(150, 150).toFile(tempDiffuse);
                }
                catch (e) {
                    (0, console_1.debug)(tempFile);
                    (0, console_1.debug)(tempDiffuse);
                    (0, console_1.debug)(e);
                    return "";
                }
            }
        }
        // Now that we know the 150p files exist, we can get them
        let ret = "![" + artfileroot + "](/" + tempFile + ")\n![diffuse](/" + tempDiffuse + ")";
        // debug(ret);
        return ret;
    }
    parseArtJSON() {
        let art = [];
        for (const ship of this.data) {
            let key = ship["key"];
            if (key !== undefined && key !== null)
                art.push(key);
        }
        return art;
    }
    getShipInfoFromKey(key) {
        for (const ship of this.data) {
            if (ship["key"] === key) {
                return ship;
            }
        }
        return undefined;
    }
    buildCompletionItemForShip(ship) {
        let ci = {
            label: ship["key"],
            kind: vscode_languageserver_1.CompletionItemKind.Text,
            insertText: ship["key"]
        };
        return ci;
    }
    getCompletionItemsForShips() {
        let g = (0, artemisGlobals_1.getArtemisGlobals)();
        let ci = g.artFiles;
        for (const c of ci) {
            const ship = this.getShipInfoFromKey(c.label);
            (0, console_1.debug)(ship);
            if (ship === undefined || ship["key"] == undefined)
                continue;
            c.label = ship["key"];
        }
        return ci;
    }
    parseRolesJSON() {
        let roles = [];
        for (const ship of this.data) {
            let newRoles = ship["roles"];
            if (newRoles) {
                const list = newRoles.split(",");
                for (const l of list) {
                    roles.push(l.trim().toLowerCase());
                }
            }
            newRoles = ship["side"];
            if (newRoles) {
                const list = newRoles.split(",");
                for (const l of list) {
                    roles.push(l.trim().toLowerCase());
                }
            }
        }
        roles = [...new Set(roles)];
        return roles;
    }
    parseRolesText(doc) {
        let ret = [];
        const lines = doc.getText().split("\n");
        for (const line of lines) {
            if (line.trim().startsWith("\"roles\"") || line.trim().startsWith("\"side\"")) {
                const role = line.trim().replace("roles", "").replace("side", "").replace(/\"/g, "").replace(":", "").trim();
                const list = role.split(",");
                for (let v of list) {
                    v = v.trim().toLowerCase();
                    if (v === "") {
                        continue;
                    }
                    const start = line.indexOf(v.trim());
                    const end = start + v.length;
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
        // roles = [...new Set(roles)];
        return ret;
    }
}
exports.ShipData = ShipData;
//# sourceMappingURL=shipData.js.map