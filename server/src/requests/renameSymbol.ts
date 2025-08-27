import { HandlerResult, RenameParams, TextDocumentEdit, TextEdit, WorkspaceEdit } from 'vscode-languageserver';
import { getCurrentLineFromTextDocument, getHoveredSymbol } from './hover';
import { documents } from './../server';
import { getLabelLocation, getMainLabelAtPos } from './../tokens/labels';
import { getCache } from './../cache';
import { debug } from 'console';

export async function onRenameRequest(params: RenameParams): Promise<WorkspaceEdit|undefined> {
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
	
	let find = new RegExp(replace, "g");

	let edits: TextEdit[] = [];

	let m: RegExpExecArray|null;
	let count = 0;
	while (m = find.exec(labelContents)) {
		const te: TextEdit = {
			range: {
				start: doc.positionAt(m.index + label.start),
				end: doc.positionAt(m[0].length+m.index+label.start)
			},
			newText: params.newName
		}
		edits.push(te);
	}

	
	let docEdit: TextDocumentEdit = {
		textDocument: {uri: uri, version: null}, // We're just gonna mock the version...
		edits: edits
	}
	let ret: WorkspaceEdit = {
		documentChanges: [docEdit]
	}
	return ret;
}