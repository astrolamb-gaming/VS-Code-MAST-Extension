import { Position, Range, RenameParams, TextDocumentEdit, TextEdit, WorkspaceEdit } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { documents } from './../server';
import { getMainLabelAtPos } from './../tokens/labels';
import { getCache } from './../cache';
import { getTokenContextAtPosition } from './../tokens/comments';

const RENAMEABLE_TOKEN_TYPES = new Set([
	'variable',
	'label',
	'route-label',
	'media-label',
	'function',
	'method',
	'property'
]);

function isRenameableToken(token: { type: string; text?: string } | undefined): token is { type: string; text: string; line: number; character: number; length: number } {
	return !!token && RENAMEABLE_TOKEN_TYPES.has(token.type) && !!token.text?.trim();
}

function getTokenContextNearPosition(doc: TextDocument, position: Position) {
	const cache = getCache(doc.uri);
	const tokens = cache.getMastFile(doc.uri)?.tokens || [];
	let ctx = getTokenContextAtPosition(doc, tokens, position);
	const token = ctx.token;
	const isBoundaryOperator = token?.type === 'operator' && (
		token.text === ')' ||
		token.text === '(' ||
		token.text === ',' ||
		token.text === ':'
	);

	if (ctx.token && !isBoundaryOperator) {
		return ctx;
	}

	if (position.character > 0) {
		const prev = getTokenContextAtPosition(doc, tokens, {
			line: position.line,
			character: position.character - 1
		});
		if (prev.token && !(prev.token.type === 'operator')) {
			return prev;
		}
		if (!ctx.token) {
			ctx = prev;
		}
	}

	return ctx;
}

function getRenameTarget(doc: TextDocument, position: Position) {
	const cache = getCache(doc.uri);
	const tokens = cache.getMastFile(doc.uri)?.tokens || [];
	const ctx = getTokenContextNearPosition(doc, position);
	if (ctx.inComment || ctx.inString || ctx.inYaml || !isRenameableToken(ctx.token)) {
		return undefined;
	}

	const labels = cache.getLabels(doc, true);
	if (labels.length === 0) {
		return undefined;
	}

	const offset = doc.offsetAt(position);
	const label = getMainLabelAtPos(offset, labels);
	if (!label) {
		return undefined;
	}

	const token = ctx.token;
	const range: Range = {
		start: { line: token.line, character: token.character },
		end: { line: token.line, character: token.character + token.length }
	};

	return {
		label,
		token,
		range,
		tokens
	};
}

export function onPrepareRename(doc: TextDocument, position: Position): Range | undefined {
	return getRenameTarget(doc, position)?.range;
}

export async function onRenameRequest(params: RenameParams): Promise<WorkspaceEdit|undefined> {
	const uri = params.textDocument.uri;
	const doc = documents.get(uri);
	if (!doc) return;

	const target = getRenameTarget(doc, params.position);
	if (!target) {
		return;
	}

	const edits: TextEdit[] = [];
	for (const token of target.tokens) {
		if (token.type !== target.token.type || token.text !== target.token.text) {
			continue;
		}

		const startOffset = doc.offsetAt({ line: token.line, character: token.character });
		const endOffset = startOffset + token.length;
		if (startOffset < target.label.start || endOffset > target.label.end + 1) {
			continue;
		}

		edits.push({
			range: {
				start: { line: token.line, character: token.character },
				end: { line: token.line, character: token.character + token.length }
			},
			newText: params.newName
		});
	}

	if (edits.length === 0) {
		return;
	}

	const docEdit: TextDocumentEdit = {
		textDocument: { uri, version: null },
		edits
	};

	return {
		documentChanges: [docEdit]
	};
}