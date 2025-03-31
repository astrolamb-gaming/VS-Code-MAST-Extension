import { debug } from 'console';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { getCache } from './cache';
import { getSquareBrackets, getComments, getStrings, getYamls, isInString, isInComment, getMatchesForRegex } from './comments';
import { checkLastLine, findDiagnostic } from './errorChecking';
import { checkLabels } from './labels';
import { ErrorInstance, getDocumentSettings } from './server';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkEnableRoutes } from './routeLabels';

let debugStrs : string = "";//Debug: ${workspaceFolder}\n";

export async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
	if (textDocument.languageId === "json") {
		// TODO: Add autocompletion for story.json
		debug("THIS IS A JSON FILE");
		return [];
	}
	getCache(textDocument.uri).updateLabels(textDocument);
	//debug("Validating document");
	// In this simple example we get the settings for every validate run.
	let maxNumberOfProblems = 100;
	const settings = await getDocumentSettings(textDocument.uri);
	if (settings !== null) {
		maxNumberOfProblems = settings.maxNumberOfProblems;
	}
	getSquareBrackets(textDocument);
	let strs = getStrings(textDocument);
	let comments = getComments(textDocument);
	getYamls(textDocument);

	// The validator creates diagnostics for all uppercase words length 2 and more
	const text = textDocument.getText();
	
	//currentDocument = textDocument;
	const pattern = /\b[A-Z]{2,}\b/g;
	let m: RegExpExecArray | null;

	let problems = 0;
	let diagnostics: Diagnostic[] = [];
	let errorSources: ErrorInstance[] = [];

	// for (const s of comments) {
	// 	let r: Range = {
	// 		start: textDocument.positionAt(s.start),
	// 		end: textDocument.positionAt(s.end)
	// 	}
	// 	let d: Diagnostic = {
	// 		range: r,
	// 		message: 'start: ' + s.start + ", end: " + s.end
	// 	}
	// 	diagnostics.push(d);
	// }
	// return diagnostics;
	let e1: ErrorInstance = {
		pattern: /(^(=|-){2,}[ \t]*([0-9A-Za-z _]+?)[ \t]*(-|=)[ \t]*([0-9A-Za-z _]+?)(=|-){2,})/gm,
		severity: DiagnosticSeverity.Error,
		message: "Label Definition: Cannot use '-' or '=' inside label name.",
		source: "sbs",
		relatedMessage: "Only A-Z, a-z, 0-9, and _ are allowed to be used in a label name."
	};
	errorSources.push(e1);
	e1 = {
		pattern: /^[\w ][^+][^\"][\w\(\) ]+?\/\//g,
		severity: DiagnosticSeverity.Error,
		message: "Route labels can only be at the start of a line, unless used as label that runs when button is pressed.",
		source: "sbs",
		relatedMessage: "See https://artemis-sbs.github.io/sbs_utils/mast/routes/ for more details on routes."
	}
	e1 = {
		pattern: /\b[A-Z]{2,}\b/g,
		severity: DiagnosticSeverity.Information,
		source: "mast",
		message: "CAPS " + debugStrs,
		relatedMessage: "Is all caps intentional?"
	}
	e1 = {
		pattern: /\w+\.($|\n)/gs,
		severity: DiagnosticSeverity.Error,
		source: "mast",
		message: "Property for object not specified.",
		relatedMessage: ""
	}
	errorSources.push(e1);
	for (let i = 0; i < errorSources.length; i++) {
		let d1: Diagnostic[] = findDiagnostic(errorSources[i].pattern,textDocument,errorSources[i].severity,errorSources[i].message,errorSources[i].source, errorSources[i].relatedMessage, maxNumberOfProblems,problems);
		diagnostics = diagnostics.concat(d1);
	}
	//let d1: Diagnostic[] = findDiagnostic(pattern, textDocument, DiagnosticSeverity.Error, "Message", "Source", "Testing", settings.maxNumberOfProblems, 0);
	//diagnostics = diagnostics.concat(d1);

	try {
		let d1 = checkLabels(textDocument);
		diagnostics = diagnostics.concat(d1);
	} catch (e) {
		debug(e);
		debug("Couldn't get labels?");
	}

	const mastCompilerErrors:string[] = [];
	// compileMission(textDocument.uri, textDocument.getText(), getCache(textDocument.uri).storyJson.sbslib).then((errors)=>{
	// 	debug(errors);
	// });
	// const functionSigs = checkFunctionSignatures(textDocument);
	// debug(functionSigs);
	// diagnostics = diagnostics.concat(functionSigs);

	
	let fstring = /\".*\{.*\}.*\"/g;
	let interior = /{.*\".*\".*}/g;
	while (m = fstring.exec(text)) {
		let ints = getMatchesForRegex(interior,m[0]);
		for (const i of ints) {
			let str = text.substring(m.index + i.start,m.index + i.end);
			let start = str.indexOf("\"");
			let end = str.indexOf("\"",start+1)+1;
			if (end === 0) { end = start+1 }
			let r: Range = {
				start: textDocument.positionAt(m.index + i.start + start),
				end: textDocument.positionAt(m.index + i.start + end)
			}
			let d: Diagnostic = {
				range: r,
				message: "Cannot use double quotes inside of an f-string that is encompassed by double quotes",
				severity: DiagnosticSeverity.Error,
				source: "mast extension"
			}
			diagnostics.push(d);
		}
	}
	fstring = /\'.*?\{.*?\}.*?\'/g;
	interior = /\{.*?\'.*?\'.*?\}/g;
	while (m = fstring.exec(text)) {
		let ints = getMatchesForRegex(interior,m[0]);
		for (const i of ints) {
			let str = text.substring(m.index + i.start,m.index + i.end);
			let start = str.indexOf("\'");
			let end = str.indexOf("\'",start+1)+1;
			if (end === 0) { end = start+1 }
			let r: Range = {
				start: textDocument.positionAt(m.index + i.start + start),
				end: textDocument.positionAt(m.index + i.start + end)
			}
			let d: Diagnostic = {
				range: r,
				message: "Cannot use single quotes inside of an f-string that is encompassed by single quotes",
				severity: DiagnosticSeverity.Error,
				source: "mast extension"
			}
			diagnostics.push(d);
		}
	}

	const d = checkLastLine(textDocument);
	if (d !== undefined) {
		diagnostics.push(d);
	}

	diagnostics = diagnostics.filter((d)=>{
		const start = textDocument.offsetAt(d.range.start);
		const end = textDocument.offsetAt(d.range.end);
		return isInString(start) || isInString(end) || isInComment(start) || isInComment(end);
	})
	
	debug("Checking enabled routes")
	const r = checkEnableRoutes(textDocument);
	debug(r)
	diagnostics = diagnostics.concat(r);

	return diagnostics;
}