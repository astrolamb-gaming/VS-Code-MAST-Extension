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
	roles: string[] = [];
	keys: string[] = [];
	prefabs: LabelInfo[] = [];
	words: Word[] = [];

	constructor(uri: string, fileContents: string = "") {
		//debug("building mast file");
		super(uri);

		if (path.extname(uri) === ".mast") {
			// If the contents are aleady read, we parse and move on. Don't need to read or parse again.
			if (fileContents !== "") {
				//debug("parsing, has contents");
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

	parse(text: string) {
		// debug("parsing mast file: " + this.uri)
		const textDocument: TextDocument = TextDocument.create(this.uri, "mast", 1, text);
		this.labelNames = parseLabelsInFile(text, this.uri);
		this.prefabs = parsePrefabs(this.labelNames);
		// TODO: Parse variables, etc
		//this.variables = getVariableNamesInDoc(textDocument);
		this.variables = parseVariables(textDocument); //
		this.roles = getRolesForFile(text);
		this.keys = getInventoryKeysForFile(text);
		this.words = parseWords(textDocument);
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

}
