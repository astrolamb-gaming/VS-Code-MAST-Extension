"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoryJson = void 0;
const console_1 = require("console");
const path = require("path");
const fileFunctions_1 = require("../fileFunctions");
const globals_1 = require("../globals");
const server_1 = require("../server");
const fs = require("fs");
class StoryJson {
    constructor(uri) {
        this.uri = "";
        this.sbslib = [];
        this.mastlib = [];
        this.storyJsonErrors = [];
        this.regex = /\.v((\d+)\.(\d+)\.(\d+))\.(\d+\.)*(((mast|sbs)lib)|(zip))/;
        this.errorCheckIgnore = false;
        this.uri = uri;
    }
    getModuleBaseName(module) {
        const res = this.regex.exec(module);
        if (res === null)
            return ""; // Should never occur
        return module.substring(0, res.index);
    }
    checkForErrors() {
        const files = this.mastlib.concat(this.sbslib);
        let errors = -1;
        //debug(files)
        for (const m of files) {
            const libDir = path.join((0, globals_1.getGlobals)().artemisDir, "data", "missions", "__lib__", m);
            const libName = this.getModuleBaseName(m);
            if ((0, globals_1.getGlobals)().libModules.includes(libDir)) {
                // Module found. Check for updated versions
                let latest = this.getLatestVersion(libName);
                if (latest === "") {
                    continue;
                }
                latest = path.basename(latest);
                // This is the latest version, move on to next module
                if (latest === m) {
                    continue;
                }
                else {
                    // Recommend latest version
                    errors = 1;
                    (0, console_1.debug)(latest);
                    (0, console_1.debug)(m);
                    break;
                }
            }
            else {
                // Module NOT found. Show error message and recommend latest version.
                errors = 0;
                const lv = path.basename(this.getLatestVersion(libName));
                (0, console_1.debug)("Module NOT found");
                break;
            }
        }
        if (errors != -1) {
            this.storyJsonError(errors);
        }
    }
    getVersionPriority(version) {
        try {
            const res = this.regex.exec(version);
            if (res === null)
                return 0; // Should never occur, but gotta be sure
            // Here we standardize the format of the number.
            // Each version section could have various lengths, e.g. 1.12.40
            // Therefore, to have a consistent standard even with large numbers, 
            // we put each one into a string with a length of four, then add them
            // together before we parse the number.
            // Dev versions (using a fourth version number), are accounted for using decimal places.
            const major = res[2].padStart(4, "0");
            const minor = res[3].padStart(4, "0");
            const incremental = res[4].padStart(4, "0");
            let dev = res[5];
            if (dev !== null && dev !== undefined) {
                dev = dev.replace(".", "").padStart(4, "0");
            }
            else {
                dev = "0";
            }
            const ret = major + minor + incremental + "." + dev;
            // Since version 1.0.0 has mastlibs designated 3.9.39, we compensate for that, assigning the file a value slightly above zero.
            if (ret.includes("000300090039"))
                return 0.0001;
            return Number.parseFloat(ret);
        }
        catch (e) {
            (0, console_1.debug)(e);
            return 0;
        }
    }
    getVersionString(name) {
        const res = this.regex.exec(name);
        if (res === null)
            return "";
        return res[0];
    }
    compareVersions() {
    }
    /**
     *
     * @param name Name of the module, excluding the version number (call getModuleBaseName() first)
     * @returns String with the name of the most recent version. If the
     */
    getLatestVersion(name) {
        let version = 0;
        let latestFile = "";
        for (const file of (0, globals_1.getGlobals)().libModules) {
            if (file.includes(name)) {
                const v = this.getVersionPriority(file);
                if (v > version) {
                    version = v;
                    latestFile = file;
                }
            }
        }
        return latestFile;
    }
    /**
     * Must be called after instantiating the object.
     */
    async readFile() {
        (0, server_1.showProgressBar)(true);
        // This prevents loading story.json from sbs_utils I think
        if (path.dirname(this.uri).endsWith("sbs_utils"))
            return; // Why is this here? Not actually sure, but there must have been a reason...
        if (!fs.existsSync(this.uri)) {
            let generated = await this.storyJsonNotFoundError();
            if (!generated)
                return;
        }
        try {
            const data = fs.readFileSync(this.uri, "utf-8");
            this.parseFile(data);
            this.checkForErrors();
        }
        catch (e) {
            (0, console_1.debug)("Couldn't read file");
            // storyJsonNotif(0,this.uri,"","");
            (0, console_1.debug)(e);
        }
    }
    async updateModule(module, newVersion = "") {
        try {
            let data = fs.readFileSync(this.uri, "utf-8");
            if (newVersion === "") {
                newVersion = this.getLatestVersion(module);
                (0, console_1.debug)(newVersion);
            }
            data = data.replace(module, newVersion);
            fs.writeFileSync(this.uri, data);
            this.parseFile(data);
            this.checkForErrors();
        }
        catch (e) {
            (0, console_1.debug)(e);
            (0, server_1.notifyClient)("Could not update module\n" + e);
        }
    }
    async updateAllModules() {
        const libs = this.mastlib.concat(this.sbslib);
        try {
            let data = fs.readFileSync(this.uri, "utf-8");
            for (const module of libs) {
                let name = this.getModuleBaseName(module);
                const newest = this.getLatestVersion(name);
                data = data.replace(module, path.basename(newest));
            }
            fs.writeFileSync(this.uri, data);
            this.parseFile(data);
            this.checkForErrors();
        }
        catch (e) {
            (0, console_1.debug)(e);
            (0, server_1.notifyClient)("Could not update module\n" + e);
        }
    }
    /** Only call this from readFile() */
    parseFile(text) {
        const story = JSON.parse(text);
        if (story.sbslib)
            this.sbslib = story.sbslib;
        if (story.mastlib)
            this.mastlib = story.mastlib;
    }
    /**
     * @param errorType
     * story.json error types:
     * 0 - Error - Referenced file does not exist
     * 1 - Warning - Referenced file is not the latest version
     * @param jsonUri
     */
    async storyJsonError(errorType) {
        const useLatest = "Update to latest";
        const manual = "Update manually";
        const hide = "Don't show again";
        const err = path.basename((0, fileFunctions_1.getMissionFolder)(this.uri)) + ": story.json contains references to files that do not exist";
        const warn = path.basename((0, fileFunctions_1.getMissionFolder)(this.uri)) + ": Newer versions are available for story.json references";
        let message;
        if (errorType === 0)
            message = err;
        if (errorType === 1)
            message = warn;
        if (message === undefined)
            return;
        let ret = await server_1.connection.window.showErrorMessage(message, { title: useLatest }, { title: manual });
        if (ret === undefined)
            return;
        if (ret.title === useLatest) {
            // Update story.json to reference latest file versions
            this.updateAllModules();
        }
        else if (ret.title === manual) {
            // Open story.json
            (0, server_1.sendToClient)("showFile", this.uri);
        }
        else if (ret.title === hide) {
            // Add persistence setting to this
        }
    }
    async storyJsonNotFoundError() {
        let generate = "Generate empty";
        let gen_pop = "Generate/Populate";
        let ignore = "Ignore";
        let ret = await server_1.connection.window.showErrorMessage("`story.json` not found", { title: generate }, { title: gen_pop }, { title: ignore });
        if (ret === undefined)
            return false;
        if (ret.title === generate) {
            // Create story.json
            let latest = path.basename(this.getLatestVersion("artemis-sbs.sbs_utils"));
            fs.writeFileSync(this.uri, "{\n\t\"sbslib\": [\"" + latest + "\"],\n\t\"mastlib\": []\n}", { "encoding": "utf-8" });
            return true;
        }
        else if (ret.title === gen_pop) {
            // Generate story.json from default settings - get from mast_starter?
            let sjc = await (0, fileFunctions_1.getFileContents)("https://raw.githubusercontent.com/artemis-sbs/mast_starter/refs/heads/main/story.json");
            fs.writeFileSync(this.uri, sjc, { "encoding": "utf-8" });
            return true;
        }
        else if (ret.title === ignore) {
            // Do nothing.
            return false;
        }
        return false;
    }
}
exports.StoryJson = StoryJson;
//# sourceMappingURL=storyJson.js.map