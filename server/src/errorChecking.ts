import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, integer } from 'vscode-languageserver/node';
import { debug } from './fileFunctions';
import {hasDiagnosticRelatedInformationCapability} from './server';

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

/**
 * 
 * @param textDocument 
 * @returns array of all defined labels in the current document
 */
function getLabels(textDocument: TextDocument): string[] {
	const definedLabel : RegExp = /(^(=|-){2,}([0-9A-Za-z _]+?)(=|-){2,})/gm
	let m: RegExpExecArray | null;
	const text = textDocument.getText();
	const labels : string[] = [];
	labels.push("END");
	debug("Iterating over defined labels");
	while (m = definedLabel.exec(text)) {
		const str = m[0].replace(/(=|-)/g,"").trim();
		debug(str);
		labels.push(str);
	}
	return labels
}

export function checkLabels(textDocument: TextDocument) : Diagnostic[] {
	const text = textDocument.getText();
	const diagnostics : Diagnostic[] = [];
	const calledLabel : RegExp = /(^ *?-> *?[0-9A-Za-z_]{1,})|(^ *?jump *?[0-9A-Za-z_]{1,})/gm;
	let m: RegExpExecArray | null;
	const labels : string[] = getLabels(textDocument);
	debug("Iterating over called labels");
	while (m = calledLabel.exec(text)) {
		const str = m[0].replace(/(->)|(jump )/g,"").trim();
		debug(str);
		let found: boolean = false;
		for (const label in labels) {
			if (str === labels[label]) {
				found = true;
			}
		}
		if (!found) {
			const d: Diagnostic = {
				range: {
					start: textDocument.positionAt(m.index),
					end: textDocument.positionAt(m.index + m[0].length)
				},
				severity: DiagnosticSeverity.Error,
				message: "Specified label does not exist. Define this label before use.",
				source: "mast"
			}
			if (hasDiagnosticRelatedInformationCapability) {
				d.relatedInformation = [
					{
						location: {
							uri: textDocument.uri,
							range: Object.assign({}, d.range)
						},
						message: "Labels must be defined in a format beginning and ending with two or more = or - signs. They may use A-Z, a-z, 0-9, and _ in their names. Other characters are not allowed."
					}
				];
			}
			diagnostics.push(d);
		}
	}
	
	const diagnostic = {
		severity: DiagnosticSeverity.Error,
		source: "mast",
		message: "Specified label does not exist",
		relatedMessage: "Define this label before use."
	}
	return diagnostics;
}