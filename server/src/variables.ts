import { CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

// TODO: Add these to autocomplete and hover
const variableModifiers: string[][] = [
	["default", "`Default` means that if the variable is not already defined, define it. Otherwise, skip. So it does not overwrite if it exists."],
	["shared","variables with this modifier are used by the server and all clients"],
	["assigned",""],
	["client","Variables with the `client` modifier are only used by the client."],
	["temp",""]
]

export let variables: CompletionItem[] = [];
export function getVariableNamesInDoc(textDocument: TextDocument) {
	let vars: string[] = [];
	const variableRX = /^[\t ]*(default[ \t]+)?((shared|assigned|client|temp)\s+)?[a-zA-Z_]\w*[\t ]*(?==[^=])/gm;
	const text = textDocument.getText();
	let m: RegExpExecArray | null;
	while (m = variableRX.exec(text)) {
		const v = m[0].replace(/(shared|assigned|client|temp|default)/g,"").trim();
		//debug(m[0])
		if (!vars.includes(v)) {
			vars.push(v);
		}
	}
	vars = [...new Set(vars)];
	return vars;
}
export function getVariablesAsCompletionItem(vars: string[]) {
	const arr: CompletionItem[] = [];
	for (const v of vars) {
		const ci: CompletionItem = {
			label: v,
			kind: CompletionItemKind.Variable,
			//TODO: Check type of variable?
			labelDetails: {description: "var"}
		}
		arr.push(ci);
	}
	variables = arr;
	return arr;
} 