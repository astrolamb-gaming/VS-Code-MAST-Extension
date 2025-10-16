"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MastFile = void 0;
const console_1 = require("console");
const fs = require("fs");
const path = require("path");
const vscode_languageserver_1 = require("vscode-languageserver");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const data_1 = require("../data");
const labels_1 = require("../tokens/labels");
const prefabs_1 = require("../tokens/prefabs");
const roles_1 = require("../tokens/roles");
const variables_1 = require("../tokens/variables");
const words_1 = require("../tokens/words");
const python_1 = require("../python/python");
const routeLabels_1 = require("../tokens/routeLabels");
const signals_1 = require("../tokens/signals");
/**
 * Represents a mast file.
 * Contains all the information about that specific file, including its referenced
 * labels, variables, roles, and prefabs.
 */
class MastFile extends data_1.FileCache {
    constructor(uri, fileContents = "") {
        //debug("building mast file");
        super(uri);
        this.labelNames = [];
        // TODO: Add support for holding label information for all files listed in __init__.mast in a given folder.
        // TODO: Add system for tracking variables in a mast file
        this.variables = [];
        this.routes = [];
        this.signals = [];
        this.roles = [];
        this.inventory_keys = [];
        this.blob_keys = [];
        this.prefabs = [];
        this.words = [];
        this.inZip = false;
        this.loaded = false;
        if (path.extname(uri) === ".mast") {
            // If the contents are aleady read, we parse and move on. Don't need to read or parse again.
            if (fileContents !== "") {
                //debug("parsing, has contents");
                this.inZip = true;
                this.parse(fileContents);
                return;
            }
            else {
                fs.readFile(uri, "utf-8", (err, data) => {
                    if (err) {
                        (0, console_1.debug)("error reading file: " + uri + "\n" + err);
                        throw err;
                    }
                    else {
                        //debug("parsing, no error");
                        this.parse(data);
                    }
                });
            }
        }
        else if (path.extname(uri) === ".py") {
            // Shouldn't do anything, Py files are very different from mast
            (0, console_1.debug)("ERROR: Trying to parse a .py file as a .mast file: " + uri);
            // Send notification to client?
        }
    }
    // async asTextDocument(): Promise<TextDocument> {
    // 	let contents = await readFile(this.uri);
    // 	let doc: TextDocument = TextDocument.create(this.uri, path.extname(this.uri), 1, contents);
    // 	return doc;
    // }
    parse(text) {
        this.loaded = false;
        // debug("parsing mast file: " + this.uri)
        const textDocument = vscode_languageserver_textdocument_1.TextDocument.create(this.uri, "mast", 1, text);
        this.labelNames = (0, labels_1.parseLabelsInFile)(text, this.uri);
        // debug(this.labelNames)
        this.prefabs = (0, prefabs_1.parsePrefabs)(this.labelNames);
        // TODO: Parse variables, etc
        //this.variables = getVariableNamesInDoc(textDocument);
        this.variables = (0, variables_1.parseVariables)(textDocument); //
        this.roles = (0, roles_1.getRolesForFile)(text);
        this.inventory_keys = (0, roles_1.getInventoryKeysForFile)(textDocument);
        this.blob_keys = (0, roles_1.getBlobKeysForFile)(textDocument);
        this.routes = (0, routeLabels_1.getRoutesInFile)(textDocument);
        this.signals = (0, signals_1.parseSignalsInFile)(textDocument);
        if (this.inZip) {
            this.words = [];
        }
        else {
            this.words = (0, words_1.parseWords)(textDocument);
        }
        this.loaded = true;
    }
    getVariableNames() {
        let arr = [];
        (0, console_1.debug)("Getting variable names");
        for (const v of this.variables) {
            const ci = {
                label: v.name,
                kind: vscode_languageserver_1.CompletionItemKind.Variable,
                //TODO: Check type of variable?
                labelDetails: { description: path.basename(this.uri) + ": var" },
                //detail: "From " + 
            };
            arr.push(ci);
        }
        const arrUniq = [...new Map(arr.map(v => [v.label, v])).values()];
        return arrUniq;
    }
    getWordLocations(check) {
        for (const word of this.words) {
            if (word.name === check) {
                return word.locations;
            }
        }
        return [];
    }
    getLabels() {
        return this.labelNames;
    }
    async awaitLoaded() {
        while (!this.loaded) {
            await (0, python_1.sleep)(50);
        }
        return;
    }
}
exports.MastFile = MastFile;
//# sourceMappingURL=MastFile.js.map