import { debug } from 'console';
import * as fs from 'fs';
import * as path from 'path';
import { CompletionItem, CompletionItemKind, Location } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { FileCache } from '../data';
import { LabelInfo, parseLabelsInFile } from '../tokens/labels';
import { parsePrefabs } from '../tokens/prefabs';
// role/inventory/blob/link helpers replaced by token-driven extractedItems
import { Variable, parseVariables } from '../tokens/variables';
import { Word, convertWordFileLocationToLocations, parseWords } from '../tokens/words';
import { fileFromUri } from '../fileFunctions';
import { sleep } from '../python/python';
import { getRoutesInFile } from '../tokens/routeLabels';
import { parseSignalsInFile, SignalInfo } from '../tokens/signals';
import { extractRolesFromMastFile, extractSignalsFromMastFile, extractInventoryKeysFromMastFile, extractBlobKeysFromMastFile, extractLinksFromMastFile, tokenizeMastFile, tokenizeMastSlice } from '../tokens/mastStringExtractor';
import { Token } from '../tokens/tokenBasedExtractor';

export interface ExtractedItem {
	kind: 'role' | 'link' | 'inventory' | 'blob' | 'signal';
	value: string;
	tokenIndex: number;
	line: number;
	character: number;
	length: number;
}


/**
 * Represents a mast file.
 * Contains all the information about that specific file, including its referenced
 * labels, variables, roles, and prefabs.
 */


export class MastFile extends FileCache {

	// current token stream for this file (used by token-based extractors)
	tokens: Token[] = [];
	// last parsed raw text
	lastText: string | undefined = undefined;

	// Unified extracted items (incremental source-of-truth)
	extractedItems: ExtractedItem[] = [];

	labelNames: LabelInfo[] = [];
	// TODO: Add support for holding label information for all files listed in __init__.mast in a given folder.
	// TODO: Add system for tracking variables in a mast file
	variables: Variable[] = [];
	routes: string[] = [];
	signals: SignalInfo[] = [];
	roles: Word[] = [];
	inventory_keys: Word[] = [];
	blob_keys: Word[] = [];
	links: Word[] = [];
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
		// Tokenize once and reuse tokens for all token-based extractors
		const tokens = tokenizeMastFile(textDocument);
		this.tokens = tokens;
		this.lastText = text;

		// build extracted items (roles etc.) from token stream
		this.extractedItems = this.buildExtractedItems(tokens, textDocument);
		// maintain legacy roles array for compatibility
		this.roles = this.extractedItems.filter(i => i.kind === 'role').map(i => ({ name: i.value, locations: [{ uri: this.uri, range: { start: { line: i.line, character: i.character }, end: { line: i.line, character: i.character + i.length } } }] } as any));

		// Parse labels and prefabs (labels rely on raw text parsing)
		this.labelNames = parseLabelsInFile(text, this.uri);
		this.prefabs = parsePrefabs(this.labelNames);

		// Parse variables
		this.variables = parseVariables(textDocument);

		// Parse routes
		this.routes = getRoutesInFile(textDocument);

		// Parse framework strings using token-based extractors (reuse tokens)
		this.roles = extractRolesFromMastFile(textDocument, tokens);
		this.blob_keys = extractBlobKeysFromMastFile(textDocument, tokens);
		this.inventory_keys = extractInventoryKeysFromMastFile(textDocument, tokens);
		if (this.uri.includes("gamemaster")) {
			debug(tokens);
			debug("Inventory keys");
			debug(this.inventory_keys)
			debug(this.roles)
			debug(this.links)
		}
		
		this.links = extractLinksFromMastFile(textDocument, tokens);
		this.signals = extractSignalsFromMastFile(textDocument, tokens);

