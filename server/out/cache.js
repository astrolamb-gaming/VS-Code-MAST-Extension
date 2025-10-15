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
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
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
const signals_1 = require("./tokens/signals");
exports.testingPython = false;
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
        // missionClasses: ClassObject[] = [];
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
        // Variables to check if the cache has finished loading
        this.storyJsonLoaded = false;
        this.pyInfoLoaded = false;
        this.missionFilesLoaded = false;
        this.sbsLoaded = false;
        this.awaitingReload = false;
        this.lastAccessed = 0;
        this.watchers = [];
        this.resourceLabels = (0, routeLabels_1.loadResourceLabels)();
        this.mediaLabels = this.mediaLabels.concat((0, routeLabels_1.loadMediaLabels)());
        this.missionURI = (0, fileFunctions_1.getMissionFolder)(workspaceUri);
        (0, console_1.debug)(this.missionURI);
        let parent = (0, fileFunctions_1.getParentFolder)(this.missionURI);
        this.missionLibFolder = path.join(parent, "__lib__");
        this.missionName = path.basename(this.missionURI);
        this.storyJson = new storyJson_1.StoryJson(path.join(this.missionURI, "story.json"));
        // this.load().then(async ()=>{
        // 	await sleep(100);
        // 	// showProgressBar(false);
        // 	debug("Starting python")
        // 	initializePython(path.join(this.missionURI,"story.json"))	
        // });
        // this.startWatchers();
    }
    async load() {
        if (this.missionURI === "") {
            (0, console_1.debug)("Mission folder not valid: " + this.missionURI + "\nNot loading cache.");
            return;
        }
        this.endWatchers();
        this.storyJsonLoaded = false;
        this.pyInfoLoaded = false;
        this.missionFilesLoaded = false;
        this.sbsLoaded = false;
        (0, console_1.debug)("Starting MissionCache.load()");
        (0, server_1.showProgressBar)(true);
        // (re)set all the arrays before (re)populating them.
        // this.missionClasses = [];
        // this.missionDefaultFunctions = [];
        this.missionMastModules = [];
        this.missionPyModules = [];
        this.pyFileCache = [];
        this.resourceLabels = [];
        this.mediaLabels = [];
        this.mastFileCache = [];
        this.storyJson = new storyJson_1.StoryJson(path.join(this.missionURI, "story.json"));
        await this.storyJson.readFile();
        // .then(()=>{
        (0, server_1.showProgressBar)(true);
        (0, console_1.debug)("pyFileCache length: " + this.pyFileCache.length);
        await this.modulesLoaded();
        // .then(()=>{
        (0, console_1.debug)("Modules loaded for " + this.missionName);
        // showProgressBar(false);
        this.storyJsonLoaded = true;
        // Now we do the python checks for the MastGlobals that don't exist already
        let globals = [];
        for (const p of this.pyFileCache) {
            if (p.globals.length > 0) {
                globals = globals.concat(p.globals);
            }
        }
        await this.loadPythonGlobals(globals);
        // .then((info)=>{
        (0, console_1.debug)("Loaded globals");
        this.pyInfoLoaded = true;
        // });
        (0, console_1.debug)("New pyFileCache length: " + this.pyFileCache.length);
        // })
        // });
        let p = await loadSbs(); //.then(async (p)=>{
        (0, server_1.showProgressBar)(true);
        if (p !== null) {
            this.addMissionPyFile(p);
            // this.missionPyModules.push(p);
            // debug("addding " + p.uri);
            // this.missionClasses = this.missionClasses.concat(p.classes);
        }
        (0, console_1.debug)("Finished loading sbs_utils for " + this.missionName);
        // showProgressBar(false);
        this.sbsLoaded = true;
        // await this.awaitLoaded();
        // });
        this.checkForCacheUpdates();
        (0, console_1.debug)(this.missionURI);
        //this.checkForInitFolder(this.missionURI);
        (0, console_1.debug)("Number of py files: " + this.pyFileCache.length);
        await this.awaitLoaded();
        (0, console_1.debug)("Everything is loaded");
        this.startWatchers();
    }
    /**
     * Reload the cache after it's already been loaded to reset everything.
     */
    async reload() {
        // Don't load until it's finished loading the first time
        if (this.awaitingReload)
            return;
        this.awaitingReload = true;
        (0, console_1.debug)("Awaiting loaded");
        await this.awaitLoaded();
        await this.load();
        (0, console_1.debug)("Reload complete.");
        this.awaitingReload = false;
    }
    /**
     * Start file system watchers
     * These enable cache reloading if story.json is changed, or if a mastlib/sbslib file is changed.
     * Also handles deleted mast/py files.
     * Does NOT handle new files, it will be added when it is opened.
     */
    startWatchers() {
        let w = fs.watch(this.missionURI, { "recursive": true }, (eventType, filename) => {
            // debug("fs.watch() EVENT: ")
            // debug(eventType);
            // could be either 'rename' or 'change'. new file event and delete
            // also generally emit 'rename'
            // debug(filename);
            if (filename === null || filename.includes(".git") || filename.includes("__pycache__"))
                return;
            (0, console_1.debug)(this.missionURI);
            (0, console_1.debug)(filename);
            if (eventType === "rename") {
                const filePath = path.join(this.missionURI, filename);
                // Check if the file was added
                if (fs.existsSync(filePath)) {
                    console.log(`File added: ${filename}`);
                    const init = (0, fileFunctions_1.getInitContents)(path.join(this.missionURI, filename));
                    let inInit = false;
                    for (const i of init) {
                        if (filename.endsWith(i)) {
                            inInit = true;
                            break;
                        }
                    }
                    if (!inInit) {
                        this.tryAddToInitFile(path.dirname(path.join(this.missionURI, filename)), path.basename(filename));
                    }
                }
                else {
                    if (filename?.endsWith(".py")) {
                        this.removePyFile(path.join(this.missionURI, filename));
                    }
                    if (filename?.endsWith(".mast")) {
                        this.removeMastFile(path.join(this.missionURI, filename));
                    }
                }
                return;
            }
            // Should only trigger when the py file is saved.
            if (eventType === "change") {
                if (filename?.endsWith(".py")) {
                    // let text = readFileSync(filename);
                    let file = path.join(this.missionURI, filename);
                    // debug(file);
                    let pyFile = this.getPyFile(file);
                    let text = (0, fileFunctions_1.readFileSync)(file);
                    const textDoc = vscode_languageserver_textdocument_1.TextDocument.create(file, "py", 1, text);
                    if (textDoc) {
                        this.updateFileInfo(textDoc);
                    }
                    else {
                        (0, console_1.debug)("File not found in watcher");
                    }
                }
            }
            if (filename === "story.json" && eventType === "change") {
                this.reload();
            }
        });
        this.watchers.push(w);
        // Watches for changes to the sbs_lib or mast_lib files
        let libFolder = path.join((0, globals_1.getGlobals)().artemisDir, "data", "missions", "__lib__");
        // debug(libFolder);
        let w2 = fs.watch(libFolder, {}, (eventType, filename) => {
            // TODO: Only load the bits applicable for these files?
            // More efficient to only reload what needs reloaded.
            // As is, will need to reload the whole cache...
            // debug("Event Type: " + eventType);
            if (eventType === "change") {
                (0, console_1.debug)("Change detected - checking if update is needed");
                // debug(filename + "  Changed\n\nHERE\n\n................");
                for (const lib of this.storyJson.sbslib) {
                    if (lib === filename) {
                        this.reload();
                    }
                }
                for (const lib of this.storyJson.mastlib) {
                    if (lib === filename) {
                        this.reload();
                    }
                }
            }
        });
        this.watchers.push(w2);
    }
    endWatchers() {
        for (const w of this.watchers) {
            w.close();
        }
        this.watchers = [];
    }
    /**
     * Load globals from the python shell and builtins.py (stuff like len() and list())
     * @param globals
     */
    async loadPythonGlobals(globals) {
        let go = await (0, globals_1.initializeGlobals)();
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
                globalInfo.push([g[0], path.join(go.artemisDir, "data")]);
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
        // This is built from the python shell
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
        // showProgressBar(false);
        this.pyInfoLoaded = true;
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
    async tryAddToInitFile(folder, newFile) {
        let ret = await server_1.connection.window.showWarningMessage("File not found in '__init__.mast'.", { title: "Add " + newFile + " to __init__.mast" }, { title: "Don't add" }
        //{title: hide} // TODO: Add this later!!!!!!
        );
        if (ret === undefined)
            return true;
        if (ret.title === "Add " + newFile + " to __init__.mast") {
            try {
                fs.writeFile(path.join(folder, "__init__.mast"), "\nimport " + newFile, { flag: "a+" }, () => { });
            }
            catch (e) {
                (0, console_1.debug)("Can't add " + newFile + " to __init__.mast");
                (0, console_1.debug)(e);
            }
        }
    }
    /**
     * Loads the zip/mastlib/sbslib file modules
     * @returns Promise<void>
     */
    async modulesLoaded() {
        if (exports.testingPython)
            return;
        const uri = this.missionURI;
        let globals = (0, globals_1.getGlobals)();
        if (globals === undefined) {
            globals = await (0, globals_1.initializeGlobals)();
        }
        (0, console_1.debug)(uri);
        // Don't load modules if it's the sbs_utils folder?
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
                        const missionFolder = path.join(globals.artemisDir, "data", "missions", m);
                        const files = (0, fileFunctions_1.getFilesInDir)(missionFolder, true);
                        for (const f of files) {
                            if (f.endsWith(".py") || f.endsWith(".mast")) {
                                (0, server_1.showProgressBar)(true);
                                const data = await (0, fileFunctions_1.readFile)(f); //.then((data)=>{
                                (0, server_1.showProgressBar)(true);
                                // debug("Loading: " + path.basename(f));
                                this.handleZipData(data, f);
                                // });
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
        // debug("Beginning to load zip data for: " + file);
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
            m.inZip = true;
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
            // debug("Updating " + doc.uri);
            this.getMastFile(doc.uri).parse(doc.getText());
        }
        else if (doc.languageId === "py") {
            // debug("Updating " + doc.uri);
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
        // this.missionClasses = this.missionClasses.concat(p.classes);
    }
    /**
     * Add a py file to the sbs_utils cache (stuff that's in sbs_utils)
     * @param p A {@link PyFile PyFile} that should be added to {@link MissionCache.pyFileCache MissionCache.pyFileCache}
     */
    addSbsPyFile(p) {
        // If it's already there, return
        for (const f of this.pyFileCache) {
            if ((0, fileFunctions_1.fixFileName)(f.uri) === (0, fileFunctions_1.fixFileName)(p.uri)) {
                return;
            }
        }
        // ONly trigger when there are defined globals
        if (p.globalFiles.length > 0) {
            this.sbsGlobals = this.sbsGlobals.concat(p.globalFiles);
            // Update all existing py files if they are globals
            for (const g of p.globalFiles) {
                for (const f of this.pyFileCache) {
                    this.tryApplyFileAsGlobal(f, g);
                }
            }
        }
        // ALWAYS go over the existing globals for the new file
        for (const g of this.sbsGlobals) {
            this.tryApplyFileAsGlobal(p, g);
        }
        // Now add it to the cache
        this.pyFileCache.push(p);
    }
    tryApplyFileAsGlobal(f, g) {
        if (f.isGlobal)
            return;
        if (g[0] === "sbs") {
            // Treat sbs differently
            return;
        }
        const file = f.uri.replace(/\//g, ".").replace(/\\/g, ".");
        if (file.includes(g[0]) && file.endsWith(".py")) {
            f.isGlobal = true;
            if (g[1] !== "") {
                // TODO: Update function names with prepend
                // TODO: Issue #39 is caused by this?
                const newDefaults = [];
                // debug(f.defaultFunctions);
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
    /**
     * Triggers an update to any files that do or don't exist anymore
     * Files that no longer exist should be removed by the filesystem watcher
     * The only real use for this now is when loading the initial cache info.
     */
    checkForCacheUpdates() {
        this.missionFilesLoaded = false;
        (0, server_1.showProgressBar)(true);
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
        // showProgressBar(false);
        this.missionFilesLoaded = true;
    }
    /**
     * Gets all route labels in scope for the given cache.
     * @returns A list of {@link string string}s
     */
    getRouteLabels() {
        let str = [];
        for (const r of this.routeLabels) {
            str.push(r.route);
        }
        (0, console_1.debug)(str);
        return str;
    }
    getUsedRoutes(routeStart) {
        let str = this.getRouteLabels();
        for (const m of this.mastFileCache) {
            str = str.concat(m.routes);
        }
        for (const m of this.missionMastModules) {
            str = str.concat(m.routes);
        }
        if (routeStart !== "") {
            let ret = str;
            str = [];
            for (const s of ret) {
                if (s.startsWith(routeStart)) {
                    str.push(s.replace(routeStart, ""));
                }
            }
        }
        return str;
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
        for (const c of this.getClasses()) {
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
        let uri = "";
        if (doc)
            uri = (0, fileFunctions_1.fixFileName)(doc.uri);
        let ci = [];
        for (const m of this.mastFileCache) {
            if (m.uri === uri) {
                for (const v of m.getVariableNames()) {
                    v.sortText = "__" + v.label;
                    ci.push(v);
                }
                continue;
            }
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
     * Get all signals used in the mission
     * @returns an array of {@link string string}s representing the signals used elsewhere in the mission
     */
    getSignals() {
        let ret = [];
        for (const m of this.mastFileCache) {
            ret = ret.concat(m.signals);
        }
        for (const m of this.missionMastModules) {
            ret = ret.concat(m.signals);
        }
        for (const p of this.pyFileCache) {
            ret = ret.concat(p.signals);
        }
        for (const p of this.missionPyModules) {
            ret = ret.concat(p.signals);
        }
        ret = (0, signals_1.mergeSignalInfo)(ret);
        // ret = [...new Set(ret)]; // Don't want duplicates, I think...
        return ret;
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
     * @param textDocument the current {@link TextDocument TextDocument}
     * @param thisFileOnly if true, returns only labels in the current file. Default is false.
     * @returns List of {@link LabelInfo LabelInfo} applicable to the current scope (including modules)
     */
    getLabels(textDocument, thisFileOnly = false) {
        // debug(this.mastFileCache)
        let fileUri = (0, fileFunctions_1.fixFileName)(textDocument.uri);
        let li = [];
        //debug(this.mastFileInfo);
        for (const f of this.mastFileCache) {
            if (!thisFileOnly || fileUri === f.uri) {
                li = li.concat(f.labelNames);
            }
        }
        if (thisFileOnly)
            return li;
        // This gets stuff from LegendaryMissions, if the current file isn't LegendaryMissions itself.
        for (const f of this.missionMastModules) {
            li = li.concat(f.labelNames);
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
    getLabelsAtPos(doc, pos, thisFileOnly = false) {
        // const labels: LabelInfo[] = this.getLabels(doc);
        if (doc.languageId !== "mast")
            return [];
        const labels = this.getMastFile(doc.uri).labelNames;
        const main = (0, labels_1.getMainLabelAtPos)(pos, labels);
        const subs = main.subLabels;
        let ret;
        if (thisFileOnly) {
            ret = labels.concat(subs);
        }
        else {
            ret = this.getLabels(doc).concat(subs);
        }
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
            for (const c of this.getClasses()) {
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
        for (const c of this.getClasses()) {
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
    getSignatureOfMethod(name, isClassMethod = false) {
        if (isClassMethod) {
            for (const c of this.getClasses()) {
                for (const f of c.methods) {
                    if (f.name === name) {
                        return f.buildSignatureInformation();
                    }
                }
            }
        }
        for (const p of this.missionPyModules) {
            for (const f of p.defaultFunctions) {
                // for (const f of this.missionDefaultFunctions) {
                if (f.name === name) {
                    return f.buildSignatureInformation();
                }
            }
        }
        if (isClassMethod) {
            for (const c of this.getClasses()) {
                for (const m of c.methods) {
                    if (m.name === name) {
                        return m.buildSignatureInformation();
                    }
                }
            }
        }
        for (const m of this.pyFileCache) {
            for (const f of m.defaultFunctions) {
                if (f.name === name) {
                    return f.buildSignatureInformation();
                }
            }
            if (isClassMethod) {
                for (const c of m.classes) {
                    for (const f of c.methods) {
                        if (f.name === name) {
                            return f.buildSignatureInformation();
                        }
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
        // folder = fixFileName(folder);
        let keys = [];
        // const ini = getInitContents(folder);
        // debug(ini);
        // debug(this.mastFileCache.length)
        for (const m of this.mastFileCache) {
            // if (ini.includes(path.basename(m.uri))) {
            keys = keys.concat(m.keys);
            // }
        }
        for (const m of this.missionMastModules) {
            keys = keys.concat(m.keys);
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
            if (m.uri === uri) {
                return m;
            }
        }
        // debug("Creating Mast File: " + uri);
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
            if ((0, fileFunctions_1.fixFileName)(p.uri) === (0, fileFunctions_1.fixFileName)(uri)) {
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
    // addMissionPyFile(py:PyFile) {
    // 	for (const p of this.missionPyModules) {
    // 	}
    // }
    isLoaded() {
        let all = this.sbsLoaded && this.storyJsonLoaded && this.pyInfoLoaded && this.missionFilesLoaded;
        // debug("Loaded status:");
        // debug(this.sbsLoaded);
        // debug(this.storyJsonLoaded);
        // debug(this.pyInfoLoaded);
        if (all)
            (0, server_1.showProgressBar)(false);
        return all;
    }
    async awaitLoaded() {
        while (!(this.sbsLoaded && this.storyJsonLoaded && this.pyInfoLoaded && this.missionFilesLoaded)) {
            // debug("Loaded status:");
            // debug(this.sbsLoaded);
            // debug(this.storyJsonLoaded);
            // debug(this.pyInfoLoaded);
            await (0, python_1.sleep)(100);
        }
        // debug("Hiding progress bar")
        (0, server_1.showProgressBar)(false);
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
    // return null;
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
            cache.lastAccessed = new Date().getTime();
            return cache;
        }
    }
    if (ret === undefined) {
        ret = new MissionCache(name);
        caches.push(ret);
        ret.load();
    }
    ret.lastAccessed = new Date().getTime();
    return ret;
}
/**
 * If the cache hasn't been accessed in awhile, garbage collect the cache.
 * TODO: Make this a user-customizable option.
 */
function cacheGC() {
    setTimeout(() => {
        for (const c of caches) {
            if (new Date().getTime() - c.lastAccessed > 1000 * 60 * 7) { // 7 minutes
                const index = caches.indexOf(c, 0);
                caches.splice(index, 1);
            }
        }
    }, 1000 * 60 * 5); // 5 minutes
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