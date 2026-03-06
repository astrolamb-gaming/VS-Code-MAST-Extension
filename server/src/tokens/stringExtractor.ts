import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range, Location } from 'vscode-languageserver';
import { fileFromUri } from '../fileFunctions';
import { isInComment } from './comments';
import { Word } from './words';
import { SignalInfo } from './signals';

/**
 * Configuration for extracting specific string patterns from code
 */
interface ExtractionPattern {
	/** Name of the pattern (e.g., 'role', 'signal') */
	name: string;
	/** Regex patterns to match function calls */
	patterns: RegExp[];
	/** Which capture group contains the string value */
	captureGroup: number;
	/** Whether the string can contain comma-separated values */
	allowCommaSeparated?: boolean;
	/** Whether to normalize to lowercase */
	normalizeCase?: boolean;
}

/**
 * Result of string extraction
 */
export interface ExtractedStrings {
	roles: Word[];
	signals: SignalInfo[];
	inventoryKeys: Word[];
	blobKeys: Word[];
	links: Word[];
}

/**
 * Comprehensive string extractor for MAST framework constructs
 * Works with both Python and MAST files
 */
export class StringExtractor {
	private doc: TextDocument;
	private text: string;

	constructor(document: TextDocument) {
		this.doc = document;
		this.text = document.getText();
	}

	/**
	 * Extract all MAST framework strings from the document
	 */
	public extractAll(): ExtractedStrings {
		return {
			roles: this.extractRoles(),
			signals: this.extractSignals(),
			inventoryKeys: this.extractInventoryKeys(),
			blobKeys: this.extractBlobKeys(),
			links: this.extractLinks()
		};
	}

