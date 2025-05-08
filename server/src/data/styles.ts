import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Get all the style string attributes, e.g. 'area' and 'tag'
 * @param file The uri of the file
 * @param text The contents of the file
 * @returns A list of all the style strings
 */
export function loadStyleDefs(file:string, text:string): string[] {
	let ret: string[] = [];
	if (file.endsWith("style.py") && file.includes("procedural")) {
		let pattern = /style_def\.get\([\"\'](.*)[\"\']\)/g;
		let m: RegExpExecArray | null;
		while (m = pattern.exec(text)) {
			ret.push(m[1]);
		}
	}
	return ret;
}