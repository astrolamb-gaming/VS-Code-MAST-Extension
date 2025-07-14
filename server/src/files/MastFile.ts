import { debug } from 'console';
import * as fs from 'fs';
import * as path from 'path';
import { CompletionItem, CompletionItemKind, Location } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FileCache } from '../data';
import { LabelInfo, parseLabelsInFile } from '../tokens/labels';
import { parsePrefabs } from '../tokens/prefabs';
import { getRolesForFile, getInventoryKeysForFile } from '../tokens/roles';
import { Variable, parseVariables } from '../tokens/variables';
import { Word, parseWords } from '../tokens/words';
import { sleep } from '../python/python';
import { getRoutesInFile } from '../tokens/routeLabels';
import { parseSignalsInFile } from '../tokens/signals';


/**
 * Represents a mast file.
 * Contains all the information about that specific file, including its referenced
 * labels, variables, roles, and prefabs.
 */


export class MastFile extends FileCache {
	labelNames: LabelInfo[] = [];
	// TODO: Add support for holding label information for all files listed in __init__.mast in a given folder.
	// TODO: Add system for tracking variables in a mast file
	variables: Variable[] = [];
	routes: string[] = [];
	signals: string[] = [];
	roles: string[] = [];
	keys: string[] = [];
	prefabs: LabelInfo[] = [];
	words: Word[] = [];
	inZip: boolean = false;
	loaded: boolean = false;

	constructor(uri: string, fileContents: string = "") {
		//debug("building mast file");
		super(uri);

		if (path.extname(uri) === ".mast") {
			// If the contents are aleady read, we parse and move on. Don't need to read or parse again.
			if (fileContents !== "") {
				//debug("parsing, has contents");
				this.inZip = true;
				this.parse(fileContents);
				return;
			} else {
				fs.readFile(uri, "utf-8", (err, data) => {
					if (err) {
						debug("error reading file: " + uri + "\n" + err);
						throw err;
					} else {
						//debug("parsing, no error");
						this.parse(data);
					}
				});
			}
		} else if (path.extname(uri) === ".py") {
			// Shouldn't do anything, Py files are very different from mast
			debug("ERROR: Trying to parse a .py file as a .mast file: " + uri);
			// Send notification to client?
		}
	}

	// async asTextDocument(): Promise<TextDocument> {
	// 	let contents = await readFile(this.uri);
	// 	let doc: TextDocument = TextDocument.create(this.uri, path.extname(this.uri), 1, contents);
	// 	return doc;
	// }

	parse(text: string) {
		this.loaded = false;
		// debug("parsing mast file: " + this.uri)
		const textDocument: TextDocument = TextDocument.create(this.uri, "mast", 1, text);
		this.labelNames = parseLabelsInFile(text, this.uri);
		// debug(this.labelNames)
		this.prefabs = parsePrefabs(this.labelNames);
		// TODO: Parse variables, etc
		//this.variables = getVariableNamesInDoc(textDocument);
		this.variables = parseVariables(textDocument); //
		this.roles = getRolesForFile(text);
		this.keys = getInventoryKeysForFile(text);
		this.routes = getRoutesInFile(textDocument);
		this.signals = parseSignalsInFile(textDocument);
		if (this.inZip) {
			this.words = [];
		} else {
			this.words = parseWords(textDocument);
		}
		this.loaded = true;
	}

	getVariableNames() {
		let arr: CompletionItem[] = [];
		debug("Getting variable names");
		for (const v of this.variables) {
			const ci: CompletionItem = {
				label: v.name,
				kind: CompletionItemKind.Variable,
				//TODO: Check type of variable?
				labelDetails: { description: path.basename(this.uri) + ": var" },
				//detail: "From " + 
			};
			arr.push(ci);
		}
		const arrUniq = [...new Map(arr.map(v => [v.label, v])).values()];
		return arrUniq;
	}
	getWordLocations(check: string): Location[] {
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
		while(!this.loaded) {
			await sleep(50);
		}
		return;
	}
}