	/**
	 * Extract role strings from add_role(), has_role(), etc.
	 */
	public extractRoles(): Word[] {
		const patterns: ExtractionPattern[] = [
			{
				name: 'role',
				patterns: [
					/role\([\"\'](.*?)[\"\']\)/g,
					/all_roles\([\"\'](.*?)[\"\']\)/g,
					/add_role\(.*?,[\t ]*[\"\'](.*?)[\"\']\)/g,
					/any_role\([\"\'](.*?)[\"\']\)/g,
					/has_role\(.*?,[\t ]*[\"\'](.*?)[\"\']\)/g,
					/has_roles\(.*?,[\t ]*[\"\'](.*?)[\"\']\)/g,
					/remove_role\(.*?,[\t ]*[\"\'](.*?)[\"\']\)/g
				],
				captureGroup: 1,
				allowCommaSeparated: true,
				normalizeCase: true
			}
		];

		return this.extractByPatterns(patterns[0]);
	}

	/**
	 * Extract signal strings and track emit vs trigger usage
	 */
	public extractSignals(): SignalInfo[] {
		const signalMap = new Map<string, SignalInfo>();

		// Pattern for signal_emit() calls
		const emitPattern = /signal_emit\([\"'](\w+)[\"'](,.*?)?\)/g;
		let m: RegExpExecArray | null;

		while ((m = emitPattern.exec(this.text)) !== null) {
			if (m[1] && !isInComment(this.doc, m.index)) {
				const signalName = m[1];
				const start = m.index + m[0].indexOf(signalName);
				const location = this.createLocation(start, signalName.length);

				let signal = signalMap.get(signalName);
				if (!signal) {
					signal = {
						name: signalName,
						emit: [],
						triggered: []
					};
					signalMap.set(signalName, signal);
				}
				signal.emit.push(location);
			}
		}

		// Pattern for route labels: //signal/name or //shared/signal/name
		const routePattern = /\/\/(shared\/)?signal\/([\w\/]+)/g;
		while ((m = routePattern.exec(this.text)) !== null) {
			if (m[2] && !isInComment(this.doc, m.index)) {
				const signalName = m[2].replace(/\//g, '_');
				const start = m.index + m[0].indexOf(m[2]);
				const location = this.createLocation(start, m[2].length);

				let signal = signalMap.get(signalName);
				if (!signal) {
					signal = {
						name: signalName,
						emit: [],
						triggered: []
					};
					signalMap.set(signalName, signal);
				}
				signal.emit.push(location);
			}
		}

		// Pattern for 'on signal name' triggers
		const triggerPattern = /on signal (\w+)/g;
		while ((m = triggerPattern.exec(this.text)) !== null) {
			if (m[1] && !isInComment(this.doc, m.index)) {
				const signalName = m[1];
				const start = m.index + m[0].indexOf(signalName);
				const location = this.createLocation(start, signalName.length);

				let signal = signalMap.get(signalName);
				if (!signal) {
					signal = {
						name: signalName,
						emit: [],
						triggered: []
					};
					signalMap.set(signalName, signal);
				}
				signal.triggered.push(location);
			}
		}

		return Array.from(signalMap.values());
	}

	/**
	 * Extract inventory key strings from get_inventory_value(), set_inventory_value(), etc.
	 */
	public extractInventoryKeys(): Word[] {
		const pattern: ExtractionPattern = {
			name: 'inventory_key',
			patterns: [
				/((((get|set|remove)_)?(shared_)?inventory_value)|(inventory_set))\([^,]*?,[ \t]*(?<val>([\"\']))([^\"\'\n\r]*)\k<val>,[ \t]*(.*)?\)/g
			],
			captureGroup: 9,
			normalizeCase: true
		};

		return this.extractByPatterns(pattern);
	}

	/**
	 * Extract blob/dataset key strings from get_blob_value(), set_blob_value(), etc.
	 */
	public extractBlobKeys(): Word[] {
		const pattern: ExtractionPattern = {
			name: 'blob_key',
			patterns: [
				/((get|set|remove)_blob_value)\([^,]*?,[ \t]*(?<val>([\"\']))([^\"\'\n\r]*)\k<val>,[ \t]*(.*)?\)/g,
				/((get|set|remove)_data_set_value)\([^,]*?,[ \t]*(?<val>([\"\']))([^\"\'\n\r]*)\k<val>,[ \t]*(.*)?\)/g
			],
			captureGroup: 4,
			normalizeCase: true
		};

		return this.extractByPatterns(pattern);
	}

	/**
	 * Extract link strings from link(), linked_to(), has_link(), etc.
	 */
	public extractLinks(): Word[] {
		const words: Word[] = [];

		// Links with name as second argument: link(obj, "name")
		const pattern1 = /link((ed)?_to)?\(.*?,[ \t]*[\"\'](\w+)[\"\']/g;
		let m: RegExpExecArray | null;

		while ((m = pattern1.exec(this.text)) !== null) {
			if (m[3] && !isInComment(this.doc, m.index)) {
				const linkName = m[3];
				const start = m.index + m[0].indexOf(linkName);
				this.addWord(words, linkName, start, linkName.length);
			}
		}

		// Links with name as first argument: has_link("name"), .add_link("name")
		const pattern2 = /(has_|\.remove_|\.add_?|\.get_dedicated_)?link(s_set)?(_to)?\([ \t]*[\"\'](\w+)[\"\']/g;
		while ((m = pattern2.exec(this.text)) !== null) {
			if (m[4] && !isInComment(this.doc, m.index)) {
				const linkName = m[4];
				const start = m.index + m[0].indexOf(linkName);
				this.addWord(words, linkName, start, linkName.length);
			}
		}

		return this.mergeWords(words);
	}

	/**
	 * Generic extraction by pattern configuration
	 */
	private extractByPatterns(config: ExtractionPattern): Word[] {
		const words: Word[] = [];

		for (const pattern of config.patterns) {
			let m: RegExpExecArray | null;
			
			while ((m = pattern.exec(this.text)) !== null) {
				const value = m[config.captureGroup];
				if (!value || isInComment(this.doc, m.index)) continue;

				if (config.allowCommaSeparated) {
					// Split by comma and process each value
					const values = value.split(',');
					for (let val of values) {
						val = val.trim();
						if (config.normalizeCase) {
							val = val.toLowerCase();
						}
						const start = m.index + m[0].indexOf(val);
						this.addWord(words, val, start, val.length);
					}
				} else {
					let val = value.trim();
					if (config.normalizeCase) {
						val = val.toLowerCase();
					}
					const start = m.index + m[0].indexOf(value);
					this.addWord(words, val, start, value.length);
				}
			}
		}

		return this.mergeWords(words);
	}

	/**
	 * Add a word to the list or update existing entry
	 */
	private addWord(words: Word[], name: string, start: number, length: number): void {
		const location = this.createLocation(start, length);

		for (const word of words) {
			if (word.name === name) {
				word.locations.push(location);
				return;
			}
		}

		words.push({
			name,
			locations: [location]
		});
	}

	/**
	 * Merge duplicate words
	 */
	private mergeWords(words: Word[]): Word[] {
		const map = new Map<string, Word>();
		
		for (const word of words) {
			const existing = map.get(word.name);
			if (existing) {
				existing.locations.push(...word.locations);
			} else {
				map.set(word.name, word);
			}
		}

		return Array.from(map.values());
	}

	/**
	 * Create a Location object
	 */
	private createLocation(start: number, length: number): Location {
		const range: Range = {
			start: this.doc.positionAt(start),
			end: this.doc.positionAt(start + length)
		};

		return {
			uri: fileFromUri(this.doc.uri),
			range
		};
	}
}

/**
 * Convenience function to extract all strings from a document
 */
export function extractStringsFromDocument(doc: TextDocument): ExtractedStrings {
	const extractor = new StringExtractor(doc);
	return extractor.extractAll();
}

/**
 * Compatibility helper; signals are already in SignalInfo format.
 */
export function convertToSignalInfo(signals: SignalInfo[]): SignalInfo[] {
	return signals;
}
