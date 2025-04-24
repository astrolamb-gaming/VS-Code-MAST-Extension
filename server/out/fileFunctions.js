"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findSubfolderByName = findSubfolderByName;
exports.getFolders = getFolders;
exports.getFileContents = getFileContents;
exports.readFile = readFile;
exports.getFilesInDir = getFilesInDir;
exports.getInitFileInFolder = getInitFileInFolder;
exports.readAllFilesIn = readAllFilesIn;
exports.readZipArchive = readZipArchive;
exports.getParentFolder = getParentFolder;
exports.getInitContents = getInitContents;
exports.getMissionFolder = getMissionFolder;
exports.fixFileName = fixFileName;
exports.fileFromUri = fileFromUri;
exports.getArtemisDirFromChild = getArtemisDirFromChild;
const path = require("path");
const fs = require("fs");
const console_1 = require("console");
const AdmZip = require("adm-zip");
const vscode_uri_1 = require("vscode-uri");
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
 * Get the contents of a file from the web
 * Use readFile() to get the contents of a local file
 * @param dir The uri of a file
 * @returns A promise containing the text contents of the file specified
 */
async function getFileContents(dir) {
    const uri = fixFileName(dir);
    const entries = await fetch(uri);
    return entries.text();
}
/**
 * Use to read a local file.
 * Use getFileContents() to get the contents of a file from the web.
 * @param dir
 * @returns
 */
async function readFile(dir) {
    dir = fixFileName(dir);
    //let ret: string = "";
    // const d = fs.readFileSync(dir, "utf-8").then( (err,data)=>{
    // 	if (err) {
    // 		debug("error reading file: " + dir + "\n" + err);
    // 	}
    // 	ret = data;
    // });
    const ret = fs.readFileSync(dir, "utf-8");
    return ret;
}
/**
 *
 * @param dir directory or uri of folder
 * @param includeChildren boolean, set true if all files within all subfolders should be gotten. Set false if only the files in the specified directory should be gotten.
 * @returns
 */
function getFilesInDir(dir, includeChildren = true) {
    let ret = [];
    try {
        // Not sure why workspace.uri returns this weird initial designator, but we can fix it just fine.
        // Probably because we're using fetch()
        let uri = fixFileName(dir);
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
    //debug(filepath);
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
function getParentFolder(childUri) {
    childUri = fixFileName(childUri);
    // if (childUri.startsWith("file")) {
    // 	childUri = URI.parse(childUri).fsPath;
    // }
    let p = path.dirname(childUri);
    //debug(p);
    if (p === ".") {
        (0, console_1.debug)(childUri + " getParentFolder() ends with period.");
        p = childUri;
    }
    fs.lstat(p, (err, stats) => {
        if (err) {
            (0, console_1.debug)(err);
            //throw new URIError(err.message);
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
function getInitContents(uri) {
    let ret = [];
    const parent = getParentFolder(fixFileName(uri));
    const init = path.join(parent, "__init__.mast");
    const text = fs.readFileSync(init, "utf-8").replace(/import[ \t]*/g, "");
    let lines = text.split("\n");
    for (const l of lines) {
        const t = l.trim();
        if (t !== "") {
            ret.push(t);
        }
    }
    return ret;
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
    return uri.replace(/\\/g, "/");
}
function fileFromUri(uri) {
    if (!uri.startsWith("file:///")) {
        return "file:///" + uri;
    }
    return uri;
}
function getArtemisDirFromChild(child) {
    if (child.endsWith(":\\")) {
        return null;
    }
    child = fixFileName(child);
    child = path.normalize(child);
    let files = getFilesInDir(child, false);
    if (files.includes("Artemis3-x64-release.exe")) {
        return child;
    }
    else if (getFolders(child).includes("PyAddons")) {
        return child;
    }
    child = getParentFolder(child);
    let aDir = getArtemisDirFromChild(child);
    if (aDir === null) {
        return null;
    }
    else {
        return aDir;
    }
}
//readZipArchive("C:/Users/mholderbaum/Documents/Cosmos-1-0-0/data/missions/__lib__/artemis-sbs.LegendaryMissions.autoplay.v3.9.39.mastlib");
//# sourceMappingURL=fileFunctions.js.map