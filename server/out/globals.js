"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Globals = void 0;
exports.getGlobals = getGlobals;
const console_1 = require("console");
const fileFunctions_1 = require("./fileFunctions");
const path = require("path");
const fs = require("fs");
const os = require("os");
const sharp = require("sharp");
const vscode_languageserver_1 = require("vscode-languageserver");
const server_1 = require("./server");
const shipData_1 = require("./shipData");
class Globals {
    constructor() {
        this.widget_stylestrings = [];
        this.artemisDir = "";
        this.artFiles = [];
        const thisDir = path.resolve("../");
        const adir = (0, fileFunctions_1.getArtemisDirFromChild)(thisDir);
        (0, console_1.debug)("Artemis Directory: ");
        (0, console_1.debug)(adir);
        if (adir === null) {
            // Do something, throw an error, whatever it takes, artemis dir not found
            this.skyboxes = [];
            this.music = [];
            this.blob_items = [];
            this.data_set_entries = [];
            this.widget_stylestrings = [];
            this.libModules = [];
            this.libModuleCompletionItems = [];
            this.shipData = new shipData_1.ShipData("");
            (0, console_1.debug)("Artemis directory not found. Global information not loaded.");
            artemisDirNotFoundError();
        }
        else {
            // Valid artemis dir has been found
            this.artemisDir = adir;
            this.skyboxes = this.findSkyboxes();
            this.music = this.findMusic();
            this.blob_items = [];
            // this.data_set_entries is not populated here, since loadObjectDataDocumentation() has a promise in it. 
            // That promise then populates the field when complete.
            this.data_set_entries = this.loadObjectDataDocumentation();
            this.libModules = this.loadLibs();
            this.libModuleCompletionItems = [];
            this.shipData = new shipData_1.ShipData(adir);
            for (const lib of this.libModules) {
                const ci = {
                    label: path.basename(lib),
                    kind: vscode_languageserver_1.CompletionItemKind.File
                };
                this.libModuleCompletionItems.push(ci);
            }
            this.artFiles = this.findArtFiles(true);
        }
    }
    loadLibs() {
        let libs = [];
        let libPath = path.join(this.artemisDir, 'data', 'missions', '__lib__');
        libs = (0, fileFunctions_1.getFilesInDir)(libPath, false);
        return libs;
    }
    loadObjectDataDocumentation() {
        const ds = [];
        const ci = [];
        const dataFolder = (0, fileFunctions_1.findSubfolderByName)(this.artemisDir, "data");
        if (dataFolder !== null) {
            const files = (0, fileFunctions_1.getFilesInDir)(dataFolder, false);
            for (const file of files) {
                // debug(file);
                // Here we get all stylestrings by parsing the documentation file.
                if (file.endsWith("widget_stylestring_documentation.txt")) {
                    (0, fileFunctions_1.readFile)(file).then((text) => {
                        const lines = text.split("\n");
                        let lineNum = 0;
                        for (const line of lines) {
                            if (lineNum > 2) {
                                const functionName = line.substring(0, 23).trim();
                                const stylestringName = line.substring(23, 42).trim();
                                const docs = line.substring(42).trim();
                                this.widget_stylestrings.push({
                                    function: functionName,
                                    name: stylestringName,
                                    docs: docs
                                });
                            }
                            lineNum += 1;
                        }
                        (0, console_1.debug)(this.widget_stylestrings);
                    });
                }
                // Now we get all the object_data options, used by blob.set() and blob.get()
                if (file.endsWith("object_data_documentation.txt")) {
                    (0, console_1.debug)("Reading file");
                    (0, fileFunctions_1.readFile)(file).then((text) => {
                        const lines = text.split("\n");
                        let lineNum = 0;
                        for (const line of lines) {
                            // ignore the first 3 lines
                            if (lineNum > 2) {
                                const name = line.substring(0, 31).trim();
                                let typeCheck = line.substring(31, 48);
                                const isArr = typeCheck.includes("array");
                                if (isArr) {
                                    typeCheck = typeCheck.replace("array", "");
                                }
                                typeCheck = typeCheck.trim();
                                if (isArr) {
                                    typeCheck = "List[" + typeCheck + "]";
                                }
                                const docs = line.substring(48).trim();
                                this.data_set_entries.push({
                                    name: name,
                                    type: typeCheck,
                                    docs: docs
                                });
                                const deets = {
                                    description: typeCheck
                                };
                                const ci = {
                                    label: name,
                                    kind: vscode_languageserver_1.CompletionItemKind.Text,
                                    documentation: docs,
                                    detail: "Type: " + typeCheck,
                                    labelDetails: deets
                                };
                                this.blob_items.push(ci);
                            }
                            lineNum++;
                        }
                        //debug(this.blob_items);
                        //console.log(this.blob_items)
                    });
                }
            }
        }
        return ds;
    }
    findArtFiles(byID) {
        let ret = [];
        const files = (0, fileFunctions_1.getFilesInDir)(path.join(this.artemisDir, "data", "graphics", "ships"));
        const ids = [];
        if (byID) {
            for (const file of files) {
                if (file.endsWith(".obj")) {
                    const id = path.basename(file).replace(".obj", "").toLowerCase();
                    ids.push(id);
                    const docs = {
                        kind: "markdown",
                        value: ""
                    };
                    const ci = {
                        label: id,
                        kind: vscode_languageserver_1.CompletionItemKind.File,
                        insertText: id,
                        documentation: docs
                    };
                    ret.push(ci);
                    (0, console_1.debug)(id);
                }
            }
        }
        // Build Temp folder
        const tempPath = path.join(os.tmpdir(), "cosmosImages");
        if (!fs.existsSync(tempPath)) {
            fs.mkdirSync(tempPath);
        }
        for (const file of files) {
            const baseName = path.basename(file).toLowerCase();
            // Regardless if we're using ID or not, we want to create the file
            if (baseName.endsWith(".png") && (baseName.includes("_diffuse") || baseName.includes("256") || baseName.includes("1024"))) {
                let tempFile = path.join(tempPath, baseName);
                if (byID) {
                    tempFile = tempFile.replace(".png", "_150.png");
                }
                // if (!fs.existsSync(tempFile)) {
                try {
                    if (byID) {
                        sharp(file).resize(150, 150).toFile(tempFile);
                    }
                    else {
                        sharp(file).resize(256, 256).toFile(tempFile);
                    }
                }
                catch (e) {
                    (0, console_1.debug)(tempFile);
                    (0, console_1.debug)(e);
                }
                if (byID) {
                    for (const c of ret) {
                        if (baseName.includes(c.label)) {
                            const base = baseName.replace(".png", "");
                            if (base === (c.label + "_diffuse") || base === c.label + "256" || base === c.label + "1024") {
                                let val = "";
                                if (c.documentation !== undefined)
                                    val = c.documentation.value;
                                // if (val.includes(base)) continue;
                                if (base.includes("256") && val.includes("1024"))
                                    continue;
                                if (base.includes("1024") && val.includes("256"))
                                    continue;
                                val = val + "![" + baseName + "](/" + tempFile + ")\n";
                                c.documentation = {
                                    kind: "markdown",
                                    value: val
                                };
                            }
                        }
                    }
                    continue;
                }
                // Effectively an else statement
                if (file.endsWith(".png")) {
                    const docs = {
                        kind: "markdown",
                        value: ""
                    };
                    let val = "![" + path.basename(file) + "](/" + tempFile + ")";
                    docs.value = val;
                    (0, console_1.debug)(val);
                    const c = {
                        label: path.basename(file),
                        kind: vscode_languageserver_1.CompletionItemKind.File,
                        documentation: docs,
                        insertText: path.basename(file)
                    };
                    ret.push(c);
                }
            }
        }
        return ret;
    }
    findSkyboxes() {
        const skyboxes = [];
        const ci = [];
        const graphics = (0, fileFunctions_1.findSubfolderByName)(this.artemisDir, "graphics");
        if (graphics !== null) {
            const files = (0, fileFunctions_1.getFilesInDir)(graphics);
            for (const file of files) {
                if (file.includes("sky") && file.endsWith(".png")) {
                    const last = file.lastIndexOf("/");
                    let sb = file.substring(last + 1).replace(".png", "");
                    skyboxes.push(sb);
                    ci.push({
                        label: path.basename(file).replace(".png", "")
                    });
                }
            }
        }
        return ci;
    }
    findMusic() {
        const options = [];
        const ci = [];
        const music = (0, fileFunctions_1.findSubfolderByName)(this.artemisDir, "music");
        if (music !== null) {
            const files = (0, fileFunctions_1.getFolders)(music);
            for (const file of files) {
                ci.push({
                    label: path.basename(file)
                });
            }
        }
        return ci;
    }
}
exports.Globals = Globals;
let globals = new Globals();
function getGlobals() {
    if (globals === null) {
        try {
            globals = new Globals();
        }
        catch (e) {
            (0, console_1.debug)(e);
            (0, console_1.debug)("Error getting Globals information");
        }
    }
    return globals;
}
async function artemisDirNotFoundError() {
    const res = await server_1.connection.window.showErrorMessage("Root Artemis directory not found. Cannot load some important information.", { title: "Ignore" }, { title: "Don't show again" });
    if (res !== undefined) {
        if (res.title === "Ignore") {
            // Do nothing
        }
        else if (res.title === "Don't show again") {
            // TODO: Add persistence to extension.
        }
    }
}
//# sourceMappingURL=globals.js.map