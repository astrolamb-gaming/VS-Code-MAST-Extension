"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MastFileCache = exports.PyFileCache = exports.FileCache = exports.Cache = void 0;
exports.loadCache = loadCache;
exports.getSourceFiles = getSourceFiles;
exports.getCache = getCache;
const data_1 = require("./data");
const console_1 = require("console");
const autocompletion_1 = require("./autocompletion");
const signatureHelp_1 = require("./signatureHelp");
const rx_1 = require("./rx");
const routeLabels_1 = require("./routeLabels");
function loadCache(dir) {
    cache = new Cache();
    const defSource = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/sbs_utils/mast/mast.py";
    const defSource2 = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/sbs_utils/mast/maststory.py";
    loadTypings().then(() => { (0, console_1.debug)("Typings Loaded"); });
    (0, routeLabels_1.loadRouteLabels)().then(() => { (0, console_1.debug)("Routes Loaded"); });
    getRexEx(defSource).then(() => { (0, console_1.debug)("Regular Expressions gotten"); });
    getRexEx(defSource2).then(() => {
        (0, console_1.debug)("Regular Expressions 2 gotten");
        (0, console_1.debug)("Label?: ");
        (0, console_1.debug)(exp.get("Label"));
    });
}
class Cache {
    constructor() {
        // string is the full file path and name
        // FileCache is the information associated with the file
        this.fileInfo = new Map();
    }
    getLabels() {
        let li = [];
        for (const f of this.fileInfo) {
            li = li.concat(f[1].labelNames);
        }
        return li;
    }
    /**
     * Get the FileCache associated with the filename
     * @param name
     * @returns FileCache
     */
    get(name) {
        let ret = this.fileInfo.get(name);
        if (ret === undefined) {
            for (const f of this.fileInfo) {
                if (f[0].endsWith(name)) {
                    return f[1];
                }
            }
        }
        return ret;
    }
    set(file, info) {
        this.fileInfo.set(file, info);
    }
}
exports.Cache = Cache;
class FileCache {
    constructor() {
        this.variableNames = [];
    }
}
exports.FileCache = FileCache;
class PyFileCache extends FileCache {
    constructor() {
        super(...arguments);
        this.classTypings = [];
        this.pyTypings = [];
        this.functionData = [];
    }
}
exports.PyFileCache = PyFileCache;
class MastFileCache extends FileCache {
    constructor() {
        super(...arguments);
        this.labelNames = [];
    }
}
exports.MastFileCache = MastFileCache;
const sourceFiles = [];
function getSourceFiles() { return sourceFiles; }
async function loadTypings() {
    try {
        //const { default: fetch } = await import("node-fetch");
        //const fetch = await import('node-fetch');
        //let github : string = "https://github.com/artemis-sbs/sbs_utils/raw/refs/heads/master/mock/sbs.py";
        let gh = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/typings/";
        for (const page in files) {
            let url = gh + files[page] + ".pyi";
            const data = await fetch(url);
            const textData = await data.text();
            sourceFiles.push((0, data_1.parseWholeFile)(textData, files[page]));
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