import { debug } from 'console';
import * as path from 'path';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { getCache } from './cache';
import { parseComments, parseStrings, parseYamls, isInString, isInComment, getMatchesForRegex, parseSquareBrackets, getComments, getStrings } from './tokens/comments';
import { checkLastLine, findDiagnostic } from './errorChecking';
import { checkLabels } from './tokens/labels';
import { ErrorInstance, getDocumentSettings } from './server';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkEnableRoutes } from './tokens/routeLabels';
import { URI } from 'vscode-uri';
import { fixFileName } from './fileFunctions';
import { compileMission } from './python';

let debugStrs : string = "";//Debug: ${workspaceFolder}\n";

let exclude: string[] = [];

export async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {

	if (textDocument.languageId === "json") {
		debug("THIS IS A JSON FILE");
		return [];
	}
	if (textDocument.languageId !== "mast") return[];
	const cache = getCache(textDocument.uri);
	const folder = path.dirname(URI.parse(textDocument.uri).fsPath);
	if (!exclude.includes(folder)) {
		cache.checkForInitFolder(folder).then((res)=>{
			if (res) {
				exclude.push(folder);
			}
		});
	}
	cache.updateFileInfo(textDocument);
	// In this simple example we get the settings for every validate run.
	let maxNumberOfProblems = 100;
	const settings = await getDocumentSettings(textDocument.uri);
	if (settings !== null) {
		maxNumberOfProblems = settings.maxNumberOfProblems;
	}
	// These all don't happen in cache.updateFileInfo() above, since this data is stored separately
	let squareBrackets = parseSquareBrackets(textDocument);
	let strs = parseStrings(textDocument);
	let comments = parseComments(textDocument);
	let yamls = parseYamls(textDocument);

	

	// The validator creates diagnostics for all uppercase words length 2 and more
	const text = textDocument.getText();
	
	//currentDocument = textDocument;
	const pattern = /\b[A-Z]{2,}\b/g;
	let m: RegExpExecArray | null;

	let problems = 0;
	let diagnostics: Diagnostic[] = [];
	let errorSources: ErrorInstance[] = [];

	// for (const s of getStrings(textDocument)) {
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

	// const mastCompilerErrors:string[] = await compileMission(textDocument.uri, textDocument.getText(), getCache(textDocument.uri).storyJson.sbslib);
	// debug(mastCompilerErrors);
	// .then((errors)=>{
	// 	debug(errors);
	// });
	// const functionSigs = checkFunctionSignatures(textDocument);
	// debug(functionSigs);
	// diagnostics = diagnostics.concat(functionSigs);

	// Checking string errors
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

	//checkForDuplicateLabelsInFile(textDocument);

	
	// For applicable diagnostics, check if they, or parts of them, are inside of a string or comment.
	// Some things should be checked after this. Other things should be checked before.
	// TODO: This doesn't appear to be working, e.g. enemy_taunt.mast
	diagnostics = diagnostics.filter((d)=>{
		const start = textDocument.offsetAt(d.range.start);
		const end = textDocument.offsetAt(d.range.end);
		const inStr = !isInString(textDocument, start) || !isInString(textDocument,end)
		const inCom = !isInComment(textDocument,start) || !isInComment(textDocument,end);
		return inStr || inCom;
	})

	let d = checkLastLine(textDocument);
	if (d !== undefined) {
		diagnostics.push(d);
	}

	for (const label of cache.getLabels(textDocument)) {
		for (const v of cache.getVariables(textDocument)) {
			if (label.name === v.name) {
				d = {
					range: v.range,
					message: "'" + v.name + "' is used as a label name. Don't override label names!",
					severity: DiagnosticSeverity.Error,
					source: "mast extension"
				}
				diagnostics.push(d);
			}
		}
	}
	
	const r = checkEnableRoutes(textDocument);
	diagnostics = diagnostics.concat(r);
	// return debugLabelValidation(textDocument);
	return diagnostics;
}

function debugLabelValidation(doc:TextDocument) : Diagnostic[]{
	const lbls = getCache(doc.uri).getLabels(doc);
	let diagnostics: Diagnostic[] = [];
	for (const l of lbls) {
		if (fixFileName(l.srcFile) !== fixFileName(doc.uri)) continue;
		for (const s of l.subLabels) {
			debug(s)
			let r: Range = {
				start: doc.positionAt(s.start),
				end: doc.positionAt(s.start + s.length)
			}
			let d: Diagnostic = {
				range: r,
				message: "This is a sublabel: " + s.name,
				severity: DiagnosticSeverity.Error,
				source: "mast extension"
			}
			diagnostics.push(d);
		}
	}
	return diagnostics;

}