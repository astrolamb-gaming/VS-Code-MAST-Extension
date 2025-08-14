import { HandlerResult, RenameParams, TextDocumentEdit, TextEdit, WorkspaceEdit } from 'vscode-languageserver';
import { getCurrentLineFromTextDocument, getHoveredSymbol } from './hover';
import { documents } from './../server';
import { getLabelLocation, getMainLabelAtPos } from './../tokens/labels';
import { getCache } from './../cache';

export function onRenameRequest(params: RenameParams): HandlerResult<WorkspaceEdit | null | undefined, void> {
	let uri = params.textDocument.uri
	let symbol_pos = params.position;
	let doc = documents.get(uri);
	if (!doc) return;
	let line = getCurrentLineFromTextDocument(symbol_pos, doc);
	let replace = getHoveredSymbol(line, symbol_pos.character);

	// Get the current label
	let mains = getCache(uri).getLabels(doc, true);
	let label = getMainLabelAtPos(doc.offsetAt(symbol_pos), mains);
	// if (!label) return;
	let labelContents = doc.getText().substring(label.start, label.end);

	let find = new RegExp(replace);

	let edits: TextEdit[] = [];

	let m: RegExpExecArray|null;
	while (m = find.exec(labelContents)) {
		const te: TextEdit = {
			range: {
				start: doc.positionAt(m.index),
				end: doc.positionAt(m[0].length+m.index)
			},
			newText: params.newName
		}
		edits.push(te);
	}

	
	// let docEdit: TextDocumentEdit = {
	// 	textDocument: {uri: uri, version: 1},
	// 	edits: edits
	// }
	let ret: WorkspaceEdit = {
		changes: {
			uri: edits
		}
	}
	return ret;
}