import { debug } from 'console';
import * as path from 'path';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { getCache } from './../cache';
import { parseComments, parseStrings, parseYamls, isInString, isInComment, parseSquareBrackets, isInYaml, getStrings } from './../tokens/comments';
import { checkFunctionSignatures, checkLastLine, findDiagnostic } from './../errorChecking';
import { checkLabels } from './../tokens/labels';
import { ErrorInstance, getDocumentSettings, hasDiagnosticRelatedInformationCapability } from './../server';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkEnableRoutes } from './../tokens/routeLabels';
import { URI } from 'vscode-uri';
import { fixFileName } from './../fileFunctions';
import { compileMission } from './../python/python';
import { checkForUnusedSignals } from './../tokens/signals';
import { fstat } from 'fs';
import { getCurrentLineFromTextDocument } from './hover';
import { checkForAssignmentsToScopeName } from '../tokens/variables';

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
let errorInfo = /at (.*) Line (\d+) (- '(.*)')?/;
let moduleRx = /module[ \t](.*)/;
let newlineIndex = /at first newline index\nat (.*) Line (\d+) \nmodule (\w+)\n\n/;

let currentDiagnostics:Diagnostic[] = []
export function getCurrentDiagnostics():Diagnostic[] {return currentDiagnostics;}

export async function compileMastFile(textDocument: TextDocument): Promise<Diagnostic[]> {
	// debug("Starting mast compile")
	// return [];
	let ret: Diagnostic[] = [];
	const cache = getCache(textDocument.uri); 
	// const file = fixFileName(textDocument.uri);
	const file = cache.missionURI+"/story.mast";
	let cm: string[] = await compileMission(file, textDocument.getText(), cache.storyJson)
	// debug(cm);
	let ma: RegExpMatchArray | null;
	for (const e of cm) {
		// let 
		let m = e.replace(/\\n/g,"\n").replace(/\\'/g,"\'")
		m = m.replace(/\(\<string\>\, line 1\)/g,"");
		const lines = m.split("\n");
		debug(lines);
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
			// debug(ma);
			if (ma !== null) {
				errFile = ma[1];
				lineNum = parseFloat(ma[2]) - 1;
				if (ma[4] !== undefined) lineContents = ma[4];
				// debug(lines[2]);
				// debug(lineContents);
				
				let sPos = {line: lineNum, character: 0};
				// debug(sPos);
				// debug(textDocument.offsetAt(sPos));
				let ePos = {line: lineNum + 1, character: 0};
				// debug(ePos);
				let e = textDocument.offsetAt(ePos)-1;
				// debug(e);
				let fileLine = textDocument.getText().substring(textDocument.offsetAt(sPos),e);
				// debug(fileLine);
				chr = fileLine.indexOf(lineContents);
				// debug(chr);
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
	// debug("Starting validation")
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
	await cache.awaitLoaded();
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
	// TODO: This probably SHOULD be on a per-doc basis
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
		relatedMessage: "Only A-Z, a-z, 0-9, and _ are allowed to be used in a label name.",
		excludeFrom: []
	};
	errorSources.push(e1);
	e1 = {
		pattern: /^[\w ][^+][^\"][\w\(\) ]+?\/\//g,
		severity: DiagnosticSeverity.Error,
		message: "Route labels can only be at the start of a line, unless used as label that runs when button is pressed.",
		source: "sbs",
		relatedMessage: "See https://artemis-sbs.github.io/sbs_utils/mast/routes/ for more details on routes.",
		excludeFrom: []
	}
	e1 = {
		pattern: /\b[A-Z]{2,}\b/g,
		severity: DiagnosticSeverity.Information,
		source: "mast",
		message: "CAPS " + debugStrs,
		relatedMessage: "Is all caps intentional?",
		excludeFrom: []
	}
	e1 = {
		pattern: /\w+\.($|\n)/gs,
		severity: DiagnosticSeverity.Error,
		source: "mast",
		message: "Property for object not specified.",
		relatedMessage: "",
		excludeFrom: []
	}
	e1 = {
		pattern: /:[ \t]*(\/\/)?[A-Za-z\/][\w\/]+(\{.*?\})?$/gm,
		severity: DiagnosticSeverity.Error,
		source: "mast",
		message: "Bad colon usage in label definition",
		relatedMessage: "If you're not defining a label code block, then you shouldn't be using a colon.\nIf you are defining a label code block, the colon should be at the end of the line.",
		excludeFrom: ["comment","string","metadata"]
	}
	errorSources.push(e1);

	e1 = {
		pattern: /^(\/\/|==|--|\+\+).*?:/gm,
		severity: DiagnosticSeverity.Error,
		source: "mast",
		message: "Colon used in label definition",
		relatedMessage: "Can't use a colon here.",
		excludeFrom: ["comment","string","metadata"]
	}
	errorSources.push(e1);

	let with_colon: ErrorInstance = {
		pattern: /^[ \t]*(((with|if|elif|while|for|on[ \t]+(change)?)[\t ]+)|(else))[^:\n]*?[ \t]*$/gm,
		severity: DiagnosticSeverity.Error,
		source: 'mast',
		message: 'Statement must end with a colon.',
		relatedMessage: "Applies to: 'with', 'if', 'elif', 'else', 'while', 'for', 'on', and 'on change' blocks.",
		excludeFrom: []
	}
	errorSources.push(with_colon);

	let gui_colon: ErrorInstance = {
		pattern: /gui\w*?\(\".*?:.*?\"\)/,
		severity: DiagnosticSeverity.Warning,
		source: 'mast',
		message: 'For gui text, colons are not allowed. Use <colon> instead.',
		relatedMessage: '',
		excludeFrom: []
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

	let variables = cache.getVariables(textDocument);

	for (const label of cache.getLabels(textDocument)) {
		for (const v of variables) {
			if (label.name === v.name) {
				d = {
					range: v.range,
					message: "'" + v.name + "' is used as a label name. Don't override label names!",
					severity: DiagnosticSeverity.Error,
					source: "mast extension"
				}
				diagnostics.push(d);
				d = {
					range: label.range,
					message: "'" + v.name + "' is used as a variable. Don't override label names!",
					severity: DiagnosticSeverity.Error,
					source: "mast extension"
				}
				diagnostics.push(d);
			}
		}
	}
	debug("Checking for functions that don't exist")
	const functionRegex = /(\.)?(\w+)\(/g;
	// Check for functions that don't exist
	while (m = functionRegex.exec(textDocument.getText())) {
		if (isInComment(textDocument,m.index)) continue;
		if (isInString(textDocument,m.index)) continue;
		let offset = 0;
		if (m[1] === ".") {
			// Is a class method
			let methods = cache.getPossibleMethods(m[2])
			if (methods.length > 0) continue;
			//else empty list
			offset = 1;
		}
		// else
		let func = cache.getMethod(m[2]);
		if (func !== undefined) continue;
		let range:Range = {
			start: textDocument.positionAt(m.index + offset),
			end: textDocument.positionAt(m.index + m[0].length-1)
		}
		const d:Diagnostic = {
			range: range,
			message: "Function not found",
			severity: DiagnosticSeverity.Warning,
			source: "mast extension"
		}
		diagnostics.push(d);
		
	}

	// debug("Checking strings")
	// let fStrings = /(.)((?<open>[\"\']{3}|[\"\'])(.*?)\{(.*?)\}(.*?)\k<open>)/g;
	// let allStrings = /(.)((?<open>[\"\']{3}|[\"\']).*?\k<open>)/g;
	// // m:RegExpExecArray|null;
	// while (m = allStrings.exec(textDocument.getText())) {
	// 	if (!m[0].match(fStrings)) continue;
	// 	// debug(m[0])
	// 	// debug(m[1])
	// 	if (isInComment(textDocument,m.index)) continue;
	// 	if (m[1] !== "f") {
	// 		let line = getCurrentLineFromTextDocument(textDocument.positionAt(m.index),textDocument);
	// 		if (line.trim().startsWith("+")) continue; // Exclude button definitions TODO: Should this be here? For now at least?
	// 		// debug("Adding diagnostic!")
	// 		let range:Range = {
	// 			start: textDocument.positionAt(m.index+1),
	// 			end: textDocument.positionAt(m.index + m[0].length)
	// 		}
	// 		const d:Diagnostic = {
	// 			range: range,
	// 			message: "Possible f-string without a starting `f`",
	// 			severity: DiagnosticSeverity.Warning,
	// 			relatedInformation: [
	// 				{
	// 					location: {
	// 						uri: textDocument.uri,
	// 						range: Object.assign({}, range)
	// 					},
	// 					message: "With sbs_utils v1.2+, f-strings must use the `f` prefix, as described in [this post](https://github.com/artemis-sbs/LegendaryMissions/issues/383)"
	// 				}
	// 			],
	// 			data: "fstring_err"
				
	// 		}
	// 		diagnostics.push(d);
	// 	}
	// }
	const assigns = checkForAssignmentsToScopeName(variables);
	debug(assigns)
	const r = checkEnableRoutes(textDocument);
	// debug(cache.getSignals())
	const sigs = checkForUnusedSignals(textDocument);
	diagnostics = diagnostics.concat(r, sigs, assigns);
	// return debugLabelValidation(textDocument);
	currentDiagnostics = diagnostics;
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