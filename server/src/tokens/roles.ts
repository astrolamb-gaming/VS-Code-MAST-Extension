import { debug } from 'console';
import { CompletionItem, CompletionItemKind, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import path = require('path');
import { fileFromUri, fixFileName } from '../fileFunctions';
import { isInComment } from './comments';
import { Word } from './words';

/**
 * Convert a list of {@link Word Word}s to a list of {@link CompletionItem CompletionItem}s
 * @param type The type of word, e.g. `Role`, `Inventory Key`, etc.
 * @param roles The list of {@link Word Word}s
 * @param doc The {@link TextDocument TextDocument} of the current file.
 * @returns A list of {@link CompletionItem CompletionItem}s
 */
export function getWordsAsCompletionItems(type:string, roles: Word[], doc:TextDocument) {
	roles = mergeWordList(roles);
	const ci: CompletionItem[] = [];
	for (const r of roles) {
		if (r.name === "#") continue;
		let filter = r.name;
		let deets = type;
		for (const loc of r.locations) {
			if (fixFileName(doc.uri)===fixFileName(loc.uri)) {
				// hashtag takes priority over underscore for sorting
				filter = "###" + r.name;
				deets = type + " (this file)";
				break;
			} else if (path.dirname(fixFileName(doc.uri)) === path.dirname(fixFileName(loc.uri))) {
				filter = "##" + r.name;
				deets = type + " (this folder)";
			}
		}
		const c: CompletionItem = {
			label: r.name,
			kind: CompletionItemKind.Text,
			labelDetails: {description: deets},
			sortText: filter
		}
		if (r.description) {
			c.documentation = r.description;
		}
		ci.push(c);
	}
	return ci;
}
/**
 * Merge a list of {@link Word Word}. Could be roles, inventory keys, blob keys, or links, or regular "words".
 * @param roles 
 * @returns 
 */
function mergeWordList(roles:Word[]):Word[] {
	let map:Map<string,Word> = new Map();
	for (let r of roles) {
		let word = map.get(r.name);
		if (word) {
			word.locations = word.locations.concat(r.locations);
			if (!word.description && r.description) {
				word.description = r.description;
			}
			map.set(r.name, word);
		} else {
			map.set(r.name,r);
		}
	}
	return [...map.values()];
}
