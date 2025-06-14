"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissionCache = exports.testingPython = void 0;
exports.getSourceFiles = getSourceFiles;
exports.getCache = getCache;
const fs = require("fs");
const path = require("path");
const MastFile_1 = require("./files/MastFile");
const PyFile_1 = require("./files/PyFile");
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
const function_1 = require("./data/function");
const class_1 = require("./data/class");
const storyJson_1 = require("./data/storyJson");
const python_1 = require("./python/python");
const styles_1 = require("./data/styles");
exports.testingPython = false;
const includeNonProcedurals = [
    "scatter",
    "faces",
    "names",
    "vec.py",
    "spaceobject.py",
    "agent"
];
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
        this.missionClasses = [];
        // missionDefaultFunctions: Function[] = [];
        // These are for the files specific to this mission.
        /**
         * A list of all {@link PyFile PyFile}s included in modules applicable to the current misison.
         */
        this.pyFileCache = [];
        /**
         * A list of all {@link MastFile MastFile}s included in modules applicable to the current mission.
         */
        this.mastFileCache = [];
        /**
         * A two-dimensional array of all the globally-scoped files for the current mission.
         * The first index of each array is the file name (e.g. sbs_utils.names)
         * The second index is the prepend name - the name that is prepended to all functions in the file.
         */
        this.sbsGlobals = [];
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
        this.styleDefinitions = [];
        this.resourceLabels = (0, routeLabels_1.loadResourceLabels)();
        this.mediaLabels = this.mediaLabels.concat((0, routeLabels_1.loadMediaLabels)());
        this.missionURI = (0, fileFunctions_1.getMissionFolder)(workspaceUri);
        (0, console_1.debug)(this.missionURI);
        let parent = (0, fileFunctions_1.getParentFolder)(this.missionURI);
        this.missionLibFolder = path.join(parent, "__lib__");
        this.missionName = path.basename(this.missionURI);
        this.storyJson = new storyJson_1.StoryJson(path.join(this.missionURI, "story.json"));
        this.load().then(async () => {
            await (0, python_1.sleep)(100);
            (0, server_1.showProgressBar)(false);
            (0, console_1.debug)("Starting python");
            (0, python_1.initializePython)(path.join(this.missionURI, "story.json"));
        });
    }
    async load() {
        (0, console_1.debug)("Starting MissionCache.load()");
        (0, server_1.showProgressBar)(true);
        // (re)set all the arrays before (re)populating them.
        this.missionClasses = [];
        // this.missionDefaultFunctions = [];
        this.missionMastModules = [];
        this.missionPyModules = [];
        this.pyFileCache = [];
        this.resourceLabels = [];
        this.mediaLabels = [];
        this.mastFileCache = [];
        this.storyJson = new storyJson_1.StoryJson(path.join(this.missionURI, "story.json"));
        let storyJsonDone = false;
        this.storyJson.readFile()
            .then(() => {
            (0, server_1.showProgressBar)(true);
            this.modulesLoaded().then(() => {
                (0, console_1.debug)("Modules loaded for " + this.missionName);
                // showProgressBar(false);
                storyJsonDone = true;
                // Now we do the python checks for the MastGlobals that don't exist already
                for (const p of this.pyFileCache) {
                    if (p.globals.length > 0) {
                        this.loadPythonGlobals(p.globals).then((info) => {
                            (0, console_1.debug)("Loaded globals");
                        });
                    }
                }
            });
        });
        let sbsLoaded = false;
        loadSbs().then((p) => {
            (0, server_1.showProgressBar)(true);
            if (p !== null) {
                this.addMissionPyFile(p);
                // this.missionPyModules.push(p);
                // debug("addding " + p.uri);
                // this.missionClasses = this.missionClasses.concat(p.classes);
            }
            (0, console_1.debug)("Finished loading sbs_utils for " + this.missionName);
            (0, server_1.showProgressBar)(false);
            sbsLoaded = true;
        });
        this.checkForCacheUpdates();
        (0, console_1.debug)(this.missionURI);
        fs.watch(this.missionURI, { "recursive": true }, (eventType, filename) => {
            // debug("fs.watch() EVENT: ")
            // debug(eventType);
            // could be either 'rename' or 'change'. new file event and delete
            // also generally emit 'rename'
            // debug(filename);
            if (eventType === "rename") {
                if (filename?.endsWith(".py")) {
                    this.removePyFile(path.join(this.missionURI, filename));
                }
                if (filename?.endsWith(".mast")) {
                    this.removeMastFile(path.join(this.missionURI, filename));
                }
            }
        });
        //this.checkForInitFolder(this.missionURI);
        (0, console_1.debug)("Number of py files: " + this.pyFileCache.length);
        while (!sbsLoaded || !storyJsonDone) {
            await (0, python_1.sleep)(100);
        }
        (0, console_1.debug)("Everything is laoded");
    }
    async loadPythonGlobals(globals) {
        (0, server_1.showProgressBar)(true);
        let sigParser = /'(.*?)'/g;
        let globalInfo = [];
        let globalNames = [];
        for (const g of globals) {
            // mission_dir and data_dir references we aleady know, and might return bad values if left to python outside of an actual artemis dir
            if (g[0] === "mission_dir") {
                globalInfo.push([g[0], this.missionURI]);
                continue;
            }
            if (g[0] === "data_dir") {
                globalInfo.push([g[0], path.join((0, globals_1.getGlobals)().artemisDir, "data")]);
                continue;
            }
            // Add all other names to the list to check globals in python
            globalNames.push(g);
        }
        let info = await (0, python_1.getSpecificGlobals)(this, globalNames);
        // debug(info);
        let classes = [];
        for (const g of info) {
            let mod = g["module"];
            let doc = g["documentation"];
            let kind = g["kind"];
            let name = g["mastName"];
            if (kind === "module") {
                const _c = new class_1.ClassObject("", "");
                _c.name = name;
                _c.sourceFile = "built-in";
                _c.documentation = doc;
                classes.push(_c);
            }
            else {
                // try to find the module/class the function is from
                // Shouldn't be any that aren't from a class/module, since we use the mock file.
                for (const _c of classes) {
                    if (_c.name === mod) {
                        let val = g["value"];
                        let sigs = g["argspec"];
                        // Add the function to the class
                        const f = new function_1.Function("", "", "");
                        f.name = name;
                        f.className = mod;
                        if (val !== undefined) {
                            f.functionType = "constant";
                            f.returnType = "float";
                        }
                        else {
                            f.functionType = "function";
                            f.returnType = "";
                        }
                        f.rawParams = "";
                        f.sourceFile = "builtin";
                        f.documentation = doc;
                        // Add signature information
                        let m;
                        if (sigs !== undefined) {
                            let params = [];
                            while (m = sigParser.exec(sigs)) {
                                params.push(m[1]);
                                if (m[1] !== "self") {
                                    const p = new function_1.Parameter(m[1], f.parameters.length, "");
                                    f.parameters.push(p);
                                }
                            }
                            f.rawParams = params.join(', ');
                        }
                        // If there's no sig info, such as for math.hypot, we can do this to parse the documentation
                        if (f.parameters.length === 0 && doc !== undefined) {
                            let paramCheck = /\((.*?)\)/g;
                            let params = [];
                            while (m = paramCheck.exec(doc)) {
                                if (doc.includes(name + m[0])) {
                                    f.rawParams = m[1];
                                    params = m[1].split(",");
                                    break;
                                }
                            }
                            for (const p of params) {
                                if (p !== "self") {
                                    const param = new function_1.Parameter(p, f.parameters.length, "");
                                    f.parameters.push(param);
                                }
                            }
                            f.rawParams = params.join(', ');
                        }
                        _c.methods.push(f);
                    }
                }
            }
        }
        const builtIns = new PyFile_1.PyFile("builtin.py", "");
        builtIns.classes = classes;
        builtIns.isGlobal = true;
        // Now we add the mock pyfile:
        const scriptPath = __dirname.replace("out", "src");
        let contents = await (0, fileFunctions_1.readFile)(path.join(scriptPath, "files", "globals.py"));
        // debug(contents)
        const builtInFunctions = new PyFile_1.PyFile("builtin_functions.py", contents);
        builtInFunctions.isGlobal = true;
        // for (const m of builtInFunctions.defaultFunctions) {
        // 	m.sourceFile = "builtin";
        // }
        // debug(builtInFunctions);
        this.addSbsPyFile(builtIns);
        this.addSbsPyFile(builtInFunctions);
        // this.pyFileCache.push(builtIns);
        // this.pyFileCache.push(builtInFunctions);
        (0, console_1.debug)("buitins added");
        (0, server_1.showProgressBar)(false);
    }
    async checkForInitFolder(folder) {
        // if (this.ingoreInitFileMissing) return;
        if (folder.endsWith(this.missionName))
            return false;
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
        if (exports.testingPython)
            return;
        const uri = this.missionURI;
        const globals = (0, globals_1.getGlobals)();
        (0, console_1.debug)(uri);
        if (uri.includes("sbs_utils")) {
            (0, console_1.debug)("sbs nope");
        }
        try {
            const libErrs = [];
            //debug(this.missionLibFolder);
            const lib = this.storyJson.mastlib.concat(this.storyJson.sbslib);
            (0, console_1.debug)("Beginning to load modules");
            const total = lib.length;
            for (const zip of lib) {
                (0, server_1.showProgressBar)(true);
                let found = false;
                let missions = globals.getAllMissions();
                for (const m of missions) {
                    if (this.storyJson.getModuleBaseName(zip).toLowerCase().includes(m.toLowerCase())) {
                        found = true;
                        // Here we refer to the mission instead of the zip
                        const missionFolder = path.join((0, globals_1.getGlobals)().artemisDir, "data", "missions", m);
                        const files = (0, fileFunctions_1.getFilesInDir)(missionFolder, true);
                        for (const f of files) {
                            if (f.endsWith(".py") || f.endsWith(".mast")) {
                                (0, server_1.showProgressBar)(true);
                                const data = (0, fileFunctions_1.readFile)(f).then((data) => {
                                    (0, server_1.showProgressBar)(true);
                                    // debug("Loading: " + path.basename(f));
                                    this.handleZipData(data, f);
                                });
                            }
                        }
                    }
                }
                if (!found) {
                    // Here we load the module from the zip
                    const zipPath = path.join(this.missionLibFolder, zip);
                    (0, fileFunctions_1.readZipArchive)(zipPath).then((data) => {
                        (0, console_1.debug)("Loading " + zip);
                        data.forEach((data, file) => {
                            (0, server_1.showProgressBar)(true);
                            (0, console_1.debug)(file);
                            if (zip !== "") {
                                file = path.join(zip, file);
                            }
                            if (file.endsWith(".py") || file.endsWith(".mast")) {
                                file = saveZipTempFile(file, data);
                                this.handleZipData(data, file);
                            }
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
            // debug(file)
            this.routeLabels = this.routeLabels.concat((0, routeLabels_1.loadRouteLabels)(data));
            this.styleDefinitions = this.styleDefinitions.concat((0, styles_1.loadStyleDefs)(file, data));
            // if (file.includes("sbs_utils\\mast")) return;
            // if (file.includes("sbs_utils") && !file.includes("procedural")) {
            // 	// Don't wanat anything not procedural included???
            // 	let found = false;
            // 	for (const special of includeNonProcedurals) {
            // 		if (file.includes(special)) {
            // 			found = true;
            // 			//don't return
            // 			debug("Adding " + special);
            // 			// const p = new PyFile(file, data);
            // 			// this.missionPyModules.push(p);
            // 			// this.missionClasses = this.missionClasses.concat(p.classes);
            // 			// this.missionDefaultFunctions = this.missionDefaultFunctions.concat(p.defaultFunctions);
            // 			break;
            // 		}
            // 	}
            // 	// TODO: Uncomment this to remove all the extra stuff like Gui that most mission writers probably don't need...
            // 	// if (!found) return;
            // }
            const p = new PyFile_1.PyFile(file, data);
            if (file.includes("sbs_utils")) {
                this.addSbsPyFile(p);
                return;
            }
            this.addMissionPyFile(p);
            // this.missionDefaultFunctions = this.missionDefaultFunctions.concat(p.defaultFunctions);
        }
        else if (file.endsWith(".mast")) {
            //debug("Building file: " + file);
            if (file.includes("sbs_utils"))
                return;
            const m = new MastFile_1.MastFile(file, data);
            this.missionMastModules.push(m);
        }
        // debug("Finished loading: " + path.basename(file))
    }
    /**
     * Triggers an update to the {@link MastFile MastFile} or {@link PyFile PyFile} associated with the specified {@link TextDocument TextDocument}.
     * @param doc The {@link TextDocument TextDocument}
     */
    updateFileInfo(doc) {
        if (doc.languageId === "mast") {
            (0, console_1.debug)("Updating " + doc.uri);
            this.getMastFile(doc.uri).parse(doc.getText());
        }
        else if (doc.languageId === "py") {
            (0, console_1.debug)("Updating " + doc.uri);
            this.getPyFile(doc.uri).parseWholeFile(doc.getText());
        }
    }
    /**
     * Add a py file to the mision cache (stuff in the mission folder, or a module that isn't sbs_utils)
     * @param p A {@link PyFile PyFile} that should be added to {@link MissionCache.missionPyModules MissionCache.missionPyModules}
     */
    addMissionPyFile(p) {
        for (const f of this.missionPyModules) {
            if (f.uri === p.uri) {
                return;
            }
        }
        // Only do this if the file doesn't exist yet
        this.missionPyModules.push(p);
        this.missionClasses = this.missionClasses.concat(p.classes);
    }
    /**
     * Add a py file to the sbs_utils cache (stuff that's in sbs_utils)
     * @param p A {@link PyFile PyFile} that should be added to {@link MissionCache.pyFileCache MissionCache.pyFileCache}
     */
    addSbsPyFile(p) {
        // if (!p.uri.includes("sbs_utils")) {
        // 	//// Don't want non-sbs_utils stuff in the py file cache
        // 	debug("ERROR: Py file added to wrong part of cache: " + p.uri);
        // }
        this.pyFileCache.push(p);
        this.sbsGlobals = this.sbsGlobals.concat(p.globalFiles);
        // debug(this.sbsGlobals)
        for (const f of this.pyFileCache) {
            const file = f.uri.replace(/\//g, ".").replace(/\\/g, ".");
            // debug(file);
            if (f.isGlobal)
                continue; /// This will prevent global logic from happening more than once per file.
            for (const g of this.sbsGlobals) {
                if (g[0] === "sbs") {
                    // if (f.uri.includes("sbs.py"))
                    // Treat sbs differently
                    continue;
                }
                if (file.includes(g[0])) {
                    // debug(g[0]);
                    // debug("Adding " + f.uri + " as a global")
                    f.isGlobal = true;
                    if (g[1] !== "") {
                        // TODO: Update function names with prepend
                        const newDefaults = [];
                        for (const func of f.defaultFunctions) {
                            const n = func.copy();
                            n.name = g[1] + "_" + func.name;
                            newDefaults.push(n);
                        }
                        f.defaultFunctions = newDefaults;
                        // debug(f.defaultFunctions);
                    }
                }
            }
        }
    }
    /**
     * Triggers an update to any files that do or don't exist anymore
     * Files that no longer exist should be removed by the filesystem watcher
     * The only real use for this now is when loading the initial cache info.
     */
    checkForCacheUpdates() {
        // First check for any files that have been deleted
        const files = (0, fileFunctions_1.getFilesInDir)(this.missionURI);
        let found = false;
        for (const m of this.mastFileCache) {
            for (const f of files) {
                if (f === (0, fileFunctions_1.fixFileName)(m.uri))
                    found = true;
                break;
            }
            if (found)
                break;
        }
        if (!found) {
            for (const p of this.pyFileCache) {
                let isP = false;
                for (const f of files) {
                    if (f === (0, fileFunctions_1.fixFileName)(p.uri))
                        found = true;
                    break;
                }
                if (found)
                    break;
            }
        }
        if (found)
            return;
        // Check for any files that should be included, but are not.
        for (const file of files) {
            (0, server_1.showProgressBar)(true);
            //debug(path.extname(file));
            if (path.extname(file) === ".mast") {
                //debug(file);
                if (path.basename(file).includes("__init__")) {
                    //debug("INIT file found");
                }
                else {
                    // Parse MAST File
                    this.getMastFile(file);
                }
            }
            if (path.extname(file) === ".py") {
                //debug(file);
                if (path.basename(file).includes("__init__")) {
                    //debug("INIT file found");
                }
                else {
                    // Parse Python File
                    this.getPyFile(file);
                }
            }
        }
        (0, server_1.showProgressBar)(false);
    }
    /**
     * Gets all route labels in scope for the given cache.
     * @returns A list of {@link CompletionItem CompletionItem}s
     */
    getRouteLabels() {
        let ci = [];
        for (const r of this.routeLabels) {
            ci.push(r.completionItem);
        }
        (0, console_1.debug)(ci);
        return ci;
    }
    /**
     * Gets all media labels in scope for the given cache.
     * @returns A list of {@link CompletionItem CompletionItem}s
     */
    getMediaLabels() {
        let ci = [];
        for (const r of this.mediaLabels) {
            ci.push(r.completionItem);
        }
        return ci;
    }
    /**
     * Gets all resource labels in scope for the given cache.
     * @returns A list of {@link CompletionItem CompletionItem}s
     */
    getResourceLabels() {
        let ci = [];
        for (const r of this.resourceLabels) {
            ci.push(r.completionItem);
        }
        return ci;
    }
    /**
     * Gets all music files in scope for the given cache.
     * @returns A list of {@link CompletionItem CompletionItem}s
     */
    getMusicFiles() {
        return (0, audioFiles_1.getMusicFiles)(this.missionLibFolder);
    }
    /**
     * Get all methods in scope for this cache
     * @returns List of {@link Function Function}
     */
    getMethods() {
        // let count = 0;
        let methods = [];
        // debug(this.pyFileCache)
        // let keys = [...new Map(this.missionPyModules.map(v => [v.uri, v])).values()];
        // debug(keys);
        for (const py of this.pyFileCache) {
            if (py.isGlobal) {
                methods = methods.concat(py.defaultFunctions);
                // count += py.defaultFunctions.length;
                // debug("From: "+ py.uri)
                // debug(py.defaultFunctions)
            }
        }
        for (const py of this.missionPyModules) {
            methods = methods.concat(py.defaultFunctions);
            // count += py.defaultFunctions.length;
            // debug("From: "+ py.uri)
            // debug(py.defaultFunctions)
        }
        // debug(count)
        methods.sort((a, b) => {
            if (a.name < b.name) {
                return -1;
            }
            if (a.name > b.name) {
                return 1;
            }
            return 0;
        });
        // debug(methods)
        return methods;
    }
    /**
     * Get the method with the given name, if it exists in scope for this cache.
     * If it's not a default function, it'll check classes too
     * @param name Name of the {@link Function Function}
     * @returns The function with the given name.
     */
    getMethod(name) {
        for (const m of this.getMethods()) {
            if (m.name === name) {
                return m;
            }
        }
        for (const c of this.getClasses()) {
            for (const m of c.methods) {
                if (m.name === name) {
                    return m;
                }
            }
        }
        return undefined;
    }
    /**
     * Checks over all {@link Function Function}s that are class methods and finds the ones with the given name.
     * @param name The name of the function
     * @returns A list of all {@link Function Function}s with that name
     */
    getPossibleMethods(name) {
        let list = [];
        for (const c of this.missionClasses) {
            for (const m of c.methods) {
                if (m.name === name) {
                    list.push(m);
                }
            }
        }
        return list;
    }
    /**
     *
     * @returns All the classes in scope for this mission cache
     */
    getClasses() {
        let ret = [];
        for (const p of this.pyFileCache) {
            ret = ret.concat(p.classes);
        }
        for (const p of this.missionPyModules) {
            ret = ret.concat(p.classes);
        }
        return ret;
    }
    /**
     * TODO: This should only return variables that are in scope
     * @returns A list of {@link CompletionItem CompletionItem}
     */
    getVariableCompletionItems(doc) {
        // const parent = getParentFolder(URI.parse(file).fsPath);
        // const inits = getInitContents(fixFileName(doc?.uri));
        let ci = [];
        for (const m of this.mastFileCache) {
            ci = ci.concat(m.getVariableNames());
        }
        for (const m of this.missionMastModules) {
            ci = ci.concat(m.getVariableNames());
        }
        //const arrUniq = [...new Map(ci.map(v => [v.label, v])).values()]
        return ci;
    }
    /**
     * Get {@link Variable Variable}s in scope
     * @param doc The {@link TextDocument TextDocument}
     * @returns List of {@link Variable Variable}
     */
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
     * Get all the words in scope
     * @returns a list of {@link Word Word}
     */
    getWordLocations(word) {
        let words = [];
        for (const m of this.mastFileCache) {
            words = words.concat(m.getWordLocations(word));
        }
        for (const m of this.missionMastModules) {
            words = words.concat(m.getWordLocations(word));
        }
        // for (const p of this.pyFileCache) {
        // 	words = words.concat(p.getWordLocations(word));
        // }
        // for (const p of this.missionPyModules) {
        // 	words = words.concat(p.getWordLocations(word));
        // }
        return words;
    }
    /**
     * @param fileUri The uri of the file.
     * @returns List of {@link LabelInfo LabelInfo} applicable to the current scope (including modules)
     */
    getLabels(textDocument, thisFileOnly = false) {
        (0, console_1.debug)(this.mastFileCache);
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
        if (thisFileOnly) {
            li = li.filter((labelInfo) => {
                return labelInfo.srcFile === fileUri;
            });
        }
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
            // for (const f of this.missionDefaultFunctions) {
            // 	ci.push(f.buildCompletionItem());
            // }
            for (const p of this.missionPyModules) {
                for (const f of p.defaultFunctions) {
                    ci.push(f.buildCompletionItem());
                }
            }
            for (const c of this.missionClasses) {
                ci.push(c.buildCompletionItem());
            }
            for (const p of this.pyFileCache) {
                if (p.isGlobal) {
                    for (const f of p.defaultFunctions) {
                        ci.push(f.buildCompletionItem());
                    }
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
        for (const p of this.missionPyModules) {
            for (const f of p.defaultFunctions) {
                // for (const f of this.missionDefaultFunctions) {
                if (f.name === name) {
                    return f.buildSignatureInformation();
                }
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
     * @param folder The folder the current file is in, or just the file uri
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
        // Add default roles
        roles.push("__player__");
        return roles;
    }
    /**
     *
     * @param folder The folder the current file is in, or just the file uri
     * @returns an array of strings representing all the inventory keys in scope
     */
    getKeys(folder) {
        folder = (0, fileFunctions_1.fixFileName)(folder);
        let keys = [];
        const ini = (0, fileFunctions_1.getInitContents)(folder);
        (0, console_1.debug)(ini);
        for (const m of this.mastFileCache) {
            (0, console_1.debug)(folder);
            if (ini.includes(path.basename(m.uri))) {
                keys = keys.concat(m.keys);
            }
        }
        return keys;
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
        const m = new MastFile_1.MastFile(uri);
        this.mastFileCache.push(m);
        return m;
    }
    /**
     * Gets rid of a Mast file from the cache
     * @param uri Uri of the file to remove
     */
    removeMastFile(uri) {
        uri = (0, fileFunctions_1.fixFileName)(uri);
        let newCache = [];
        for (const m of this.mastFileCache) {
            if (m.uri !== uri) {
                newCache.push(m);
            }
        }
        this.mastFileCache = newCache;
    }
    /**
     * Gets rid of a Python file from the cache
     * @param uri Uri of the file to remove
     */
    removePyFile(uri) {
        uri = (0, fileFunctions_1.fixFileName)(uri);
        (0, console_1.debug)("Removing " + uri);
        let newCache = [];
        for (const m of this.missionPyModules) {
            if (m.uri !== uri) {
                newCache.push(m);
            }
        }
        this.missionPyModules = newCache;
    }
    /**
     * Must actually be a python file, so check before using!
     * @param uri The uri of the file
     */
    getPyFile(uri) {
        uri = (0, fileFunctions_1.fixFileName)(uri);
        for (const p of this.missionPyModules) {
            if (p.uri === (0, fileFunctions_1.fixFileName)(uri)) {
                return p;
            }
        }
        /// Should never get to this point unless a new py file was created.
        // debug("New py file: " + uri);
        const p = new PyFile_1.PyFile(uri);
        if (uri.includes("sbs_utils")) {
            this.addSbsPyFile(p);
        }
        else {
            this.addMissionPyFile(p);
        }
        // this.pyFileCache.push(p);
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
            sourceFiles.push(new PyFile_1.PyFile(url));
        }
        // prepCompletions(sourceFiles);
        // prepSignatures(sourceFiles);
    }
    catch (err) {
        (0, console_1.debug)("\nFailed to load\n" + err);
    }
}
async function loadSbs() {
    if (exports.testingPython)
        return null;
    let gh = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/typings/sbs/__init__.pyi";
    // Testing fake bad url
    // gh = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/typings/sbs/__iniit__.pyi";
    let text = "";
    try {
        const data = await fetch(gh);
        text = await data.text();
        // If the url isn't valid or not connected to internet
        if (text === "404: Not Found") {
            (0, console_1.debug)("Using local copy, if it exists");
            text = await loadTempFile("sbs.py");
            gh = path.join(os.tmpdir(), "cosmosModules", "sbs.py");
            const p = new PyFile_1.PyFile(gh, text);
            return p;
        }
        // If able to find the url
        gh = saveZipTempFile("sbs.py", text);
        const p = new PyFile_1.PyFile(gh, text);
        return p;
    }
    catch (e) {
        // TODO: This section is probably unnecessary and obsolete.
        // I did delete the sbs zip file as part of this repo, so it's doubly obsolete.
        // But I kinda want a backup...
        // What if I want to code without access to the internet?
        (0, console_1.debug)("Can't find sbs.py on github");
        try {
            text = await loadTempFile("sbs.py");
            gh = path.join(os.tmpdir(), "cosmosModules", "sbs.py");
            // text = await readFile(gh);
            const p = new PyFile_1.PyFile(gh, text);
            (0, console_1.debug)("SBS py file generated");
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
async function loadTempFile(uri) {
    const temPath = path.join(os.tmpdir(), "cosmosModules", uri);
    if (fs.existsSync(path.dirname(temPath))) {
        const text = await (0, fileFunctions_1.readFile)(temPath);
        return text;
    }
    return "";
}
//# sourceMappingURL=cache.js.map