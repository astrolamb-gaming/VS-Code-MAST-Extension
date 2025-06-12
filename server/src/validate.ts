import { debug } from 'console';
import * as path from 'path';
import { Diagnostic, DiagnosticRelatedInformation, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { getCache } from './cache';
import { parseComments, parseStrings, parseYamls, isInString, isInComment, getMatchesForRegex, parseSquareBrackets, getComments, getStrings, isInYaml } from './tokens/comments';
import { checkLastLine, findDiagnostic } from './errorChecking';
import { checkLabels } from './tokens/labels';
import { ErrorInstance, getDocumentSettings, hasDiagnosticRelatedInformationCapability } from './server';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkEnableRoutes } from './tokens/routeLabels';
import { URI } from 'vscode-uri';
import { fixFileName } from './fileFunctions';
import { compileMission } from './python/python';

let debugStrs : string = "";//Debug: ${workspaceFolder}\n";

let exclude: string[] = [];
/*
let errorMessage = "\nError: {error}\nat {file_name} Line {line_no} {line}\n{basedir}\n\n";
let errorRX = /\nError: (.*)\nat (.*) Line (\d+) (.*)\n(.*)\n\n/;
let exceptionMessage = "\nException: {error}\nat {file_name} Line {line_no} {line}\n{basedir}\n\n";
let exceptErrRX = /\nException: (.*)\nat (.*) Line (\d+) (.*)\n(.*)\n]n/;
let exception = "\nException: {e}";
let exceptRX = /\nException: (.*)/;
*/
let errorOrExcept = /(Error|Exception):(.*)/;
let errorInfo = /at (.*) Line (\d+) - '(.*)'/;
let moduleRx = /module[ \t](.*)/;

