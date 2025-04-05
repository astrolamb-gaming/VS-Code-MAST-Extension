import { Range, TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticRelatedInformation, DiagnosticSeverity, integer } from 'vscode-languageserver/node';
import {hasDiagnosticRelatedInformationCapability} from './server';
import { debug } from 'console';
import { getComments, getStrings, isInComment, isInString, isInYaml, replaceRegexMatchWithUnderscore } from './comments';

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
	const arr: string[] = text.split("\n");
	//const lastLine = text.substring(lastLinePos);
	const lastLine = arr[arr.length-1];
	if (lastLine !== "") {
		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Error,
			range: {
				start: textDocument.positionAt(text.length - lastLine.length),
				end: textDocument.positionAt(text.length)
			},
			message: "MAST Compiler Error: File must end with an empty line.",
			source: "MAST Compiler "+ __filename
		};
		return diagnostic
	}
	return undefined;
}

export function findDiagnostic(pattern: RegExp, textDocument: TextDocument, severity: DiagnosticSeverity, message: string, source: string, relatedInfo: string, maxProblems: integer, problems: integer): Diagnostic[] {
	let text = textDocument.getText();
	const commentsStrings = getComments(textDocument).concat(getStrings(textDocument));
	for (const c of commentsStrings) {
		text = replaceRegexMatchWithUnderscore(text,c)
	}
	
	
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

interface FunctionInstance {
	name: string,
	start: integer,
	end: integer
}

/**
 * TODO: get this check system working
 * @param text String containing contents of document
 */
export function checkFunctionSignatures(textDocument: TextDocument) : Diagnostic[] {
	const text = textDocument.getText();
	debug("Starting function signature checking")
	const diagnostics : Diagnostic[] = [];

	const functionRegex: RegExp = /(\w+)\(.*(\n|$)/gm;
	const singleFunc: RegExp = /(\w+)\(/g;
	let m: RegExpExecArray | null;
	// Iterate over all lines that contain at least one function
	while (m = functionRegex.exec(text)) {
		const functions: FunctionInstance[] = [];
		const line = m[0];
		if (isInComment(m.index)) continue;
		if (isInString(m.index) && !isInYaml(m.index)) continue;
		const functionName = line.match(singleFunc);
		debug(functionName)
		let end = line.lastIndexOf(")");
		if (functionName !== null) {
			// debug(functionName);
			for (const fname of functionName) {
				const fi: FunctionInstance = {
					name: fname,
					start: m.index + line.indexOf(fname),
					end: line.lastIndexOf(")")
				}
				functions.push(fi);
				
				debug("Name: " + fname);
			}
		}
		
		end = line.lastIndexOf(")");
		let func = line.substring(0,end+1);
		debug(func);
		//debug(m);
		debug(line);
		
	}

	return diagnostics;
}