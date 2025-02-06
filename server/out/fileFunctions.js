"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRootFolder = getRootFolder;
exports.findSubfolderByName = findSubfolderByName;
exports.getFolders = getFolders;
exports.getFileContents = getFileContents;
exports.readFile = readFile;
exports.getFilesInDir = getFilesInDir;
exports.getInitFileInFolder = getInitFileInFolder;
exports.readAllFilesIn = readAllFilesIn;
exports.readZipArchive = readZipArchive;
exports.getStoryJson = getStoryJson;
exports.getParentFolder = getParentFolder;
exports.getMissionFolder = getMissionFolder;
exports.fixFileName = fixFileName;
const path = require("path");
const fs = require("fs");
const console_1 = require("console");
const AdmZip = require("adm-zip");
const vscode_uri_1 = require("vscode-uri");
/**
 * TODO: Use parsers.py to determine the style definitions available for UI elements
 * See https://github.com/artemis-sbs/sbs_utils/blob/master/sbs_utils/mast/parsers.py
 */
function getRootFolder() {
    // let initialDir = "./";
    // let dir = findSubfolderByName(initialDir,"__lib__");
    // if (dir === null) {
    // Need to be sure we're capturing the right folder - we don't know if the user
    // is using the root Artemis folder or the missions folder, or anything in between.
    let initialDir = "../../../../";
    let dir = findSubfolderByName(initialDir, "data");
    (0, console_1.debug)(dir + "\n");
    if (dir !== null) {
        dir = findSubfolderByName(dir, "missions");
        if (dir !== null) {
            dir = findSubfolderByName(dir, "__lib__");
            if (dir !== null) {
                //dir = dir.replace(/\.\.\\/g,"");
                return dir;
            }
        }
    }
    return null;
}
function findSubfolderByName(dir, folderName) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        if (file.isDirectory()) {
            if (file.name === folderName) {
                return path.join(dir, file.name);
            }
            else {
                const subfolderPath = findSubfolderByName(path.join(dir, file.name), folderName);
                if (subfolderPath) {
                    return subfolderPath;
                }
            }
        }
    }
    return null;
}
/**
 * Get all folders within a directory
 * @param dir
 * @returns
 */
function getFolders(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
}
/**
 * Get the contents of a file
 * @param dir The uri of a file
 * @returns A promise containing the text contents of the file specified
 */
async function getFileContents(dir) {
    const uri = dir.replace("file:///c%3A", "C:");
    const entries = await fetch(uri);
    return entries.text();
}
async function readFile(dir) {
    let ret = "";
    const d = fs.readFile(dir, "utf-8", (err, data) => {
        if (err) {
            (0, console_1.debug)("error reading file: " + dir + "\n" + err);
        }
        ret = data;
    });
    return ret;
}
function getFilesInDir(dir, includeChildren = true) {
    let ret = [];
    try {
        // Not sure why workspace.uri returns this weird initial designator, but we can fix it just fine.
        // Probably because we're using fetch()
        const uri = dir.replace("file:///c%3A", "C:");
        const files = fs.readdirSync(uri, { withFileTypes: true });
        for (const f in files) {
            if (files[f].isDirectory()) {
                if (includeChildren) {
                    let newDir = path.join(uri, files[f].name);
                    ret = ret.concat(getFilesInDir(newDir, includeChildren));
                }
            }
            else {
                ret.push(path.join(uri, files[f].name));
            }
        }
    }
    catch (e) {
        (0, console_1.debug)(e);
    }
    return ret;
}
/**
 * TODO: For now I'll just assume that ALL files in a directory are imported. This may not be actually true at times.
 * @param uri
 * @returns
 */
function getInitFileInFolder(uri) {
    const files = fs.readdirSync(uri, { withFileTypes: true });
    let ret = undefined;
    for (const file of files) {
        if (file.name.includes("__init__")) {
            ret = file.parentPath + path.sep + file.name;
            return ret;
        }
    }
    return ret;
}
function readAllFilesIn(folder) {
    const files = getFilesInDir(folder.uri, false);
    for (const f in files) {
        (0, console_1.debug)(files[f]);
    }
}
async function readZipArchive(filepath) {
    const map = new Map();
    (0, console_1.debug)(filepath);
    const zip = new AdmZip(filepath);
    try {
        for (const zipEntry of zip.getEntries()) {
            if (!zipEntry.isDirectory) {
                let data = zipEntry.getData().toString('utf-8');
                map.set(zipEntry.entryName, data);
            }
        }
    }
    catch (e) {
        console.log(`Unzipping ${filepath} failed. \n${e}`);
    }
    return map;
}
function getStoryJson(uri) {
    let mission = findSubfolderByName("../../../", "missions");
    (0, console_1.debug)(mission);
    (0, console_1.debug)(uri);
    let ret = "";
    getFilesInDir(uri).forEach((file) => {
        if (file.endsWith("story.json")) {
            (0, console_1.debug)("Found file");
            ret = file;
        }
    });
    if (ret !== "") {
        return ret;
    }
    const m = uri.indexOf("missions");
    const end = m + 9;
    const dir1 = uri.substring(end);
    (0, console_1.debug)(dir1);
    const n = dir1.indexOf(path.sep);
    if (n === -1) {
        return uri;
    }
    ret = uri.substring(0, end + n + 1);
    return ret;
}
function getParentFolder(childUri) {
    if (childUri.startsWith("file")) {
        childUri = vscode_uri_1.URI.parse(childUri).fsPath;
    }
    let p = path.dirname(childUri);
    (0, console_1.debug)(p);
    if (p === ".") {
        (0, console_1.debug)(childUri + " getParentFolder() ends with period.");
        p = childUri;
    }
    fs.lstat(p, (err, stats) => {
        if (err) {
            (0, console_1.debug)(err);
            throw new URIError(err.message);
            return p;
        }
        if (stats.isSymbolicLink()) {
            fs.readlink(p, (err2, dat) => {
                if (err2) {
                    (0, console_1.debug)(err2);
                }
                p = path.dirname(dat);
            });
        }
    });
    return p;
}
function getMissionFolder(uri) {
    // Check if it's the right format
    if (uri.startsWith("file")) {
        uri = vscode_uri_1.URI.parse(uri).fsPath;
    }
    let arr = uri.split(path.sep);
    let retArr = [];
    let found = false;
    for (let i = 0; i < arr.length; i++) {
        // Check if this is the mission folder
        if (arr[i] !== "missions") {
            retArr.push(arr[i]);
        }
        else {
            retArr.push(arr[i]);
            if (i + 1 < arr.length) {
                retArr.push(arr[i + 1]);
            }
            else {
                (0, console_1.debug)("Can't determine the mission folder: " + uri);
                return "";
            }
            found = true;
            break;
        }
    }
    // Rebuild the path
    let ret = retArr.join(path.sep);
    //debug(ret);
    // Check if it's in a mission folder
    if (!found) {
        return "";
    }
    return ret;
}
function fixFileName(uri) {
    if (uri.startsWith("file")) {
        uri = vscode_uri_1.URI.parse(uri).fsPath;
    }
    return uri;
}
//readZipArchive("C:/Users/mholderbaum/Documents/Cosmos-1-0-0/data/missions/__lib__/artemis-sbs.LegendaryMissions.autoplay.v3.9.39.mastlib");
//# sourceMappingURL=fileFunctions.js.map