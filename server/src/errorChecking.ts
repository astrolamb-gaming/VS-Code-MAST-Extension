import { Range, TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticRelatedInformation, DiagnosticSeverity, integer } from 'vscode-languageserver/node';
import {hasDiagnosticRelatedInformationCapability} from './server';
import { debug } from 'console';

/**
 * Checks if the file ends with an empty line.
 * @param textDocument 
 * @returns 
 */
export function checkLastLine(textDocument: TextDocument): Diagnostic | undefined {
	const text = textDocument.getText();
	textDocument.lineCount
	const lastLinePos = textDocument.offsetAt({
		line: textDocument.lineCount - 1,
		character: 0
	});
	const lastLine = text.substring(lastLinePos);
	if (lastLine !== "") {
		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Error,
			range: {
				start: textDocument.positionAt(lastLinePos),
				end: textDocument.positionAt(lastLinePos + lastLine.length)
			},
			message: "MAST Compiler Error: File must end with an empty line.",
			source: "MAST Compiler "+ __filename
		};
		return diagnostic
	}
	return undefined;
}

export function findDiagnostic(pattern: RegExp, textDocument: TextDocument, severity: DiagnosticSeverity, message: string, source: string, relatedInfo: string, maxProblems: integer, problems: integer): Diagnostic[] {
	const text = textDocument.getText();
	
	let m: RegExpExecArray | null;
	const diagnostics: Diagnostic[] = [];
	while ((m = pattern.exec(text)) && problems < maxProblems) {
		//debug(JSON.stringify(m));
		problems++;
		const diagnostic: Diagnostic = {
			severity: severity,
			range: {
				start: textDocument.positionAt(m.index),
				end: textDocument.positionAt(m.index + m[0].length)
			},
			message: message,
			source: source
		};

		if (hasDiagnosticRelatedInformationCapability) {
			diagnostic.relatedInformation = [
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnostic.range)
					},
					message: relatedInfo
				}
			];
		}
		diagnostics.push(diagnostic);
	}
	return diagnostics;
}



export function relatedMessage(t: TextDocument, range: Range, rm: string): DiagnosticRelatedInformation[] | undefined {
	if (hasDiagnosticRelatedInformationCapability) {
		const dri: DiagnosticRelatedInformation[] = [
			{
				location: {
					uri: t.uri,
					range: Object.assign({}, range)
				},
				message: rm
			}
		];
		return dri;
	}
	return undefined;
}