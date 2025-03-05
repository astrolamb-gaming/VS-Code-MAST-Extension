"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoryJson = exports.MissionCache = exports.Globals = void 0;
exports.getGlobals = getGlobals;
exports.loadCache = loadCache;
exports.getSourceFiles = getSourceFiles;
exports.getCache = getCache;
const fs = require("fs");
const path = require("path");
const vscode_languageserver_1 = require("vscode-languageserver");
const data_1 = require("./data");
const labels_1 = require("./labels");
const console_1 = require("console");
const autocompletion_1 = require("./autocompletion");
const signatureHelp_1 = require("./signatureHelp");
const rx_1 = require("./rx");
const routeLabels_1 = require("./routeLabels");
const fileFunctions_1 = require("./fileFunctions");
const server_1 = require("./server");
const vscode_uri_1 = require("vscode-uri");
const python_1 = require("./python");
class Globals {
    constructor() {
        this.artemisDir = "";
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
            this.libEntries = [];
            (0, console_1.debug)("Artemis directory not found. Global information not loaded.");
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
            this.libEntries = this.loadLibs();
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
                //debug(file);
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
                    break;
                }
            }
        }
        return ds;
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
        //debug(workspaceUri);
        this.missionName = "";
        this.missionURI = "";
        this.missionLibFolder = "";
        // The Modules are the default sbslib and mastlib files.
        // They apply to ALL files in the mission folder.
        this.missionPyModules = [];
        this.missionMastModules = [];
        this.missionDefaultCompletions = [];
        this.missionDefaultSignatures = [];
        this.missionClasses = [];
        this.missionDefaultFunctions = [];
        // string is the full file path and name
        // FileCache is the information associated with the file
        this.pyFileInfo = [];
        this.mastFileInfo = [];
        //// Other Labels
        // Route Labels - From RouteDecoratorLabel class
        this.routeLabels = [];
        // Media Labels - From procedural/media.py # _media_schedule()
        this.mediaLabels = [];
        // Resource Labels - Not sure how best to handle these...
        /**
         * TODO: See about parsing all python classes that derive from Label
         */
        this.resourceLabels = [];
        this.resourceLabels = (0, routeLabels_1.loadResourceLabels)();
        this.mediaLabels = this.mediaLabels.concat((0, routeLabels_1.loadMediaLabels)());
        this.missionURI = (0, fileFunctions_1.getMissionFolder)(workspaceUri);
        (0, console_1.debug)(this.missionURI);
        let parent = (0, fileFunctions_1.getParentFolder)(this.missionURI);
        this.missionLibFolder = path.join(parent, "__lib__");
        this.missionName = path.basename(this.missionURI);
        this.storyJson = new StoryJson(path.join(this.missionURI, "story.json"));
        this.storyJson.readFile().then(() => { this.modulesLoaded(); });
        let files = (0, fileFunctions_1.getFilesInDir)(this.missionURI);
        //debug(files);
        loadSbs().then((p) => {
            (0, console_1.debug)("Loaded SBS, starting to parse.");
            if (p !== null) {
                //debug(p.classes);
                this.missionPyModules.push(p);
                this.missionClasses = this.missionClasses.concat(p.classes);
                this.missionDefaultCompletions = this.missionDefaultCompletions.concat(p.defaultFunctionCompletionItems);
                for (const s of p.defaultFunctions) {
                    this.missionDefaultSignatures.push(s.signatureInformation);
                }
            }
        });
        for (const file of files) {
            //debug(path.extname(file));
            if (path.extname(file) === ".mast") {
                //debug(file);
                if (path.basename(file).includes("__init__")) {
                    //debug("INIT file found");
                }
                else {
                    // Parse MAST File
                    const m = new data_1.MastFile(file);
                    this.mastFileInfo.push(m);
                }
            }
            if (path.extname(file) === ".py") {
                //debug(file);
                if (path.basename(file).includes("__init__")) {
                    //debug("INIT file found");
                }
                else {
                    // Parse Python File
                    const p = new data_1.PyFile(file);
                    this.pyFileInfo.push(p);
                }
            }
        }
    }
    async modulesLoaded() {
        const uri = this.missionURI;
        //debug(uri);
        if (uri.includes("sbs_utils")) {
            (0, console_1.debug)("sbs nope");
        }
        try {
            const libErrs = [];
            (0, console_1.debug)(this.missionLibFolder);
            const lib = this.storyJson.mastlib.concat(this.storyJson.sbslib);
            let complete = false;
            for (const zip of lib) {
                const zipPath = path.join(this.missionLibFolder, zip);
                (0, fileFunctions_1.readZipArchive)(zipPath).then((data) => {
                    //debug("Zip archive read for " + zipPath);
                    this.handleZipData(data, zip);
                    libErrs.push("");
                }).catch(err => {
                    (0, console_1.debug)("Error unzipping. \n" + err);
                    if (("" + err).includes("Invalid filename")) {
                        libErrs.push("File does not exist:\n" + zipPath);
                    }
                });
            }
            while (libErrs.length !== lib.length) {
                await (0, python_1.sleep)(50);
            }
            if (libErrs.length > 0) {
                (0, server_1.storyJsonNotif)("Error", this.storyJson.uri, "", libErrs.join("\n"));
            }
        }
        catch (e) {
            (0, console_1.debug)("Error in modulesLoaded()");
            (0, console_1.debug)(e);
        }
    }
    handleZipData(zip, parentFolder = "") {
        //debug(zip);
        zip.forEach((data, file) => {
            //debug(file)
            if (parentFolder !== "") {
                file = parentFolder + path.sep + file;
            }
            //debug(file);
            if (file.endsWith("__init__.mast") || file.endsWith("__init__.py")) {
                // Do nothing
            }
            else if (file.endsWith(".py")) {
                this.routeLabels = this.routeLabels.concat((0, routeLabels_1.loadRouteLabels)(data));
                // this.mediaLabels = this.mediaLabels.concat(loadMediaLabels(data));
                // this.resourceLabels = this.resourceLabels.concat(loadResourceLabels(data));
                const p = new data_1.PyFile(file, data);
                this.missionPyModules.push(p);
                if (file.includes("sbs_utils") && !file.includes("procedural")) {
                    // Don't wanat anything not procedural included???
                    return;
                }
                this.missionClasses = this.missionClasses.concat(p.classes);
                //debug(this.missionClasses);
                this.missionDefaultCompletions = this.missionDefaultCompletions.concat(p.defaultFunctionCompletionItems);
                //this.missionDefaultSignatures = this.missionDefaultSignatures.concat(p.defaultFunctions)
                //p.defaultFunctions
                this.missionDefaultFunctions = this.missionDefaultFunctions.concat(p.defaultFunctions);
                for (const s of p.defaultFunctions) {
                    this.missionDefaultSignatures.push(s.signatureInformation);
                }
            }
            else if (file.endsWith(".mast")) {
                //debug("Building file: " + file);
                const m = new data_1.MastFile(file, data);
                this.missionMastModules.push(m);
            }
        });
        //debug(this.missionDefaultCompletions);
        //debug(this.missionClasses);
    }
    getRouteLabels() {
        let ci = [];
        for (const r of this.routeLabels) {
            ci.push(r.completionItem);
        }
        return ci;
    }
    getMediaLabels() {
        let ci = [];
        for (const r of this.mediaLabels) {
            ci.push(r.completionItem);
        }
        return ci;
    }
    getResourceLabels() {
        let ci = [];
        for (const r of this.resourceLabels) {
            ci.push(r.completionItem);
        }
        return ci;
    }
    /**
     * @param fileUri The uri of the file.
     * @returns List of {@link LabelInfo LabelInfo} applicable to the current scope
     */
    getLabels(textDocument) {
        let fileUri = textDocument.uri;
        if (fileUri.startsWith("file")) {
            fileUri = vscode_uri_1.URI.parse(fileUri).fsPath;
        }
        let li = [];
        //debug(this.mastFileInfo);
        for (const f of this.mastFileInfo) {
            if (f.uri === fileUri) {
                li = li.concat(f.labelNames);
            }
            // Check if the mast files are in scope
            // TODO: Check init.mast for if any files should not be included
            //debug(fileUri);
            if (f.parentFolder === (0, fileFunctions_1.getParentFolder)(fileUri)) {
                //debug("adding labels for: ");
                //debug(f);
                li = li.concat(f.labelNames);
            }
        }
        // Remove duplicates (should just be a bunch of END entries)
        const arrUniq = [...new Map(li.map(v => [v.name, v])).values()];
        return arrUniq;
    }
    /**
     * Call when the contents of a file changes
     * @param textDocument
     */
    updateLabels(textDocument) {
        let fileUri = textDocument.uri;
        if (fileUri.startsWith("file")) {
            fileUri = vscode_uri_1.URI.parse(fileUri).fsPath;
        }
        for (const file of this.mastFileInfo) {
            if (file.uri === fileUri) {
                file.labelNames = (0, labels_1.getLabelsInFile)(textDocument.getText(), textDocument.uri);
            }
        }
    }
    /**
     * @param _class String name of the class that we're dealing with. Optional. Default value is an empty string, and the default functions will be returned.
     * @returns List of {@link CompletionItem CompletionItem} related to the class, or the default function completions
     */
    getCompletions(_class = "") {
        //debug(this.missionDefaultCompletions.length);
        let ci = [];
        // Don't need to do this, but will be slightly faster than iterating over missionClasses and then returning the defaults
        if (_class === "") {
            //debug(ci.length);
            ci = ci.concat(this.missionDefaultCompletions);
            // for (const c of this.missionClasses) {
            // 	ci.push(c.completionItem);
            // }
            // TODO: Add variables in scope
            return ci;
        }
        (0, console_1.debug)(this.missionDefaultCompletions.length);
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
            (0, server_1.storyJsonNotif)("Error", this.uri, "", "");
            (0, console_1.debug)(e);
        }
    }
    /** Only call this from readFile() */
    parseFile(text) {
        const story = JSON.parse(text);
        //debug(story);
        if (story.sbslib)
            this.sbslib = story.sbslib;
        if (story.mastlib)
            this.mastlib = story.mastlib;
        this.complete = true;
        (0, console_1.debug)("Sending notification to client");
        (0, server_1.storyJsonNotif)("Error", this.uri, "", "");
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
    let text = "";
    try {
        const data = await fetch(gh);
        text = await data.text();
        return new data_1.PyFile(gh, text);
    }
    catch (e) {
        (0, console_1.debug)("Can't find sbs.py on github");
        try {
            gh = path.join(__dirname, "sbs.py");
            text = await (0, fileFunctions_1.readFile)(gh);
            return new data_1.PyFile(gh, text);
        }
        catch (ex) {
            (0, console_1.debug)("Can't find sbs.py locally either.");
        }
    }
    return null;
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
    //debug("Trying to get cache with name: " + name);
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