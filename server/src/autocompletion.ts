import { debug } from 'console';
import { CompletionItem, CompletionItemKind, integer, TextDocumentPositionParams } from 'vscode-languageserver';
import { getMainLabelAtPos } from './labels';
import { ClassTypings, getClassTypings, getPyTypings, getSupportedRoutes, labelNames } from './server';
import { TextDocument } from 'vscode-languageserver-textdocument';


export function onCompletion(_textDocumentPosition: TextDocumentPositionParams, text: TextDocument): CompletionItem[] {
	let ci : CompletionItem[] = [];
	const t = text?.getText();
	if (text === undefined) {
		debug("Document ref is undefined");
		return ci;
	}
	if (t === undefined) {
		debug("Document text is undefined");
		return ci;
	}
	// Calculate the position in the text's string value using the Position value.
	const pos : integer = text.offsetAt(_textDocumentPosition.position);
	const startOfLine : integer = pos - _textDocumentPosition.position.character;
	const iStr : string = t.substring(startOfLine,pos);
	//debug("" + startOfLine as string);
	//
	// debug(iStr);
	let items : string[] = [
		"sbs",
		"change_console",
		"MoreThings",
		"sbs.something",
		"sbs.target",
		"sbs.functions"
	]

	if(iStr.includes("//")) {
		let routes = getSupportedRoutes();
		for (const i in routes) {
			let r = routes[i].join("/").replace("*b","");
			if ((r + "//").includes(iStr.trim())) {
				ci.push({label: r, kind: CompletionItemKind.Event});
			}
		}
		return ci;
	}
	if (iStr.endsWith("-> ") || iStr.endsWith("jump ") || iStr.endsWith("task_schedule( ")) {
		for (const i in labelNames) {
			ci.push({label: labelNames[i].name, kind: CompletionItemKind.Event});
		}
		const lbl = getMainLabelAtPos(startOfLine,labelNames).subLabels;
		for (const i in lbl) {
			ci.push({label: lbl[i], kind: CompletionItemKind.Event});
		}
		return ci;
	}

	const ct: ClassTypings[] = getClassTypings();
	for (const i in ct) {
		if (iStr.endsWith(ct[i].name + ".")) {
			const cf: CompletionItem[] = ct[i].completionItems;
			for (const j in cf) {
				ci.push(cf[j]);
			}
		} else {
			ci.push(ct[i].classCompItem);
		}
		return ci;
	}

	items.forEach((i)=>{
		//ci.push({label: "sbs: #" + _textDocumentPosition.position.character, kind: CompletionItemKind.Text});
		if (i.indexOf(".")< _textDocumentPosition.position.character-1) {
			ci.push({label: i, kind: CompletionItemKind.Text});
		}
		
	});

	// completionStrings.forEach((i)=>{
	// 	if (i.indexOf(".")< _textDocumentPosition.position.character-1) {
	// 		ci.push({label: i, kind: CompletionItemKind.Text});
	// 	}
	// })

	

	ci = ci.concat(getPyTypings());
	return ci;
}