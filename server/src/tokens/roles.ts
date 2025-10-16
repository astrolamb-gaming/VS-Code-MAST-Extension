import { debug } from 'console';
import { CompletionItem, CompletionItemKind, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getGlobals } from '../globals';
import path = require('path');
import { fileFromUri, getFileContents, getFilesInDir } from '../fileFunctions';
import { isInComment } from './comments';
import { Word } from './words';

export function getRolesForFile(text: string): string[] {
	let roles: string[] = [];
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
	roles = [...new Set(roles)];
	return roles;
}

function getRolesForRegEx(re: RegExp, text: string) : string[] {
	let roles: string[] = [];
	let m: RegExpExecArray | null;
	while (m = re.exec(text)) {
		const list = m[1].split(",");
		for (const i of list) {
			if (i !== "") {
				roles.push(i);
			}
		}
	}
	return roles;
}

export function getRolesAsCompletionItem(roles: string[]) {
	roles = [...new Set(roles)];
	const ci: CompletionItem[] = [];
	for (const r of roles) {
		const c: CompletionItem = {
			label: r,
			kind: CompletionItemKind.Text,
			labelDetails: {description: "Role"}
		}
		ci.push(c);
	}
	return ci;
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