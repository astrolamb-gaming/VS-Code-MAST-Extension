"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoryJson = exports.MastFileCache = exports.PyFileCache = exports.MissionCache = void 0;
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
function loadCache(dir) {
    // TODO: Need a list of caches, in case there are files from more than one mission folder open
    cache = new MissionCache(dir);
    // const defSource = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/sbs_utils/mast/mast.py";
    // const defSource2 = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/sbs_utils/mast/maststory.py";
    // loadTypings().then(()=>{ debug("Typings Loaded" )});
    // loadRouteLabels().then(()=>{ debug("Routes Loaded") });
    // getRexEx(defSource).then(()=>{ debug("Regular Expressions gotten")});
    // getRexEx(defSource2).then(()=>{ debug("Regular Expressions 2 gotten")
    // 	debug("Label?: ");
    // 	debug(exp.get("Label"));
    // });
    //debug(getStoryJson(dir));
}
class MissionCache {
    constructor(workspaceUri) {
        this.missionName = "";
        this.missionURI = "";
        this.missionPyModules = [];
        this.missionMastModules = [];
        // string is the full file path and name
        // FileCache is the information associated with the file
        this.pyFileInfo = new Map();
        this.mastFileInfo = new Map();
        this.missionURI = (0, fileFunctions_1.getMissionFolder)(workspaceUri);
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
                }
            }
            if (path.extname(file) === "py") {
                (0, console_1.debug)(file);
                // Parse Python File
                const p = new data_1.PyFile(file);
                this.pyFileInfo.set(file, p);
            }
        }
    }
    modulesLoaded() {
        const uri = this.missionURI;
        const missionLibFolder = path.join((0, fileFunctions_1.getParentFolder)(uri), "__lib__");
        for (const zip of this.storyJson.sbslib) {
            const zipPath = path.join(missionLibFolder, zip);
            (0, fileFunctions_1.readZipArchive)(zipPath).then((data) => {
                this.handleZipData(data);
            }).catch(err => {
                (0, console_1.debug)("Error unzipping. \n" + err);
            });
        }
        for (const zip of this.storyJson.mastlib) {
            const zipPath = path.join(missionLibFolder, zip);
            (0, fileFunctions_1.readZipArchive)(zipPath).then((data) => {
                this.handleZipData(data);
            }).catch(err => {
                (0, console_1.debug)("Error unzipping. \n" + err);
            });
        }
    }
    handleZipData(zip) {
        zip.forEach((file, data) => {
            if (file.endsWith(".py")) {
                const p = new data_1.PyFile(file, data);
                this.missionPyModules.push(p);
            }
            if (file.endsWith(".mast")) {
                const m = new data_1.MastFile(file, data);
                this.missionMastModules.push(m);
            }
        });
    }
    getLabels() {
        let li = [];
        for (const f of this.mastFileInfo) {
            li = li.concat(f[1].labelNames);
        }
        return li;
    }
}
exports.MissionCache = MissionCache;
class PyFileCache extends data_1.FileCache {
    constructor() {
        super(...arguments);
        this.classTypings = [];
        this.pyTypings = [];
        this.functionData = [];
    }
}
exports.PyFileCache = PyFileCache;
class MastFileCache extends data_1.FileCache {
    constructor() {
        super(...arguments);
        this.labelNames = [];
    }
}
exports.MastFileCache = MastFileCache;
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
        const data = fs.readFileSync(this.uri, "utf-8");
        this.parseFile(data);
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
let cache;
function getCache() {
    return cache;
}
//# sourceMappingURL=cache.js.map