export async function compileMastFile(textDocument: TextDocument): Promise<Diagnostic[]> {
	debug("Starting mast compile")
	let ret: Diagnostic[] = [];
	let cm: string[] = await compileMission(textDocument.uri, textDocument.getText(), getCache(textDocument.uri).storyJson)
	debug(cm);
	let ma: RegExpMatchArray | null;
	for (const e of cm) {
		// let 
		let m = e.replace(/\\n/g,"\n").replace(/\\'/g,"\'")
		m = m.replace(/\(\<string\>\, line 1\)/g,"");
		const lines = m.split("\n");
		let errorText: string = "";
		let errType: string = "";
		let errFile: string = "";
		let lineNum = 0;
		let lineContents = "";
		let module = ""
		let chr = 0;
		if (lines.length > 5) {
			ma = lines[1].match(errorOrExcept);
			if (ma !== null) {
				errType = ma[1];
				errorText  = ma[2].trim();
			}
			ma = lines[2].match(errorInfo);
			if (ma !== null) {
				errFile = ma[1];
				lineNum = parseFloat(ma[2]) - 1;
				lineContents = ma[3];
				debug(lines[2]);
				debug(lineContents);
				
				let sPos = {line: lineNum, character: 0};
				debug(sPos);
				debug(textDocument.offsetAt(sPos));
				let ePos = {line: lineNum + 1, character: 0};
				debug(ePos);
				let e = textDocument.offsetAt(ePos)-1;
				debug(e);
				let fileLine = textDocument.getText().substring(textDocument.offsetAt(sPos),e);
				debug(fileLine);
				chr = fileLine.indexOf(lineContents);
				debug(chr);
			}
			ma = lines[3].match(moduleRx);
			if (ma !== null) {
				if (ma[1] !== "None") {
					module = ma[1];
				}
			} 
			let message = errorText + "  in:\n`" + lineContents + "`\n";
			let endPos = textDocument.positionAt(textDocument.offsetAt({line: lineNum+1, character: 0})-1);
			const r: Range = {
				start: {line: lineNum, character: chr},
				end: endPos
			}
			const d: Diagnostic = {
				range: r,
				message: message,
				severity: DiagnosticSeverity.Error,
				source: "MAST Compiler " + errType
			}
			if (hasDiagnosticRelatedInformationCapability) {
				d.relatedInformation = [
					{
						location: {
							uri: textDocument.uri,
							range: Object.assign({}, d.range)
						},
						message: lines[1]
					}
				];
			}
			debug(d);
			ret.push(d);
		}

		
	}
	debug(ret);
	// TODO: Parse string into diagnostic
	return ret;
}

export async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
	if (textDocument.languageId === "py") {
		getCache(textDocument.uri).updateFileInfo(textDocument);
		return [];
	}

	if (textDocument.languageId === "json") {
		debug("THIS IS A JSON FILE");
		return [];
	}
	if (textDocument.languageId !== "mast") return[];
	let problems = 0;
	let diagnostics: Diagnostic[] = [];
	let errorSources: ErrorInstance[] = [];

	
	// const functionSigs = checkFunctionSignatures(textDocument);
	// debug(functionSigs);
	// diagnostics = diagnostics.concat(functionSigs);


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

	

	// for (const s of getComments(textDocument)) {
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

	let with_colon: ErrorInstance = {
		pattern: /^[ \t]*(((with|if|elif|while|for|on[ \t]+(change)?)[\t ]+)|(else))[^:]*?$/gm,
		severity: DiagnosticSeverity.Error,
		source: 'mast',
		message: 'Statement must end with a colon.',
		relatedMessage: "Applies to: 'with', 'if', 'elif', 'else', 'while', 'for', 'on', and 'on change' blocks."
	}
	// errorSources.push(with_colon);

	let gui_colon: ErrorInstance = {
		pattern: /gui\w*?\(\".*?:.*?\"\)/,
		severity: DiagnosticSeverity.Warning,
		source: 'mast',
		message: 'For gui text, colons are not allowed. Use <colon> instead.',
		relatedMessage: ''
	}
	errorSources.push(gui_colon);

	errorSources.push(e1);
	for (let i = 0; i < errorSources.length; i++) {
		// let d1: Diagnostic[] = findDiagnostic(errorSources[i].pattern,textDocument,errorSources[i].severity,errorSources[i].message,errorSources[i].source, errorSources[i].relatedMessage, maxNumberOfProblems,problems);
		let d1: Diagnostic[] = findDiagnostic(errorSources[i], textDocument, diagnostics.length, maxNumberOfProblems);
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



	// Checking string errors
	///////////////////////////////////////////////////////     Not sure if this is even applicable
	// let fstring = /[^"]".*\{.*\}.*"[^"]/g;
	// let interior = /{.*\".*\".*}/g;
	// // This still doesn't work, because for some reason it prioritizes one double quote over three
	// // let fstring = /(?<name>(\"\"\"|\"|')).*\{(\k<name>).*(\k<name>)\}.*(\k<name>)/g;
	// while (m = fstring.exec(text)) {
		
	// 	let ints = getMatchesForRegex(interior,m[0]);
	// 	for (const i of ints) {
	// 		let str = text.substring(m.index + i.start,m.index + i.end);
	// 		let start = str.indexOf("\"");
	// 		let end = str.indexOf("\"",start+1)+1;
	// 		if (end === 0) { end = start+1 }
	// 		let r: Range = {
	// 			start: textDocument.positionAt(m.index + i.start + start),
	// 			end: textDocument.positionAt(m.index + i.start + end)
	// 		}
	// 		let d: Diagnostic = {
	// 			range: r,
	// 			message: "Cannot use double quotes inside of an f-string that is encompassed by double quotes",
	// 			severity: DiagnosticSeverity.Error,
	// 			source: "mast extension"
	// 		}
	// 		diagnostics.push(d);
	// 	}
	// }
	// fstring = /\'.*?\{.*?\}.*?\'/g;
	// interior = /\{.*?\'.*?\'.*?\}/g;
	// while (m = fstring.exec(text)) {
	// 	let ints = getMatchesForRegex(interior,m[0]);
	// 	for (const i of ints) {
	// 		let str = text.substring(m.index + i.start,m.index + i.end);
	// 		let start = str.indexOf("\'");
	// 		let end = str.indexOf("\'",start+1)+1;
	// 		if (end === 0) { end = start+1 }
	// 		let r: Range = {
	// 			start: textDocument.positionAt(m.index + i.start + start),
	// 			end: textDocument.positionAt(m.index + i.start + end)
	// 		}
	// 		let d: Diagnostic = {
	// 			range: r,
	// 			message: "Cannot use single quotes inside of an f-string that is encompassed by single quotes",
	// 			severity: DiagnosticSeverity.Error,
	// 			source: "mast extension"
	// 		}
	// 		diagnostics.push(d);
	// 	}
	// }

	//checkForDuplicateLabelsInFile(textDocument);

	
	// For applicable diagnostics, check if they, or parts of them, are inside of a string or comment. Or metadata
	// Some things should be checked after this. Other things should be checked before.
	// TODO: This doesn't appear to be working, e.g. enemy_taunt.mast
	diagnostics = diagnostics.filter((d)=>{
		const start = textDocument.offsetAt(d.range.start);
		const end = textDocument.offsetAt(d.range.end);
		const inStr = !isInString(textDocument, start) || !isInString(textDocument,end);
		const inCom = !isInComment(textDocument,start) || !isInComment(textDocument,end);
		const isInMeta = !isInYaml(textDocument, start) || !isInYaml(textDocument,end);
		return inStr || inCom || isInMeta;
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