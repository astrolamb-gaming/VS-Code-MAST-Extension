import { debug } from 'console';
import { CompletionItem, CompletionItemKind, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import path = require('path');
import { fileFromUri, fixFileName } from '../fileFunctions';
import { isInComment } from './comments';
import { Word } from './words';

export function getRolesForFile(text: TextDocument): Word[] {
	let roles: Word[] = [];
	const regExpArr = [
		/role\([\"\'](.*?)[\"\']\)/g,							// string
		/all_roles\([\"\'](.*?)[\"\']\)/g, 				// comma-separated string
		/add_role\(.*?,[\t ]*[\"\'](.*?)[\"\']\)/g,			// id, string
		/any_role\([\"\'](.*?)[\"\']\)/g, 					// comma-separated string
		/has_role\(.*?,[\t ]*[\"\'](.*?)[\"\']\)/g,			// id, string
		/has_roles\(.*?,[\t ]*[\"\'](.*?)[\"\']\)/g,		// id, string
		/remove_role\(.*?,[\t ]*[\"\'](.*?)[\"\']\)/g	// id, string
	]
	for (const r of regExpArr) {
		const exp = getRolesForRegEx(r,text)
		roles = roles.concat(exp);
	}
	// Remove duplicates
	roles = mergeWordList(roles);
	return roles;
}

function getRolesForRegEx(re: RegExp, doc:TextDocument) : Word[] {
	let ret: Word[] = [];
	let m: RegExpExecArray | null;
	while (m = re.exec(doc.getText())) {
		if (m[1]!== undefined) {
			let str = m[1];
			let roles = str.split(",");
			for (let v of roles) {
				v = v.trim().toLowerCase();
				const start = m[0].indexOf(v) + m.index;
				const end = start + v.length;

				if (!isInComment(doc, m.index)) { //!isInString(doc, m.index) || 
					
					const range: Range = { start: doc.positionAt(start), end: doc.positionAt(end)}
					let found = false;
					for (const w of ret) {
						if (w.name === v) {
							w.locations.push({uri: fileFromUri(doc.uri), range: range});
							found = true;
							break;
						}
					}
					if (!found) {
						let var1: Word = {
							name: v,
							locations: [{
								uri: fileFromUri(doc.uri),
								range: range
							}]
						}
						ret.push(var1);
					}
				}
			}
		}
	}
	return ret;
}

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
			map.set(r.name, word);
		} else {
			map.set(r.name,r);
		}
	}
	return [...map.values()];
}

export function getInventoryKeysForFile(doc:TextDocument):Word[] {
	let regex:RegExp = /((((get|set|remove)_)?(shared_)?inventory_value)|(inventory_set))\([^,]*?,[ \t]*(?<val>([\"\']))([^\"\'\n\r]*)\k<val>,[ \t]*(.*)?\)/g;
	let m: RegExpExecArray | null;
	let ret: Word[]=[];
	while (m = regex.exec(doc.getText())) {
		if (m[9]!== undefined) {
			let v = m[9];
			const start = m[0].indexOf(v) + m.index;
			const end = start + v.length;
			v = v.trim().toLowerCase();
			if (!isInComment(doc, m.index)) { //!isInString(doc, m.index) || 
				const range: Range = { start: doc.positionAt(start), end: doc.positionAt(end)}
				let found = false;
				for (const w of ret) {
					if (w.name === v) {
						w.locations.push({uri: fileFromUri(doc.uri), range: range});
						found = true;
						break;
					}
				}
				if (!found) {
					let var1: Word = {
						name: v,
						locations: [{
							uri: fileFromUri(doc.uri),
							range: range
						}]
					}
					ret.push(var1);
				}
			}
		}
	}
	// filters out any duplicates
	// keys = [...new Set(keys)];
	ret = mergeWordList(ret);
	return ret;
}

export function getLinksForFile(doc:TextDocument): Word[] {

	// LInks that use the link name as the second argument.
	let regex:RegExp = /link((ed)?_to)?\(.*?,[ \t]*[\"\'](\w+)[\"\']/g;
	let m: RegExpExecArray | null;
	let ret: Word[]=[];
	while (m = regex.exec(doc.getText())) {
		if (m[3]!== undefined) {
			const v = m[3];
			const start = m[0].indexOf(v) + m.index;
			const end = start + v.length;
			if (!isInComment(doc, m.index)) { //!isInString(doc, m.index) || 
				const range: Range = { start: doc.positionAt(start), end: doc.positionAt(end)}
				let found = false;
				for (const w of ret) {
					if (w.name === v) {
						w.locations.push({uri: fileFromUri(doc.uri), range: range});
						found = true;
						break;
					}
				}
				if (!found) {
					let var1: Word = {
						name: v,
						locations: [{
							uri: fileFromUri(doc.uri),
							range: range
						}]
					}
					ret.push(var1);
				}
			}
		}
	}

	// Links that use the link name as the first argument
	regex = /(has_|\.remove_|\.add|\.get_dedicated_)?link(s_set)?(_to)?\([ \t]*[\"\'](\w+)[\"\']/g;
	while (m = regex.exec(doc.getText())) {
		if (m[3]!== undefined) {
			const v = m[4];
			const start = m[0].indexOf(v) + m.index;
			const end = start + v.length;
			if (!isInComment(doc, m.index)) { //!isInString(doc, m.index) || 
				const range: Range = { start: doc.positionAt(start), end: doc.positionAt(end)}
				let found = false;
				for (const w of ret) {
					if (w.name === v) {
						w.locations.push({uri: fileFromUri(doc.uri), range: range});
						found = true;
						break;
					}
				}
				if (!found) {
					let var1: Word = {
						name: v,
						locations: [{
							uri: fileFromUri(doc.uri),
							range: range
						}]
					}
					ret.push(var1);
				}
			}
		}
	}
	ret = mergeWordList(ret);
	return ret;
}

export function getBlobKeysForFile(doc:TextDocument) {
	let blob = /(data_set|blob)\.(get|set)\([\"\'](\w+)[\"\']/g;
	let data_set_value = /(get|set)_data_set_value\(.*,[ \t]*[\"\'](\w+)[\"\']/g;
	let m: RegExpExecArray|null;
	let ret: Word[] = [];
	while (m = blob.exec(doc.getText())) {
		const v = m[3];
		const start = m[0].indexOf(v) + m.index;
		const end = start + v.length;
		if (!isInComment(doc, m.index)) { //!isInString(doc, m.index) || 
			const range: Range = { start: doc.positionAt(start), end: doc.positionAt(end)}
			let found = false;
			for (const w of ret) {
				if (w.name === v) {
					w.locations.push({uri: fileFromUri(doc.uri), range: range});
					found = true;
					break;
				}
			}
			if (!found) {
				let var1: Word = {
					name: v,
					locations: [{
						uri: fileFromUri(doc.uri),
						range: range
					}]
				}
				ret.push(var1);
			}
		}
	}

	while (m = data_set_value.exec(doc.getText())) {
		const v = m[2];
		const start = m[0].indexOf(v) + m.index;
		const end = start + v.length;
		if (!isInComment(doc, m.index)) { //!isInString(doc, m.index) || 
			const range: Range = { start: doc.positionAt(start), end: doc.positionAt(end)}
			let found = false;
			for (const w of ret) {
				if (w.name === v) {
					w.locations.push({uri: fileFromUri(doc.uri), range: range});
					found = true;
					break;
				}
			}
			if (!found) {
				let var1: Word = {
					name: v,
					locations: [{
						uri: fileFromUri(doc.uri),
						range: range
					}]
				}
				ret.push(var1);
			}
		}
	}
	ret = mergeWordList(ret);
	return ret;
}