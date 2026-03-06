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

		// Remove comments
		let comments: CRange[] = getMatchesForRegex(/^[ \t]*#.*$/gm, text);
		for (const c of comments) {
			text = replaceRegexMatchWithUnderscore(text, c);
		}

		//if (!source.endsWith("timers.py")) return;
		// super.parseVariables(text); We don't actually want to look for variable names in python files
		// Instead of just assuming that there is always another class following, it could be a function, so we need to account for this.
		let blockStart: RegExp = /^(class|def) .+?$/gm;
		//const parentClass: RegExp = /\(\w*?\):/
		let comment: RegExp = /((\"){3,3}(.*?)(\"){3,3})|(\.\.\.)/m;
		let checkText: string;
		let blockIndices: integer[] = [];
		let m: RegExpExecArray | null;

		const doc: TextDocument = TextDocument.create(this.uri, "py", 1, text);
		this.words = parseWords(doc);
		this.roles = getRolesForFile(doc);
		// debug(this.uri.replace("c:/Users/mholderbaum/Documents/Cosmos/Cosmos-1-1-3/data/missions/",""))
		this.signals = parseSignalsInFile(doc);
		this.inventory_keys = getInventoryKeysForFile(doc);
		this.blob_keys = getBlobKeysForFile(doc);
		this.links = getLinksForFile(doc);
		// debug(this.signals)
		// Iterate over all classes to get their indices
		//classIndices.push(0);
		while (m = blockStart.exec(text)) {
			blockIndices.push(m.index);
			//debug("" + m.index + ": " +m[0]);
		}
		blockIndices.push(text.length - 1);

		let len = blockIndices.length; // How many indices there are - NOT the same as number of classes (should be # of classes - 1)




		// Here we go over all the indices and get all functions between the last index (or 0) and the current index.
		// So if the file doesn't start with a class definition, all function prior to a class definition are added to the default functions
		// while class functions are addded to a ClassObject object.
		for (let i = 0; i < len; i++) {
			let t: string;
			let start = blockIndices[0];
			if (i === 0) {
				t = text.substring(0, start);
			} else {
				start = blockIndices[i - 1];
				t = text.substring(start, blockIndices[i]);
			}

			if (t.startsWith("class")) {
				const co = new ClassObject(t, this.uri);
				co.startPos = start + t.indexOf(co.name);
				const r: Range = {
					start: doc.positionAt(co.startPos),
					end: doc.positionAt(co.startPos + co.name.length)
				};
				co.location = {
					uri: this.uri,
					range: r
				};
				// Since sbs functions aren't part of a class, but do need a "sbs." prefix, we pretend sbs is its own class. 
				// PyFile handles that.
				if (co.name === "") {
					this.defaultFunctions = co.methods;
					for (const m of co.methods) {
						m.startIndex = start + t.indexOf("def " + m.name) + 4;
						m.location = {
							uri: this.uri,
							range: {
								start: doc.positionAt(m.startIndex),
								end: doc.positionAt(m.startIndex + m.name.length)
							}
						};
					}
				} else {
					// Only add to class list if it's actually a class (or sbs)
					if (co.methods.length !== 0) {
						this.classes.push(co);
					} else {
						// debug(co.name + " has no methods...")
					}
					// move the location of the method to use the start of the method's NAME instead of def...
					for (const m of co.methods) {
						m.startIndex = start + t.indexOf("def " + m.name) + 4;
						m.location = {
							uri: this.uri,
							range: {
								start: doc.positionAt(m.startIndex),
								end: doc.positionAt(m.startIndex + m.name.length)
							}
						};
					}
					//debug(co);
				}
			} else if (t.startsWith("def")) {
				// if (source.includes("sbs.py")) debug("TYRING ANOTHER SBS FUNCTION"); debug(source);
				const m = new Function(t, "", this.uri);
				m.startIndex = start + t.indexOf("def " + m.name) + 4;
				m.location = {
					uri: this.uri,
					range: {
						start: doc.positionAt(m.startIndex),
						end: doc.positionAt(m.startIndex + m.name.length)
					}
				};
				this.defaultFunctions.push(m);
			}
			// if (this.uri.endsWith("ship_data.py")) {
			// 	debug(this.defaultFunctions)
			// }
		}


		/**
		 * This refers to MAST globals, NOT extension globals
		 */
		let globalRegEx = /MastGlobals\.import_python_module\((["']([\w_\.]+)["'])(,[ \t]['"](\w+)['"])?\)/g;
		// Here we find all the instances of import_python_module() in the file.
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
