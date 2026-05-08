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
// legacy role/blob/inventory/link scanners replaced by token-based extractors
import { extractBlobKeysFromPythonFile, extractInventoryKeysFromPythonFile, extractLinksFromPythonFile, extractRolesFromPythonFile, extractSignalsFromPythonFile, tokenizePythonFile } from '../tokens/pythonStringExtractor';
import { PythonLexer } from '../data/pythonLexer';
import { Token } from '../tokens/tokenBasedExtractor';


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
	pyTokens: Token[] = [];
	globals: string[][] = [];
	isGlobal: boolean = false;
	globalAlias: string = "";
	private globalAliasApplied: boolean = false;
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
		this.pyTokens = [];
		// Reset parsed global exports/imports so incremental reparses do not
		// accumulate stale entries from previous file versions.
		this.globalFiles = [];
		this.globals = [];
		this.globalAliasApplied = false;
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
		this.pyTokens = tokens;
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

		let findMastGlobals = /class\s+MastGlobals:.*?globals\s*=\s*{(.*?)}/ms;
		let n = text.match(findMastGlobals);
		// debug(n);
		const parsedGlobals = new Map<string, string>();
		if (n !== null) {
			const globalsBlock = n[1].replace(/#.*/g, "");
			const globalEntryRegEx = /["']([\w]+)["'][\t ]*:[\t ]*([^,\n}]+)/g;
			let g: RegExpExecArray | null;
			while (g = globalEntryRegEx.exec(globalsBlock)) {
				const globalRef = g[1];
				const globalVar = g[2].trim();
				if (globalVar.includes("__build_class__")) continue; // This is a special Python thing that we don't need to worry about.
				parsedGlobals.set(globalRef, globalVar);
			}
		}

		// Support imperative global alias declarations like:
		// MastGlobals.globals["some_global_name"] = some_function_name
		// The RHS symbol is resolved later against known parsed functions.
		const globalAssignRegEx = /MastGlobals\.globals\s*\[\s*["']([A-Za-z_]\w*)["']\s*\]\s*=\s*([A-Za-z_]\w*)/g;
		let ga: RegExpExecArray | null;
		while ((ga = globalAssignRegEx.exec(text)) !== null) {
			parsedGlobals.set(ga[1], ga[2]);
		}

		if (parsedGlobals.size > 0) {
			this.globals = Array.from(parsedGlobals.entries()).map(([globalRef, globalVar]) => [globalRef, globalVar]);
		}


		// debug("asClasses stuff...")
		for (const o of asClasses) {
			if (path.basename(this.uri).replace(".py", "") === o) {
				const c = new ClassObject("", path.basename(this.uri));
				c.name = o;
				c.methods = this.defaultFunctions.map((func) => {
					const copy = func.copy();
					copy.className = c.name;
					return copy;
				});
				this.classes.push(c);

				this.defaultFunctions = [];
			}
		}

		if (this.isGlobal && this.globalAlias !== "") {
			this.applyImportedGlobalAlias();
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

	/**
	 * Lightweight re-parse for onDidChangeContent edits.
	 * Refreshes only the token-based extracted items (roles, signals, blob_keys, etc.)
	 * without re-running PythonLexer or MastGlobals regex scanning.
	 * Use this for library files (sbs_utils) where the class/function structure
	 * does not change during an editing session, so the expensive initial parse
	 * result from load time can stay intact.
	 */
	parseTokensOnly(text: string) {
		this.variableNames = [];
		this.pyTokens = [];

		// Comment-mask just for the token extractor so string positions stay valid
		const comments: CRange[] = getMatchesForRegex(/^[ \t]*#.*$/gm, text);
		let maskedText = text;
		for (const c of comments) {
			maskedText = replaceRegexMatchWithUnderscore(maskedText, c);
		}

		const doc = TextDocument.create(this.uri, "py", 1, maskedText);
		const tokens = tokenizePythonFile(doc);
		this.pyTokens = tokens;
		this.roles = extractRolesFromPythonFile(doc, tokens);
		this.blob_keys = extractBlobKeysFromPythonFile(doc, tokens);
		this.inventory_keys = extractInventoryKeysFromPythonFile(doc, tokens);
		this.links = extractLinksFromPythonFile(doc, tokens);
		this.signals = extractSignalsFromPythonFile(doc, tokens);
	}

	getDefaultMethodCompletionItems(): CompletionItem[] {
		let ci: CompletionItem[] = [];
		for (const f of this.defaultFunctions) {
			ci.push(f.buildCompletionItem());
		}
		return ci;
	}

	applyImportedGlobalAlias(createPrefixedFunctions: boolean = true): void {
		if (this.globalAliasApplied || this.globalAlias === "") {
			return;
		}

		const aliasClass = new ClassObject("", path.basename(this.uri));
		aliasClass.name = this.globalAlias;
		aliasClass.methods = this.defaultFunctions.map((func) => {
			const copy = func.copy();
			copy.className = aliasClass.name;
			return copy;
		});
		this.classes.push(aliasClass);

		if (createPrefixedFunctions) {
			const prefixedDefaults: Function[] = [];
			for (const func of this.defaultFunctions) {
				const copy = func.copy();
				copy.name = `${this.globalAlias}_${copy.name}`;
				prefixedDefaults.push(copy);
			}
			this.defaultFunctions = prefixedDefaults;
		}
		this.globalAliasApplied = true;
	}
}
