"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissionCache = void 0;
exports.loadCache = loadCache;
exports.getSourceFiles = getSourceFiles;
exports.getCache = getCache;
const fs = require("fs");
const path = require("path");
const data_1 = require("./data");
const labels_1 = require("./tokens/labels");
const console_1 = require("console");
const rx_1 = require("./rx");
const routeLabels_1 = require("./tokens/routeLabels");
const fileFunctions_1 = require("./fileFunctions");
const server_1 = require("./server");
const vscode_uri_1 = require("vscode-uri");
const globals_1 = require("./globals");
const os = require("os");
const audioFiles_1 = require("./resources/audioFiles");
const storyJson_1 = require("./data/storyJson");
const includeNonProcedurals = [
    "scatter",
    "faces",
    "names",
    "vec.py",
    "spaceobject.py",
    "agent"
];
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
        // missionDefaultCompletions: CompletionItem[] = [];
        // missionDefaultSignatures: SignatureInformation[] = [];
        this.missionClasses = [];
        this.missionDefaultFunctions = [];
        // These are for the files specific to this mission.
        this.pyFileCache = [];
        this.mastFileCache = [];
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
        this.storyJson = new storyJson_1.StoryJson(path.join(this.missionURI, "story.json"));
        this.load();
    }
    load() {
        (0, console_1.debug)("Starting MissionCache.load()");
        (0, server_1.showProgressBar)(true);
        // (re)set all the arrays before (re)populating them.
        this.missionClasses = [];
        // this.missionDefaultCompletions = [];
        this.missionDefaultFunctions = [];
        // this.missionDefaultSignatures = [];
        this.missionMastModules = [];
        this.missionPyModules = [];
        this.pyFileCache = [];
        this.resourceLabels = [];
        this.mediaLabels = [];
        this.mastFileCache = [];
        this.storyJson = new storyJson_1.StoryJson(path.join(this.missionURI, "story.json"));
        this.storyJson.readFile()
            .then(() => {
            (0, server_1.showProgressBar)(true);
            this.modulesLoaded().then(() => {
                (0, console_1.debug)("Modules loaded for " + this.missionName);
                (0, server_1.showProgressBar)(false);
            });
        });
        // .finally(()=>{debug("Finished loading modules")});
        loadSbs().then((p) => {
            (0, server_1.showProgressBar)(true);
            if (p !== null) {
                this.missionPyModules.push(p);
                (0, console_1.debug)("addding " + p.uri);
                this.missionClasses = this.missionClasses.concat(p.classes);
                // this.missionDefaultCompletions = this.missionDefaultCompletions.concat(p.getDefaultMethodCompletionItems());
                // TODO: This is not doing anything anymore pretty sure
                // for (const s of p.defaultFunctions) {
                // 	this.missionDefaultSignatures.push(s.signatureInformation);
                // }
            }
            (0, console_1.debug)("Finished loading sbs_utils for " + this.missionName);
            (0, server_1.showProgressBar)(false);
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
                    this.mastFileCache.push(m);
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
                    this.pyFileCache.push(p);
                }
            }
        }
        //this.checkForInitFolder(this.missionURI);
        (0, console_1.debug)("Number of py files: " + this.pyFileCache.length);
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
            (0, console_1.debug)("Beginning to load modules");
            const total = lib.length;
            for (const zip of lib) {
                let found = false;
                for (const m of (0, globals_1.getGlobals)().getAllMissions()) {
                    if (this.storyJson.getModuleBaseName(zip).toLowerCase().includes(m.toLowerCase())) {
                        found = true;
                        // Here we refer to the mission instead of the zip
                        const missionFolder = path.join((0, globals_1.getGlobals)().artemisDir, "data", "missions", m);
                        const files = (0, fileFunctions_1.getFilesInDir)(missionFolder, true);
                        for (const f of files) {
                            const data = (0, fileFunctions_1.readFile)(f).then((data) => {
                                this.handleZipData(data, f);
                                complete += 1;
                                // progressUpdate(complete/total*100);
                            });
                        }
                    }
                }
                if (!found) {
                    // Here we load the module from the zip
                    const zipPath = path.join(this.missionLibFolder, zip);
                    (0, fileFunctions_1.readZipArchive)(zipPath).then((data) => {
                        (0, console_1.debug)("Loading " + zip);
                        data.forEach((data, file) => {
                            (0, console_1.debug)(file);
                            if (zip !== "") {
                                file = path.join(zip, file);
                            }
                            file = saveZipTempFile(file, data);
                            this.handleZipData(data, file);
                            complete += 1;
                            // progressUpdate(complete/total*100);
                        });
                    }).catch(err => {
                        (0, console_1.debug)("Error unzipping. \n  " + err);
                        if (("" + err).includes("Invalid filename")) {
                            libErrs.push("File does not exist:\n" + zipPath);
                        }
                    });
                }
            }
        }
        catch (e) {
            (0, console_1.debug)("Error in modulesLoaded()");
            (0, console_1.debug)(e);
        }
    }
    /**
     * Takes file name and contents and handles them. Checks if it's a .py or .mast file, creates the relevant object, ignores everything else.
     * Also ignores __init__ files of both the mast and py varieties
     * @param data Contents of a file, as a {@link string string}
     * @param file name of a file, as a {@link string string}
     * @returns
     */
    handleZipData(data, file = "") {
        if (file.endsWith("__init__.mast") || file.endsWith("__init__.py") || file.includes("mock")) {
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
                for (const special of includeNonProcedurals) {
                    if (file.includes(special)) {
                        //don't return
                        (0, console_1.debug)("Adding " + special);
                        break;
                    }
                    else {
                    }
                }
            }
            this.missionClasses = this.missionClasses.concat(p.classes);
            // this.missionDefaultCompletions = this.missionDefaultCompletions.concat(p.getDefaultMethodCompletionItems());
            this.missionDefaultFunctions = this.missionDefaultFunctions.concat(p.defaultFunctions);
            // for (const s of p.defaultFunctions) {
            // 	this.missionDefaultSignatures.push(s.signatureInformation);
            // }
        }
        else if (file.endsWith(".mast")) {
            //debug("Building file: " + file);
            const m = new data_1.MastFile(file, data);
            this.missionMastModules.push(m);
        }
    }
    updateFileInfo(doc) {
        if (doc.languageId === "mast") {
            (0, console_1.debug)("Updating mast file");
            this.getMastFile(doc.uri).parse(doc.getText());
        }
        else if (doc.languageId === "py") {
            // this.getPyFile(doc.getText())
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
    getMusicFiles() {
        return (0, audioFiles_1.getMusicFiles)(this.missionLibFolder);
    }
    /**
     * Get all methods in scope for this cache
     * @returns List of {@link Function Function}
     */
    getMethods() {
        let methods = [];
        for (const py of this.pyFileCache) {
            methods = methods.concat(py.defaultFunctions);
        }
        return methods;
    }
    /**
     * Get the method with the given name, if it exists in scope for this cache.
     * @param name Name of the {@link Function Function}
     * @returns The function with the given name.
     */
    getMethod(name) {
        for (const m of this.getMethods()) {
            if (m.name === name) {
                return m;
            }
        }
        return undefined;
    }
    /**
     * TODO: This should only return variables that are in scope
     * @returns
     */
    getVariableCompletionItems(doc) {
        // const parent = getParentFolder(URI.parse(file).fsPath);
        // const inits = getInitContents(fixFileName(doc?.uri));
        let ci = [];
        for (const m of this.mastFileCache) {
            // if (m.parentFolder === parent) {
            // 	// Check if the file is included in the init file
            // 	for (const i of inits) {
            // 		if (i === path.basename(m.uri)) {
            ci = ci.concat(m.getVariableNames());
            // 		}
            // 	}
            // }
            // for (const v of m.variables) {
            // }
        }
        //const arrUniq = [...new Map(ci.map(v => [v.label, v])).values()]
        return ci;
    }
    getVariables(doc) {
        let vars = [];
        for (const m of this.mastFileCache) {
            if (doc) {
                if ((0, fileFunctions_1.fixFileName)(m.uri) === (0, fileFunctions_1.fixFileName)(doc.uri)) {
                    vars = vars.concat(m.variables);
                }
            }
            else {
                vars = vars.concat(m.variables);
            }
        }
        return vars;
    }
    /**
     * @param fileUri The uri of the file.
     * @returns List of {@link LabelInfo LabelInfo} applicable to the current scope (including modules)
     */
    getLabels(textDocument) {
        let fileUri = (0, fileFunctions_1.fixFileName)(textDocument.uri);
        let li = [];
        //debug(this.mastFileInfo);
        for (const f of this.mastFileCache) {
            li = li.concat(f.labelNames);
        }
        // This gets stuff from LegendaryMissions, if the current file isn't LegendaryMissions itself.
        for (const f of this.missionMastModules) {
            li = li.concat(f.labelNames);
        }
        //debug(li);
        // Remove duplicates (should just be a bunch of END entries)
        // Could also include labels that exist in another file
        const arrUniq = [...new Map(li.map(v => [v.name, v])).values()];
        return li;
    }
    /**
     * Get all labels, including sublabels, that are within the current scope at the specified position within the document.
     * @param doc
     * @param pos
     */
    getLabelsAtPos(doc, pos) {
        // const labels: LabelInfo[] = this.getLabels(doc);
        if (doc.languageId !== "mast")
            return [];
        const labels = this.getMastFile(doc.uri).labelNames;
        const main = (0, labels_1.getMainLabelAtPos)(pos, labels);
        const subs = main.subLabels;
        const ret = this.getLabels(doc).concat(subs);
        return ret;
    }
    /**
     * Call when the contents of a file changes
     * Depracated. Call updateFileInfo() instead
     * @param textDocument
     */
    updateLabels(textDocument) {
        let fileUri = (0, fileFunctions_1.fixFileName)(textDocument.uri);
        for (const file of this.mastFileCache) {
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
            // ci = ci.concat(this.missionDefaultCompletions);
            for (const f of this.missionDefaultFunctions) {
                ci.push(f.buildCompletionItem());
            }
            for (const c of this.missionClasses) {
                ci.push(c.completionItem);
            }
            for (const p of this.pyFileCache) {
                for (const f of p.defaultFunctions) {
                    ci.push(f.completionItem);
                }
            }
            return ci;
        }
        // I don't think this is ever used.
        for (const c of this.missionClasses) {
            if (c.name === _class) {
                (0, console_1.debug)(c.name + " is the class we're looking for.");
                (0, console_1.debug)(c.getMethodCompletionItems());
                return c.getMethodCompletionItems();
            }
        }
        return []; //this.missionDefaultCompletions;
    }
    /**
     * Gets a single method signature for the specified function.
     * @param name Name of the method or function
     * @returns Associated {@link SignatureInformation}
     */
    getSignatureOfMethod(name) {
        for (const f of this.missionDefaultFunctions) {
            if (f.name === name) {
                return f.buildSignatureInformation();
            }
        }
        for (const c of this.missionClasses) {
            for (const m of c.methods) {
                if (m.name === name) {
                    return m.buildSignatureInformation();
                }
            }
        }
        for (const m of this.pyFileCache) {
            for (const f of m.defaultFunctions) {
                if (f.name === name) {
                    return f.buildSignatureInformation();
                }
            }
            for (const c of m.classes) {
                for (const f of c.methods) {
                    if (f.name === name) {
                        return f.buildSignatureInformation();
                    }
                }
            }
        }
        (0, console_1.debug)("The right signatures the right way failed...");
        return undefined;
    }
    /**
     *
     * @param folder The folder the current file is in.
     * @returns an array of strings
     */
    getRoles(folder) {
        folder = (0, fileFunctions_1.fixFileName)(folder);
        let roles = [];
        const ini = (0, fileFunctions_1.getInitContents)(folder);
        (0, console_1.debug)(ini);
        for (const m of this.mastFileCache) {
            (0, console_1.debug)(folder);
            if (ini.includes(path.basename(m.uri))) {
                roles = roles.concat(m.roles);
            }
        }
        return roles;
    }
    /**
     * Gets the {@link MastFile MastFile} associated with the given uri, or makes one if it doesn't exist
     * Must actually be a mast file, so check before using!
     * @param uri The uri of the file
     */
    getMastFile(uri) {
        uri = (0, fileFunctions_1.fixFileName)(uri);
        for (const m of this.mastFileCache) {
            if (m.uri === (0, fileFunctions_1.fixFileName)(uri)) {
                return m;
            }
        }
        const m = new data_1.MastFile(uri);
        return m;
    }
    /**
     * Must actually be a python file, so check before using!
     * @param uri The uri of the file
     */
    getPyFile(uri) {
        uri = (0, fileFunctions_1.fixFileName)(uri);
        for (const p of this.pyFileCache) {
            if (p.uri === (0, fileFunctions_1.fixFileName)(uri)) {
                return p;
            }
        }
        const p = new data_1.PyFile(uri);
        return p;
    }
}
exports.MissionCache = MissionCache;
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
        // prepCompletions(sourceFiles);
        // prepSignatures(sourceFiles);
    }
    catch (err) {
        (0, console_1.debug)("\nFailed to load\n" + err);
    }
}
async function loadSbs() {
    let gh = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/typings/sbs/__init__.pyi";
    let text = "";
    try {
        const data = await fetch(gh);
        text = await data.text();
        gh = saveZipTempFile("sbs.py", text);
        const p = new data_1.PyFile(gh, text);
        return p;
    }
    catch (e) {
        (0, console_1.debug)("Can't find sbs.py on github");
        try {
            gh = path.join(__dirname, "sbs.py");
            text = await (0, fileFunctions_1.readFile)(gh);
            const p = new data_1.PyFile(gh, text);
            (0, console_1.debug)("SBS py file generated");
            // debug(p.defaultFunctions);
            return p;
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
function saveZipTempFile(uri, contents) {
    const tempPath = (0, fileFunctions_1.fixFileName)(path.join(os.tmpdir(), "cosmosModules", uri));
    if (!fs.existsSync(path.dirname(tempPath))) {
        (0, console_1.debug)("Making dir: " + path.dirname(tempPath));
        fs.mkdirSync(path.dirname(tempPath), { recursive: true });
    }
    (0, console_1.debug)(tempPath);
    fs.writeFileSync(tempPath, contents);
    return tempPath;
}
//# sourceMappingURL=cache.js.map