		// Parse words
		this.words = [];// parseWords(textDocument);
		this.loaded = true;
	}

	/**
	 * Build unified extracted items (roles/links/etc.) from token stream.
	 */
	private buildExtractedItems(tokens: Token[], doc: TextDocument): ExtractedItem[] {
		const items: ExtractedItem[] = [];
		function extractStringValue(tokenText: string): string {
			let value = tokenText.trim();
			value = value.replace(/^[furbFURB]+(?=["'])/, '');
			if ((value.startsWith('"""') && value.endsWith('"""')) || (value.startsWith("'''") && value.endsWith("'''"))) {
				return value.slice(3, -3);
			}
			if (value.startsWith('"""')) {
				value = value.slice(3);
			} else if (value.startsWith("'''")) {
				value = value.slice(3);
			} else if (value.startsWith('"') || value.startsWith("'")) {
				value = value.slice(1);
			}
			if (value.endsWith('"""')) {
				value = value.slice(0, -3);
			} else if (value.endsWith("'''")) {
				value = value.slice(0, -3);
			} else if (value.endsWith('"') || value.endsWith("'")) {
				value = value.slice(0, -1);
			}
			return value;
		}

		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			if (token.type === 'function' || token.type === 'method') {
				const name = token.text.toLowerCase();
				if (/(_|^)role(s)?(_|$)/.test(name) || name.includes('role')) {
					let j = i + 1;
					while (j < tokens.length && !(tokens[j].type === 'operator' && tokens[j].text === '(')) j++;
					if (j >= tokens.length) continue;
					let parenDepth = 1;
					for (let k = j + 1; k < tokens.length; k++) {
						const tk = tokens[k];
						if (tk.type === 'operator') {
							if (tk.text === '(') { parenDepth++; continue; }
							if (tk.text === ')') { parenDepth--; if (parenDepth === 0) break; continue; }
						}
						if (parenDepth === 1 && tk.type === 'string') {
							const values = extractStringValue(tk.text)
								.split(',')
								.map(v => v.trim())
								.filter(Boolean);
							for (const val of values) {
								items.push({ kind: 'role', value: val, tokenIndex: k, line: tk.line, character: tk.character, length: tk.length });
							}
						}
					}
				}
			}
		}

		return items;
	}

	/**
	 * Incrementally update token stream and derived data based on the changed document text.
	 * If we don't have a previous text snapshot, falls back to full parse.
	 */
	updateFromDocument(doc: TextDocument) {
		const newText = doc.getText();
		if (this.lastText === undefined) {
			this.parse(newText);
			return;
		}
		if (newText === this.lastText) return;

		const oldText = this.lastText;
		const oldLen = oldText.length;
		const newLen = newText.length;
		let start = 0;
		const minLen = Math.min(oldLen, newLen);
		while (start < minLen && oldText[start] === newText[start]) start++;
		let endOld = oldLen - 1;
		let endNew = newLen - 1;
		while (endOld >= start && endNew >= start && oldText[endOld] === newText[endNew]) {
			endOld--;
			endNew--;
		}

		// compute line boundaries to re-tokenize whole affected lines
		const sliceStartLine = doc.positionAt(start).line;
		const sliceEndLine = doc.positionAt(Math.max(endNew, start)).line;
		const sliceStartOffset = doc.offsetAt({ line: sliceStartLine, character: 0 });
		let sliceEndOffset: number;
		if (sliceEndLine + 1 >= doc.lineCount) {
			sliceEndOffset = newText.length;
		} else {
			sliceEndOffset = doc.offsetAt({ line: sliceEndLine + 1, character: 0 });
		}

		// tokenize affected slice and map lines back to document
		const newSliceTokens = tokenizeMastSlice(doc, sliceStartOffset, sliceEndOffset);

		// Determine old slice line boundaries using lastText
		const lastDoc = TextDocument.create(this.uri, 'mast', 0, oldText);
		const oldSliceStartLine = lastDoc.positionAt(start).line;
		const oldSliceEndLine = lastDoc.positionAt(Math.max(endOld, start)).line;

		// Build new token list by keeping tokens outside old slice and inserting newSliceTokens
		const before: Token[] = [];
		const after: Token[] = [];
		for (const t of this.tokens) {
			if (t.line < oldSliceStartLine) {
				before.push(t);
			} else if (t.line > oldSliceEndLine) {
				after.push(t);
			}
		}

		// compute line delta to shift 'after' tokens
		const oldCount = oldSliceEndLine - oldSliceStartLine + 1;
		const newCount = sliceEndLine - sliceStartLine + 1;
		const delta = newCount - oldCount;
		if (delta !== 0) {
			for (const t of after) {
				t.line = t.line + delta;
			}
		}

		this.tokens = before.concat(newSliceTokens).concat(after);
		this.tokens.sort((a, b) => (a.line - b.line) || (a.character - b.character));

		// Rebuild extracted items from updated token stream
		this.extractedItems = this.buildExtractedItems(this.tokens, doc);
		this.roles = this.extractedItems.filter(i => i.kind === 'role').map(i => ({ name: i.value, locations: [{ uri: this.uri, range: { start: { line: i.line, character: i.character }, end: { line: i.line, character: i.character + i.length } } }] } as any));
		// Keep other token-based arrays for now using existing extractors
		this.blob_keys = extractBlobKeysFromMastFile(doc, this.tokens);
		this.inventory_keys = extractInventoryKeysFromMastFile(doc, this.tokens);
		this.links = extractLinksFromMastFile(doc, this.tokens);
		this.signals = extractSignalsFromMastFile(doc, this.tokens);
		debug("Inventory keys");
		debug(this.inventory_keys)
		debug(this.roles)
		debug(this.links)

		// For labels and variables, parse from full text to remain correct
		this.labelNames = parseLabelsInFile(newText, this.uri);
		this.prefabs = parsePrefabs(this.labelNames);
		this.variables = parseVariables(doc);
		this.words = [];// parseWords(doc);

		this.lastText = newText;
		this.loaded = true;
	}

	/** Return Location[] for a given role name (case-insensitive) */
	getRoleLocations(roleName: string) {
		const locs: any[] = [];
		if (!roleName) return locs;
		const nameLower = roleName.toLowerCase();
		for (const it of this.extractedItems) {
			if (it.kind === 'role' && it.value.toLowerCase() === nameLower) {
				locs.push({ uri: fileFromUri(this.uri), range: { start: { line: it.line, character: it.character }, end: { line: it.line, character: it.character + it.length } } });
			}
		}
		return locs;
	}

	/** Return Word[] style objects for all roles in this file (merged by name) */
	getRolesAsWords() : Word[] {
		const map: Map<string, Word> = new Map();
		for (const it of this.extractedItems) {
			if (it.kind !== 'role') continue;
			const key = it.value.toLowerCase();
			const loc = { uri: fileFromUri(this.uri), range: { start: { line: it.line, character: it.character }, end: { line: it.line, character: it.character + it.length } } };
			const existing = map.get(key);
			if (existing) {
				for (const loc of existing.locations) {
					if (loc.uri === fileFromUri(this.uri)) {
						loc.ranges.push({ start: { line: it.line, character: it.character }, end: { line: it.line, character: it.character + it.length } });
						break;
					}
				}
				existing.locations.push({uri: loc.uri, ranges: [loc.range]});
			} else {
				map.set(key, { name: key, locations: [{uri: loc.uri, ranges: [loc.range]}] });
			}
		}
		return Array.from(map.values());
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
		let locs: Location[] = [];
		for (const word of this.words) {
			if (word.name === check) {
				for (const loc of word.locations) {
					if (loc.uri === fileFromUri(this.uri)) {
						locs.push(...convertWordFileLocationToLocations(loc));
					}
				}
				return locs;
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
