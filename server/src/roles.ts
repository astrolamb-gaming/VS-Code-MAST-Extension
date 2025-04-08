import { debug } from 'console';
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getGlobals } from './globals';
import path = require('path');
import { getFileContents, getFilesInDir } from './fileFunctions';

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
