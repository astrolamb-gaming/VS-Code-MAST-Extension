import { CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';


export let variables: CompletionItem[] = [];
export function getVariableNamesInDoc(textDocument: TextDocument) {
	let vars: string[] = [];
	const variableRX = /^[\t ]*[a-zA-Z_]\w*[\t ]*(?==[^=])/gm;
	const text = textDocument.getText();
	let m: RegExpExecArray | null;
	while (m = variableRX.exec(text)) {
		const v = m[0].trim();
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