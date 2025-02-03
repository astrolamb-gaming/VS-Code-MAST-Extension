"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoryJson = exports.MissionCache = void 0;
exports.loadCache = loadCache;
exports.getSourceFiles = getSourceFiles;
exports.getCache = getCache;
const fs = require("fs");
const path = require("path");
const data_1 = require("./data");
const console_1 = require("console");
const autocompletion_1 = require("./autocompletion");
const signatureHelp_1 = require("./signatureHelp");
const rx_1 = require("./rx");
const fileFunctions_1 = require("./fileFunctions");
const vscode_uri_1 = require("vscode-uri");
function loadCache(dir) {
    // TODO: Need a list of caches, in case there are files from more than one mission folder open
    let cache = getCache(dir);
    (0, fileFunctions_1.getMissionFolder)(dir);
    // if (cache === undefined) {
    // 	cache = new MissionCache(dir);
    // 	caches.push(cache);
    // }
    // const defSource = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/sbs_utils/mast/mast.py";
    // const defSource2 = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/sbs_utils/mast/maststory.py";
    //loadTypings().then(()=>{ debug("Typings Loaded" )});
    //loadRouteLabels().then(()=>{ debug("Routes Loaded") });
    // getRexEx(defSource).then(()=>{ debug("Regular Expressions gotten")});
    // getRexEx(defSource2).then(()=>{ debug("Regular Expressions 2 gotten")
    // 	debug("Label?: ");
    // 	debug(exp.get("Label"));
    // });
    //debug(getStoryJson(dir));
}
class MissionSubFolder {
    constructor(uri) {
        this.uri = uri;
    }
}
class MissionCache {
    constructor(workspaceUri) {
        this.missionName = "";
        this.missionURI = "";
        // The Modules are the default sbslib and mastlib files.
        // They apply to ALL files in the mission folder.
        this.missionPyModules = [];
        this.missionMastModules = [];
        this.missionDefaultCompletions = [];
        this.missionDefaultSignatures = [];
        this.missionClasses = [];
        // string is the full file path and name
        // FileCache is the information associated with the file
        this.pyFileInfo = [];
        this.mastFileInfo = [];
        (0, console_1.debug)(workspaceUri);
        this.missionURI = (0, fileFunctions_1.getMissionFolder)(workspaceUri);
        (0, console_1.debug)(this.missionURI);
        this.missionName = path.basename(this.missionURI);
        this.storyJson = new StoryJson(path.join(this.missionURI, "story.json"));
        this.storyJson.readFile().then(() => { this.modulesLoaded(); });
        let files = (0, fileFunctions_1.getFilesInDir)(this.missionURI);
        for (const file of files) {
            if (path.extname(file) === "mast") {
                (0, console_1.debug)(file);
                if (path.basename(file).includes("__init__")) {
                    (0, console_1.debug)("INIT file found");
                }
                else {
                    // Parse MAST File
                    const m = new data_1.MastFile(file);
                    this.mastFileInfo.push(m);
                }
            }
            if (path.extname(file) === "py") {
                (0, console_1.debug)(file);
                // Parse Python File
                const p = new data_1.PyFile(file);
                this.pyFileInfo.push(p);
            }
        }
    }
    modulesLoaded() {
        const uri = this.missionURI;
        (0, console_1.debug)(uri);
        if (uri.includes("sbs_utils")) {
            (0, console_1.debug)("sbs nope");
        }
        const missionLibFolder = path.join((0, fileFunctions_1.getParentFolder)(uri), "__lib__");
        (0, console_1.debug)(missionLibFolder);
        const lib = this.storyJson.mastlib.concat(this.storyJson.sbslib);
        for (const zip of lib) {
            const zipPath = path.join(missionLibFolder, zip);
            (0, fileFunctions_1.readZipArchive)(zipPath).then((data) => {
                (0, console_1.debug)("Zip archive read for " + zipPath);
                this.handleZipData(data);
            }).catch(err => {
                (0, console_1.debug)("Error unzipping. \n" + err);
            });
        }
        loadSbs().then((p) => {
            this.missionPyModules.push(p);
            this.missionClasses = this.missionClasses.concat(p.classes);
            this.missionDefaultCompletions = this.missionDefaultCompletions.concat(p.defaultFunctionCompletionItems);
            for (const s of p.defaultFunctions) {
                this.missionDefaultSignatures.push(s.signatureInformation);
            }
        });
    }
    handleZipData(zip) {
        //debug(zip);
        zip.forEach((data, file) => {
            if (file.endsWith(".py")) {
                const p = new data_1.PyFile(file, data);
                this.missionPyModules.push(p);
                this.missionClasses = this.missionClasses.concat(p.classes);
                this.missionDefaultCompletions = this.missionDefaultCompletions.concat(p.defaultFunctionCompletionItems);
                //this.missionDefaultSignatures = this.missionDefaultSignatures.concat(p.defaultFunctions)
                for (const s of p.defaultFunctions) {
                    this.missionDefaultSignatures.push(s.signatureInformation);
                }
            }
            if (file.endsWith(".mast")) {
                const m = new data_1.MastFile(file, data);
                this.missionMastModules.push(m);
            }
        });
        (0, console_1.debug)(this.missionDefaultCompletions);
        (0, console_1.debug)(this.missionClasses);
    }
    /**
     * @param fileUri The uri of the file.
     * @returns List of {@link LabelInfo LabelInfo} applicable to the current scope
     */
    getLabels(fileUri) {
        let li = [];
        for (const f of this.mastFileInfo) {
            // Check if the mast files are in scope
            // TODO: Check init.mast for if any files should not be included
            (0, console_1.debug)(fileUri);
            if (f.parentFolder === (0, fileFunctions_1.getParentFolder)(fileUri)) {
                li = li.concat(f.labelNames);
            }
        }
        return li;
    }
    /**
     * @param _class String name of the class that we're dealing with. Optional. Default value is an empty string, and the default functions will be returned.
     * @returns List of {@link CompletionItem CompletionItem} related to the class, or the default function completions
     */
    getCompletions(_class = "") {
        let ci = [];
        // Don't need to do this, but will be slightly faster than iterating over missionClasses and then returning the defaults
        if (_class === "") {
            ci = this.missionDefaultCompletions;
            for (const c of this.missionClasses) {
                ci.push(c.completionItem);
            }
            // TODO: Add variables in scope
            return ci;
        }
        for (const c of this.missionClasses) {
            if (c.name === _class) {
                (0, console_1.debug)(c.name + " is the class we're looking for.");
                (0, console_1.debug)(c.methodCompletionItems);
                return c.methodCompletionItems;
            }
        }
        return this.missionDefaultCompletions;
    }
    getMethodSignatures(name) {
        let si = this.missionDefaultSignatures;
        // .filter((sig, index, arr)=>{
        // 	sig.label === name;
        // });
        // TODO: Add functions from py files in local directory
        return si;
    }
}
exports.MissionCache = MissionCache;
class StoryJson {
    constructor(uri) {
        this.uri = "";
        this.sbslib = [];
        this.mastlib = [];
        this.complete = false;
        this.uri = uri;
    }
    /**
     * Must be called after instantiating the object.
     */
    async readFile() {
        try {
            const data = fs.readFileSync(this.uri, "utf-8");
            this.parseFile(data);
        }
        catch (e) {
            (0, console_1.debug)("Couldn't read file");
            (0, console_1.debug)(e);
        }
    }
    /** Only call this from readFile() */
    parseFile(text) {
        const story = JSON.parse(text);
        (0, console_1.debug)(story);
        if (story.sbslib)
            this.sbslib = story.sbslib;
        if (story.mastlib)
            this.mastlib = story.mastlib;
        this.complete = true;
    }
}
exports.StoryJson = StoryJson;
const sourceFiles = [];
function getSourceFiles() { return sourceFiles; }
async function loadTypings() {
    try {
        //const { default: fetch } = await import("node-fetch");
        //const fetch = await import('node-fetch');
        //let github : string = "https://github.com/artemis-sbs/sbs_utils/raw/refs/heads/master/mock/sbs.py";
        let gh = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/typings/";
        // TODO: try getting local files. If this fails, then use the github files.
        for (const page in files) {
            let url = gh + files[page] + ".pyi";
            const data = await fetch(url);
            const textData = await data.text();
            //sourceFiles.push(parseWholeFile(textData, files[page]));
            sourceFiles.push(new data_1.PyFile(url));
        }
        (0, autocompletion_1.prepCompletions)(sourceFiles);
        (0, signatureHelp_1.prepSignatures)(sourceFiles);
    }
    catch (err) {
        (0, console_1.debug)("\nFailed to load\n" + err);
    }
}
async function loadSbs() {
    let gh = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/mock/sbs.py";
    const data = await fetch(gh);
    const text = await data.text();
    return new data_1.PyFile(gh, text);
}
const expressions = [];
const exp = new Map();
async function getRexEx(src) {
    const data = await fetch(src);
    const txt = await data.text();
    (0, rx_1.parse)(txt, exp);
    let name = "Geralt";
    let age = 95;
    let message = `The Witcher is of age ${age} and his name is ${name}`;
}
let files = [
    "sbs/__init__",
    "sbs_utils/agent",
    "sbs_utils/consoledispatcher",
    "sbs_utils/damagedispatcher",
    "sbs_utils/extra_dispatcher",
    "sbs_utils/faces",
    "sbs_utils/fs",
    "sbs_utils/futures",
    "sbs_utils/griddispatcher",
    "sbs_utils/gridobject",
    "sbs_utils/gui",
    "sbs_utils/handlerhooks",
    "sbs_utils/helpers",
    "sbs_utils/layout",
    "sbs_utils/lifetimedispatchers",
    "sbs_utils/objects",
    "sbs_utils/scatter",
    "sbs_utils/spaceobject",
    "sbs_utils/tickdispatcher",
    "sbs_utils/vec",
    "sbs_utils/mast/label",
    "sbs_utils/mast/mast",
    "sbs_utils/mast/mast_sbs_procedural",
    "sbs_utils/mast/mastmission",
    "sbs_utils/mast/mastobjects",
    "sbs_utils/mast/mastscheduler",
    "sbs_utils/mast/maststory",
    "sbs_utils/mast/maststorypage",
    "sbs_utils/mast/maststoryscheduler",
    "sbs_utils/mast/parsers",
    "sbs_utils/mast/pollresults",
    "sbs_utils/pages/avatar",
    "sbs_utils/pages/shippicker",
    "sbs_utils/pages/start",
    "sbs_utils/pages/layout/layout",
    "sbs_utils/pages/layout/text_area",
    "sbs_utils/pages/widgets/control",
    "sbs_utils/pages/widgets/layout_listbox",
    "sbs_utils/pages/widgets/listbox",
    "sbs_utils/pages/widgets/shippicker",
    "sbs_utils/procedural/behavior",
    "sbs_utils/procedural/comms",
    "sbs_utils/procedural/cosmos",
    "sbs_utils/procedural/execution",
    "sbs_utils/procedural/grid",
    "sbs_utils/procedural/gui",
    "sbs_utils/procedural/internal_damage",
    "sbs_utils/procedural/inventory",
    "sbs_utils/procedural/links",
    "sbs_utils/procedural/maps",
    "sbs_utils/procedural/query",
    "sbs_utils/procedural/roles",
    "sbs_utils/procedural/routes",
    "sbs_utils/procedural/science",
    "sbs_utils/procedural/screen_shot",
    "sbs_utils/procedural/ship_data",
    "sbs_utils/procedural/signal",
    "sbs_utils/procedural/space_objects",
    "sbs_utils/procedural/spawn",
    "sbs_utils/procedural/style",
    "sbs_utils/procedural/timers"
];
let caches = [];
/**
 *
 * @param name Can be either the name of the mission folder, or a URI to that folder or any folder within the mission folder.
 * @returns
 */
function getCache(name) {
    let ret = undefined;
    if (name.startsWith("file")) {
        name = vscode_uri_1.URI.parse(name).fsPath;
    }
    (0, console_1.debug)("Trying to get cache with name: " + name);
    const mf = (0, fileFunctions_1.getMissionFolder)(name);
    //debug(mf);
    for (const cache of caches) {
        if (cache.missionName === name || cache.missionURI === mf) {
            return cache;
        }
    }
    if (ret === undefined) {
        ret = new MissionCache(name);
        caches.push(ret);
    }
    return ret;
}
//# sourceMappingURL=cache.js.map