import { debug } from 'console';
import * as fs from 'fs';
import * as path from 'path';
import { integer, Range, CompletionItem } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FileCache, asClasses, prepend } from '../data';
import { ClassObject, getRegExMatch } from '../data/class';
import { Function } from '../data/function';
import { fixFileName } from '../fileFunctions';
import { Word, parseWords } from '../tokens/words';
import { parseSignalsInFile, SignalInfo } from '../tokens/signals';
import { CRange, getMatchesForRegex, replaceRegexMatchWithUnderscore } from '../tokens/comments';
import { getBlobKeysForFile, getInventoryKeysForFile, getLinksForFile, getRolesForFile } from '../tokens/roles';
import { extractBlobKeysFromPythonFile, extractInventoryKeysFromPythonFile, extractLinksFromPythonFile, extractRolesFromPythonFile, extractSignalsFromPythonFile, tokenizePythonFile } from '../tokens/pythonStringExtractor';
import { PythonLexer } from '../data/pythonLexer';


export class PyFile extends FileCache {
	defaultFunctions: Function[] = [];
	classes: ClassObject[] = [];
	words: Word[] = [];
	roles: Word[] = [];
	globalFiles: string[][] = [];
	signals: SignalInfo[] = [];
	inventory_keys: Word[] = [];
	links:Word[] = [];
	blob_keys: Word[] = [];
	globals: string[][] = [];
	isGlobal: boolean = false;
	constructor(uri: string, fileContents: string = "") {
		// if (fileContents === "") debug("pyFile Contents empty for " + uri)
		uri = fixFileName(uri);
		super(uri);
		// If fileContents is NOT an empty string (e.g. if it's from a zipped folder), then all we do is parse the contents
		if (path.extname(uri) === ".py") {
			// If file contents are included, we don't need to read, just go straight to parsing
			if (fileContents !== "") {
				this.parseWholeFile(fileContents);
			} else {
				if (uri.includes("builtin.py")) return;
				//debug("File contents empty, so we need to load it.");
				fs.readFile(uri, "utf-8", (err, data) => {
					if (err) {
						debug("error reading file: " + uri + "\n" + err);
					} else {
						this.parseWholeFile(data);
					}
				});
			}
		} else if (path.extname(uri) === ".mast") {
			debug("Can't build a MastFile from PyFile");
			// Shouldn't do anything, Py files are very different from mast
		}
	}

	parseWholeFile(text: string) {
		// Gotta clear old data
		this.classes = [];
		this.defaultFunctions = [];
		this.variableNames = [];
		const originalText = text;

		// Remove comments
		let comments: CRange[] = getMatchesForRegex(/^[ \t]*#.*$/gm, text);
		for (const c of comments) {
			text = replaceRegexMatchWithUnderscore(text, c);
		}

		const doc: TextDocument = TextDocument.create(this.uri, "py", 1, text);
		const structureDoc: TextDocument = TextDocument.create(this.uri, "py", 1, originalText);

		// Extract MAST framework strings using token-based extractor (lightweight)
		const tokens = tokenizePythonFile(doc);
		this.roles = extractRolesFromPythonFile(doc, tokens);
		this.blob_keys = extractBlobKeysFromPythonFile(doc, tokens);
		this.inventory_keys = extractInventoryKeysFromPythonFile(doc, tokens);
		this.links = extractLinksFromPythonFile(doc, tokens);
		this.signals = extractSignalsFromPythonFile(doc, tokens);

		// Parse Python structure using PythonLexer (only for reasonably-sized files)
		try {
			// Use unmodified source so indentation/comment layout is preserved for class/method parsing
			const pythonLexer = new PythonLexer(structureDoc);
			const { classes, functions } = pythonLexer.parse();

			// PythonLexer now returns ClassObject and Function directly - no conversion needed!
			this.classes = classes;
			this.defaultFunctions = functions;
			
			if (this.uri.includes("inventory")) {
				debug(`Parsed ${classes.length} classes and ${functions.length} functions in ${this.uri}`);
				debug(classes)
				debug(functions)
			}
		} catch (e) {
			// If PythonLexer fails, continue without class/function info
			debug("PythonLexer error for " + this.uri + ": " + e);
		}

		/**
		 * This refers to MAST globals, NOT extension globals
		 */
		let globalRegEx = /MastGlobals\.import_python_module\((["']([\w_\.]+)["'])(,[ \t]['"](\w+)['"])?\)/g;
		// Here we find all the instances of import_python_module() in the file.
		let m: RegExpExecArray | null;
		while (m = globalRegEx.exec(text)) {
			// debug(m[0])
			let mod = m[2];
			let name = m[4];
			let g = [mod];
			if (name === undefined) {
				name = "";
			}
			g.push(name);
			// debug("Globals added:")
			// debug(g)
			this.globalFiles.push(g);
		}
		// debug("GLOBALS")
		// debug(this.globals);

		let findMastGlobals = /class MastGlobals:.*?globals = {(.*?)}/ms;
		let n = text.match(findMastGlobals);
		// debug(n);
		if (n !== null) {
			const globals = n[1].split("\n");
			const newGlobals: string[][] = [];
			// debug("NOT NULL")
			for (let g of globals) {
				if (g.trim().startsWith("#")) continue;
				g = g.replace(/#.*/, "");
				// debug(g)
				let arr = g.match(/[\"']([\w]+)[\"'][\t ]*:[\t ]*(.*?)[,#\n]/);
				// debug(arr);
				if (arr !== null) {
					const globalRef = arr[1];
					const globalVar = arr[2];
					// debug("GlobalRef: " + globalRef)
					// debug("GlobalVar: " + globalVar)
					if (globalVar.includes("scatter") || globalVar.includes("faces") || globalVar.includes("__build_class__")) continue; // This leaves scatter and faces out of it. These are already parsed anyway. Also __build_class__ probably doesn't need exposed to the user.
					newGlobals.push([globalRef,globalVar]);
				}
			}
			// debug(newGlobals);
			this.globals = newGlobals;
			// debug("^^^ GLOBALS!")
		}


		// debug("asClasses stuff...")
		for (const o of asClasses) {
			if (path.basename(this.uri).replace(".py", "") === o) {
				const c = new ClassObject("", path.basename(this.uri));
				c.name = o;
				c.methods = this.defaultFunctions;
				this.classes.push(c);
				if (c.name !== "scatter") {
					this.defaultFunctions = [];
				} else {
					// debug(this.defaultFunctions);
					// debug(c.methods);
				}
			}
		}

		// // This checks if the module name should be prepended to the function names in this module
		// let prefix = "";
		// for (const o of prepend) {
		// 	if (path.basename(this.uri).replace(".py", "") === o) {
		// 		prefix = o + "_"; //o.replace(".py","_");
		// 		const newDefaults: Function[] = [];
		// 		for (const m of this.defaultFunctions) {
		// 			// const n = Object.assign({},m);
		// 			const n = m.copy();
		// 			n.name = prefix + n.name;
		// 			newDefaults.push(n);
		// 		}
		// 		this.defaultFunctions = newDefaults;
		// 		if (o === "scatter") {
		// 			debug(this.defaultFunctions);
		// 		}
		// 	}

		// }
		// Looks good here
		// debug(this.defaultFunctions)
	}

	getDefaultMethodCompletionItems(): CompletionItem[] {
		let ci: CompletionItem[] = [];
		for (const f of this.defaultFunctions) {
			ci.push(f.buildCompletionItem());
		}
		return ci;
	}
}
