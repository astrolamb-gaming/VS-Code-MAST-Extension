"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoryJson = exports.MissionCache = void 0;
exports.loadCache = loadCache;
exports.getSourceFiles = getSourceFiles;
exports.getCache = getCache;
const fs = require("fs");
const path = require("path");
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
const globals_1 = require("./globals");
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
        this.ingoreInitFileMissing = false;
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
        this.load();
    }
    load() {
        // (re)set all the arrays before (re)populating them.
        this.missionClasses = [];
        this.missionDefaultCompletions = [];
        this.missionDefaultFunctions = [];
        this.missionDefaultSignatures = [];
        this.missionMastModules = [];
        this.missionPyModules = [];
        this.pyFileInfo = [];
        this.resourceLabels = [];
        this.mediaLabels = [];
        this.mastFileInfo = [];
        this.storyJson = new StoryJson(path.join(this.missionURI, "story.json"));
        this.storyJson.readFile().then(() => { this.modulesLoaded(); });
        loadSbs().then((p) => {
            (0, console_1.debug)("Loaded SBS, starting to parse.");
            if (p !== null) {
                this.missionPyModules.push(p);
                this.missionClasses = this.missionClasses.concat(p.classes);
                this.missionDefaultCompletions = this.missionDefaultCompletions.concat(p.defaultFunctionCompletionItems);
                for (const s of p.defaultFunctions) {
                    this.missionDefaultSignatures.push(s.signatureInformation);
                }
            }
        });
        let files = (0, fileFunctions_1.getFilesInDir)(this.missionURI);
        //debug(files);
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
        //this.checkForInitFolder(this.missionURI);
    }
    async checkForInitFolder(folder) {
        // if (this.ingoreInitFileMissing) return;
        if ((0, fileFunctions_1.getInitFileInFolder)(folder) === undefined) {
            (0, console_1.debug)("No __init__.mast file for this folder.");
            (0, console_1.debug)(folder);
            let ret = await server_1.connection.window.showErrorMessage("No '__init__.mast' file found in this folder.", { title: "Create With Files" }, { title: "Create Empty" }, { title: "Ignore" });
            if (ret === undefined)
                return true;
            if (ret.title === "Create With Files") {
                // Create a new __init__.mast file
                // Then add all files in folder
                this.createInitFile(folder, true);
            }
            else if (ret.title === "Create Empty") {
                // Create a new __init__.mast file
                this.createInitFile(folder, false);
            }
            else if (ret.title === "Ignore") {
                return true;
            }
        }
        return false;
    }
    async createInitFile(folder, withFiles) {
        try {
            let contents = "";
            if (withFiles) {
                let files = (0, fileFunctions_1.getFilesInDir)(folder, false);
                for (const f of files) {
                    if (f.endsWith("__init__.mast"))
                        continue;
                    if (!f.endsWith(".mast") && !f.endsWith(".py"))
                        continue;
                    const baseDir = path.basename(f);
                    contents = contents + "import " + baseDir + "\n";
                }
            }
            fs.writeFile(path.join(folder, "__init__.mast"), contents, () => {
                // Reload cache?
                console.log('File created successfully!');
            });
        }
        catch (err) {
            console.error('Error writing file:', err);
        }
    }
    // TODO: When a file is opened, check if it is in __init__.mast. If not, prompt the user to add it.
    async addToInitFile(folder, newFile) {
        try {
            fs.writeFile(path.join(folder, "__init__.mast"), "\n" + newFile, { flag: "a+" }, () => { });
        }
        catch (e) {
            (0, console_1.debug)(e);
        }
    }
    async modulesLoaded() {
        const uri = this.missionURI;
        (0, console_1.debug)(uri);
        if (uri.includes("sbs_utils")) {
            (0, console_1.debug)("sbs nope");
        }
        try {
            const libErrs = [];
            //debug(this.missionLibFolder);
            const lib = this.storyJson.mastlib.concat(this.storyJson.sbslib);
            let complete = 0;
            for (const zip of lib) {
                const zipPath = path.join(this.missionLibFolder, zip);
                (0, fileFunctions_1.readZipArchive)(zipPath).then((data) => {
                    //debug("Zip archive read for " + zipPath);
                    this.handleZipData(data, zip);
                    complete += 1;
                }).catch(err => {
                    (0, console_1.debug)("Error unzipping. \n" + err);
                    if (("" + err).includes("Invalid filename")) {
                        libErrs.push("File does not exist:\n" + zipPath);
                    }
                    complete += 1;
                });
            }
            // while (complete < lib.length) {
            // 	await sleep(50);
            // }
            // if (libErrs.length > 0) {
            // 	storyJsonNotif(0,this.storyJson.uri,"",libErrs.join("\n"));
            // }
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
                //debug("Checking: " + file)
                this.routeLabels = this.routeLabels.concat((0, routeLabels_1.loadRouteLabels)(data));
                // this.mediaLabels = this.mediaLabels.concat(loadMediaLabels(data));
                // this.resourceLabels = this.resourceLabels.concat(loadResourceLabels(data));
                const p = new data_1.PyFile(file, data);
                this.missionPyModules.push(p);
                if (file.includes("sbs_utils") && !file.includes("procedural")) {
                    // Don't wanat anything not procedural included???
                    if (file.includes("scatter") || file.includes("faces") || file.includes("names")) {
                        //don't return
                    }
                    else {
                        return;
                    }
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
    updateFileInfo(doc) {
        if (doc.languageId === "mast") {
            for (const f of this.mastFileInfo) {
                if ((0, fileFunctions_1.fixFileName)(f.uri) === (0, fileFunctions_1.fixFileName)(doc.uri)) {
                    f.parse(doc.getText());
                }
            }
        }
    }
    getRouteLabels() {
        let ci = [];
        for (const r of this.routeLabels) {
            ci.push(r.completionItem);
        }
        (0, console_1.debug)(ci);
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
     * TODO: This should only return variables that are in scope
     * @returns
     */
    getVariables(file) {
        const parent = (0, fileFunctions_1.getParentFolder)(vscode_uri_1.URI.parse(file).fsPath);
        const inits = (0, fileFunctions_1.getInitContents)(file);
        let ci = [];
        for (const m of this.mastFileInfo) {
            if (m.parentFolder === parent) {
                // Check if the file is included in the init file
                for (const i of inits) {
                    if (i === path.basename(m.uri)) {
                        ci = ci.concat(m.getVariableNames());
                    }
                }
            }
        }
        //const arrUniq = [...new Map(ci.map(v => [v.label, v])).values()]
        return ci;
    }
    /**
     * @param fileUri The uri of the file.
     * @returns List of {@link LabelInfo LabelInfo} applicable to the current scope
     */
    getLabels(textDocument) {
        let fileUri = (0, fileFunctions_1.fixFileName)(textDocument.uri);
        let li = [];
        //debug(this.mastFileInfo);
        for (const f of this.mastFileInfo) {
            if (f.uri === fileUri) {
                li = li.concat(f.labelNames);
            }
            else {
                // Check if the mast files are in scope
                // TODO: Check init.mast for if any files should not be included
                //debug(fileUri);
                if (f.parentFolder === (0, fileFunctions_1.getParentFolder)(fileUri)) {
                    //debug("adding labels for: ");
                    //debug(f);
                    li = li.concat(f.labelNames);
                }
            }
        }
        //debug(li);
        // Remove duplicates (should just be a bunch of END entries)
        // Could also include labels that exist in another file
        const arrUniq = [...new Map(li.map(v => [v.name, v])).values()];
        return li;
    }
    /**
     * Call when the contents of a file changes
     * Depracated. Call updateFileInfo() instead
     * @param textDocument
     */
    updateLabels(textDocument) {
        let fileUri = (0, fileFunctions_1.fixFileName)(textDocument.uri);
        for (const file of this.mastFileInfo) {
            if (file.uri === fileUri) {
                file.labelNames = (0, labels_1.parseLabelsInFile)(textDocument.getText(), textDocument.uri);
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
            for (const c of this.missionClasses) {
                ci.push(c.completionItem);
            }
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
    /**
     * Gets a single method signature for the specified function.
     * @param name Name of the method or function
     * @returns Associated {@link SignatureInformation}
     */
    getSignatureOfMethod(name) {
        for (const s of this.missionDefaultSignatures) {
            if (s.label === name) {
                return s;
            }
        }
        for (const c of this.missionClasses) {
            for (const m of c.methodSignatureInformation) {
                if (m.label === name) {
                    return m;
                }
            }
        }
        return undefined;
    }
    /**
     *
     * @param folder The folder the current file is in.
     * @returns
     */
    getRoles(folder) {
        folder = (0, fileFunctions_1.fixFileName)(folder);
        let roles = [];
        const ini = (0, fileFunctions_1.getInitContents)(folder);
        (0, console_1.debug)(ini);
        for (const m of this.mastFileInfo) {
            (0, console_1.debug)(folder);
            if (ini.includes(path.basename(m.uri))) {
                roles = roles.concat(m.roles);
            }
        }
        return roles;
    }
}
exports.MissionCache = MissionCache;
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
        const err = "story.json contains references to files that do not exist";
        const warn = "Newer versions are available for story.json references";
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
function getCache(name, reloadCache = false) {
    let ret = undefined;
    if (name.startsWith("file")) {
        name = vscode_uri_1.URI.parse(name).fsPath;
    }
    //debug("Trying to get cache with name: " + name);
    const mf = (0, fileFunctions_1.getMissionFolder)(name);
    //debug(mf);
    for (const cache of caches) {
        if (cache.missionName === name || cache.missionURI === mf) {
            if (reloadCache)
                cache.load();
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