import { debug } from 'console';
import { CompletionItem, CompletionItemKind, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getGlobals } from '../globals';
import path = require('path');
import { fileFromUri, fixFileName, getFileContents, getFilesInDir } from '../fileFunctions';
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
	roles = mergeRoles(roles);
	return roles;
}

function getRolesForRegEx(re: RegExp, doc:TextDocument) : Word[] {
	let ret: Word[] = [];
	let m: RegExpExecArray | null;
	while (m = re.exec(doc.getText())) {
		// const list = m[1].split(",");
		// for (const i of list) {
		// 	if (i !== "") {
		// 		roles.push(i);
		// 	}
		// }
		if (m[1]!== undefined) {
			let str = m[1];
			let roles = str.split(",");
			for (let v of roles) {
				v = v.trim();
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

export function getRolesAsCompletionItem(roles: Word[], doc:TextDocument) {
	roles = mergeRoles(roles);
	const ci: CompletionItem[] = [];
	for (const r of roles) {
		let filter = r.name;
		let deets = "Role";
		for (const loc of r.locations) {
			if (fixFileName(doc.uri)===fixFileName(loc.uri)) {
				filter = "###" + r.name;
				deets = "Role (used in this file)";
				break;
			} else if (path.dirname(fixFileName(doc.uri)) === path.dirname(fixFileName(loc.uri))) {
				filter = "##" + r.name;
				deets = "Role (used in this folder)";
				break;
			}
		}
		if (r.name === "#") {
			filter = "_" + r.name;
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
function mergeRoles(roles:Word[]):Word[] {
	let map:Map<string,Word> = new Map();
	for (const r of roles) {
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
			const v = m[9];
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
	// filters out any duplicates
	// keys = [...new Set(keys)];
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
	return ret;
}

export function getKeysAsCompletionItem(keys: Word[]) {
	// keys = [...new Set(keys)];
	const ci: CompletionItem[] = [];
	for (const r of keys) {
		const c: CompletionItem = {
			label: r.name,
			kind: CompletionItemKind.Text,
			labelDetails: {description: "Inventory Key"}
		}
		ci.push(c);
	}
	return ci;
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
	return ret;
}