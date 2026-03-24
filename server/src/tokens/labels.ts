import { CompletionItem, CompletionItemKind, Diagnostic, DiagnosticSeverity, integer, Location, MarkupContent, Position, Range } from 'vscode-languageserver';
import { Token } from './tokenBasedExtractor';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { relatedMessage } from '../errorChecking';
import { debug } from 'console';
import { getCache } from '../cache';
import { URI } from 'vscode-uri';
import path = require('path');
import { fileFromUri, fixFileName, getFolders, getMissionFolder } from '../fileFunctions';
import { getTokenTypeAtOffset, isInComment } from './comments';
import { getDefaultVariableNamesInRange, variableModifiers } from './variables';
import { start } from 'repl';
import { getCurrentLineFromTextDocument } from '../requests/hover';
import { documents } from '../server';
import { getArtemisGlobals } from '../artemisGlobals';


export interface LabelInfo {
	/**
	 * Valid types: `main`, `inline`, `route`, or `media`
	 */
	type: string,
	name: string,
	start: integer,
	end: integer,
	length: integer,
	metadata: string,
	comments: string,
	subLabels: LabelInfo[],
	srcFile: string,
	range: Range
}
export enum LabelType {
	LABEL,
	INLINE,
	ROUTE
}

/**
 * Get valid labels, but only main or sublabels, not both.
 * @param textDocument 
 * @param main search for main labels (==main_label==) if true, or sublabels (--sublabel--) if false
 * @returns 
 */
export function parseLabels(text: string, src: string, type: string = "main"): LabelInfo[] {
	// debug("src: " + src);
	// let missionFolder = getMissionFolder(src);
	// let allMissions = getGlobals().getAllMissions();
	// debug("Mssion folder: " + missionFolder)
	// // return[]
	// for (const m of allMissions) {
	// 	// debug("mission: " + m);
	// 	if (m.includes(missionFolder)) {
	// 		let subs = getFolders(path.join(getGlobals().artemisDir,"data","missions",m));
	// 		if (subs.includes(".git")) {
	// 			debug("Mission Folder = " + m);
	// 			missionFolder = m;
	// 		}
	// 	}
	// }


	let td: TextDocument = TextDocument.create(src, "mast", 0, text);
	// let src = textDocument.uri;
	// if (src.startsWith("file")) {
	// 	src = URI.parse(src).fsPath;
	// }
	const routeLabel: RegExp = /^([ \t]*)(\/{2,})(\w+)(\/\w+)*/gm;
	const mainLabel: RegExp = /^([ \t]*)(={2,}[ \t]*[ \t]*)(\w+)([ \t]*(={2,})?)/gm;
	const combined: RegExp = /^([ \t]*)(((\/{2,})(\w+)(\/\w+)*)|((={2,}[ \t]*)(\w+)([ \t]*(={2,})?))|(@[\w\/]+))/gm;

	let definedLabel : RegExp;
	if (type === "main") {
		definedLabel = combined;
		//definedLabel = /^(\s*)(={2,}\s*[ \t]*)(\w+)([ \t]*(={2,})?)/gm
	} else if (type === "inline") {
		definedLabel = /^([ \t]*)((-|\+){2,}[ \t]*)(\w+)([ \t]*((-|\+){2,})?)/gm
	} else {
		debug("Label type not valid!");
		return [];
	}
	let m: RegExpExecArray | null;
	//const text = textDocument.getText();
	const labels : LabelInfo[] = [];
	
	//debug("Iterating over defined labels");
	
	while (m = definedLabel.exec(text)) {
		const str = m[0].replace(/(=|-|\+)/g,"").trim();
		const startIndex = m[0].indexOf(str) + m.index;
		const range: Range = {
			start: td.positionAt(startIndex),
			end: td.positionAt(startIndex + str.length)
		}

		let comments:string = "";
		const pos = range.start;
		for (let lineCount = range.start.line; lineCount < td.lineCount-1; lineCount++) {
			pos.line += 1;
			const line = getCurrentLineFromTextDocument(pos,td).trim();
			if (line.startsWith("\"") || line.startsWith("'")) {
				comments += line.substring(1,line.length).trim() + "  \n";
			} else {
				break;
			}
		}
		
		const li: LabelInfo = {
			type: type,
			name: str,
			start: m.index,
			end: 0,
			length: m[0].length,
			metadata: "",
			comments: comments.trim(),
			subLabels: [],
			srcFile: src,
			range: range
		}

		if (m[0].trim().startsWith("//")) {
			li.type = "route";
		} else if (m[0].trim().startsWith("@")) {
			li.type = "media";
		}

		labels.push(li);
	}
	// Here we have to iterate over the labels again to properly get the end position.
	let i = 0;
	while (i < labels.length - 1) {
		labels[i].end = labels[i+1].start-1;
		labels[i].metadata = getMetadata(text.substring(labels[i].start,labels[i].end));
		i++;
	}
	// This is supposed to get the end of the last label
	if (labels[i] !== undefined) {
 		labels[i].end = text.length;
		labels[i].metadata = getMetadata(text.substring(labels[i].start,labels[i].end));
	}

	// TODO: Get Comments or Weighted Text immediately following the label
	// for (const lbl of labels) {
	// 	const desc = getLabelDescription(text.substring(lbl.start,lbl.end), 0);
	// 	debug(desc);
	// }

	// Add END as a main label, last so we don't need to mess with it in earlier iterations.
	// Also add "main" as a main label, since it can happen that sublabels are defined before any user-defined main labels.
	if (type === "main") {
		let loc: Range = {
			start: td.positionAt(text.length-1),
			end: td.positionAt(text.length)
		}
		const endLabel: LabelInfo = { range: loc, type: "main", name: "END", start: text.length-1,end: text.length, length: 3, metadata: "", comments: "", subLabels: [], srcFile: src }
		labels.push(endLabel);
		let end:integer = text.length;
		for (const i in labels) {
			if (labels[i].start < end) {
				end = labels[i].start-1;
			}
		}
		loc = {
			start: td.positionAt(0),
			end: td.positionAt(end)
		}
		const mainLabel: LabelInfo = { range: loc, type: "main", name: "main", start: 0, end: end, length: 4, metadata: "", comments: "", subLabels: [], srcFile: src }
		labels.push(mainLabel);
	}
	//debug(labels);
	return labels
}

function getMetadata(text:string):string {
	let ret = "";
	const start = text.indexOf("```");
	if (start === -1) return ret;
	text = text.substring(start).replace(/```/,"");
	const end = text.indexOf("```");
	if (end === -1) return ret;
	text = text.substring(0,end)
	text = text.replace(/```/g,"").trim();
	// text = text.substring(text.indexOf("\n"));
	return text;
}

export function buildLabelDocs(label:LabelInfo): MarkupContent {
	let val = "";
	if (label.metadata !== "") {
		val = label.comments + "\n\nDefault metadata:  \n```  \n" + label.metadata + "\n```\n"
	} else {
		val = label.comments;
	}
	if (val === "") {
		val = "No information specified for the '" + label.name + "' label.";
	}
	val = "`"+ label.name + "` is defined in `" + path.dirname(label.srcFile).replace(/.*?\/missions\//,"") + "/" + path.basename(label.srcFile) + "`  \n" + val;
	let docs:MarkupContent = {
		kind: "markdown",
		value: val
	};
	return docs;
}

function getLabelDocs(text:string):string {
	let ret = "";
	const lines: string[] = text.split("\n");
	// TODO: figure out how to do the label documentation checking
	// I THINK it'll be just all comments right under the label definition.
	// But I need to check that the comments should always be prior to the metadata
	return ret;
}

/**
 * Token-based label parser. Builds {@link LabelInfo} from an already-computed
 * token stream, avoiding a second regex scan over the raw text.
 * Replaces {@link parseLabelsInFile} in paths that have tokens readily available
 * (i.e. {@link MastFile.parse} and {@link MastFile.updateFromDocument}).
 *
 * @param doc The {@link TextDocument} (used for offset/position math)
 * @param tokens The pre-computed token stream from {@link tokenizeMastFile}
 */
export function parseLabelsFromTokens(doc: TextDocument, tokens: Token[]): LabelInfo[] {
	const text = doc.getText();
	const srcFile = fixFileName(doc.uri);
	const mainLabels: LabelInfo[] = [];
	const inlineLabels: LabelInfo[] = [];

	for (const token of tokens) {
		if (token.modifier !== 'definition') continue;
		if (token.type !== 'label' && token.type !== 'route-label' && token.type !== 'media-label') continue;

		const nameOffset = doc.offsetAt({ line: token.line, character: token.character });
		const lineStartOffset = doc.offsetAt({ line: token.line, character: 0 });

		// Determine label type.
		// route-label and media-label have dedicated token types.
		// For 'label' tokens (both main == and inline --/++) inspect the prefix
		// on the same line: if it contains '=' it's a main label, otherwise inline.
		let type: string;
		if (token.type === 'route-label') {
			type = 'route';
		} else if (token.type === 'media-label') {
			type = 'media';
		} else {
			const lineStart = doc.offsetAt({ line: token.line, character: 0 });
			const prefix = text.substring(lineStart, nameOffset);
			type = prefix.includes('=') ? 'main' : 'inline';
		}

		// Collect documentation: lines immediately after the label definition
		// that begin with a quote character (same logic as parseLabels).
		let comments = '';
		for (let checkLine = token.line + 1; checkLine < doc.lineCount; checkLine++) {
			const lineStartOffset = doc.offsetAt({ line: checkLine, character: 0 });
			const lineEndOffset = checkLine + 1 < doc.lineCount
				? doc.offsetAt({ line: checkLine + 1, character: 0 }) - 1
				: text.length;
			const line = text.substring(lineStartOffset, lineEndOffset).trim();
			if (line.startsWith('"') || line.startsWith("'")) {
				comments += line.substring(1).trim() + '  \n';
			} else {
				break;
			}
		}

		const range: Range = {
			start: { line: token.line, character: token.character },
			end: { line: token.line, character: token.character + token.length }
		};

		const li: LabelInfo = {
			type,
			name: token.text,
			start: lineStartOffset,
			end: 0,
			length: token.length,
			metadata: '',
			comments: comments.trim(),
			subLabels: [],
			srcFile,
			range
		};

		if (type === 'inline') {
			inlineLabels.push(li);
		} else {
			mainLabels.push(li);
		}
	}

	// Ensure both lists are in document order (tokens are sorted but filter may not preserve order)
	mainLabels.sort((a, b) => a.start - b.start);
	inlineLabels.sort((a, b) => a.start - b.start);

	// Set end offsets and extract metadata for main/route/media labels.
	// Each label "owns" content up to the next label's start.
	for (let i = 0; i < mainLabels.length - 1; i++) {
		mainLabels[i].end = mainLabels[i + 1].start - 1;
		mainLabels[i].metadata = getMetadata(text.substring(mainLabels[i].start, mainLabels[i].end));
	}
	if (mainLabels.length > 0) {
		const last = mainLabels[mainLabels.length - 1];
		last.end = text.length;
		last.metadata = getMetadata(text.substring(last.start));
	}

	// Set end offsets for inline labels (within their own sorted group).
	for (let i = 0; i < inlineLabels.length - 1; i++) {
		inlineLabels[i].end = inlineLabels[i + 1].start - 1;
	}
	if (inlineLabels.length > 0) {
		inlineLabels[inlineLabels.length - 1].end = text.length;
	}

	// Add synthetic END label (matches original parseLabels behaviour).
	const safeLen = Math.max(0, text.length - 1);
	mainLabels.push({
		range: { start: doc.positionAt(safeLen), end: doc.positionAt(text.length) },
		type: 'main', name: 'END',
		start: safeLen, end: text.length,
		length: 3, metadata: '', comments: '', subLabels: [], srcFile
	});

	// Add synthetic 'main' label covering everything before the first real label.
	let firstStart = text.length;
	for (const ml of mainLabels) {
		if (ml.name !== 'END' && ml.start < firstStart) firstStart = ml.start;
	}
	const mainEnd = firstStart > 0 ? firstStart - 1 : 0;
	mainLabels.push({
		range: { start: doc.positionAt(0), end: doc.positionAt(mainEnd) },
		type: 'main', name: 'main',
		start: 0, end: mainEnd,
		length: 4, metadata: '', comments: '', subLabels: [], srcFile
	});

	// Nest inline labels within their parent main labels.
	for (const ml of mainLabels) {
		for (const sl of inlineLabels) {
			if (sl.start > ml.start && sl.start < ml.end) {
				ml.subLabels.push(sl);
			}
		}
	}

	return mainLabels;
}

export function parseLabelsInFile(text: string, src: string): LabelInfo[] {
	let mainLabels : LabelInfo[] = parseLabels(text, src, "main");
	//debug(mainLabels);
	const subLabels : LabelInfo[] = parseLabels(text, src, "inline");
	//const routeLabels : LabelInfo[] = parseLabels(text, src, "route");
	//debug(src);
	//debug(routeLabels);
	// Add child labels to their parent
	for (const i in mainLabels) {
		const ml = mainLabels[i];
		for (const j in subLabels) {
			const sl = subLabels[j];
			if (sl.start > ml.start && sl.start < ml.end) {
				ml.subLabels.push(sl);
			}
		}
	}
	// debug("Parsed labels:")
	// debug(mainLabels)
	//mainLabels = mainLabels.concat(routeLabels);
	return mainLabels;
}

export function checkForDuplicateLabelsInList(textDocument:TextDocument, labels: LabelInfo[]=[], subLabels: boolean=false) : Diagnostic[] {
	let diagnostics: Diagnostic[] = [];
	
	if (labels.length === 0 && !subLabels) {
		labels = getCache(textDocument.uri).getLabels(textDocument);
	}
	for (const i in labels) {
		// First we iterate over all labels prior to this one
		// If the label isn't from this file, we don't need to include it in the errors for this file.
		if (fixFileName(labels[i].srcFile) !== fixFileName(textDocument.uri)) {
			continue;
		}
		// Exclude main and END
		if (labels[i].name === "main" || labels[i].name === "END" || labels[i].type === "route") {
			// debug("Is route: " + labels[i].name)
			continue;
		}
		if (labels[i].name.startsWith("@media")) continue;
		for (const j in labels) {
			if (j === i) {
				//break;
				continue;
			}
			if (labels[i].name === labels[j].name) {
				if (labels[i].start === labels[j].start) continue;
				// debug(labels[i].name + " is used more than once");
				// debug(labels[i])
				// debug(labels[j])
				const d: Diagnostic = {
					range: {
						start: textDocument.positionAt(labels[i].start),
						end: textDocument.positionAt(labels[i].start + labels[i].length)
					},
					severity: DiagnosticSeverity.Error,
					message: "Label names can only be used once.",
					source: "mast",
					
				}
				// let file = fileFromUri(labels[j].srcFile);
				// debug(file);
				
				let message = (subLabels) ? "The inline label \""+ labels[i].name + "\" is already used inside this parent label" : "The label \"" + labels[i].name + "\" is already used in this file";
				
				if (!subLabels) {
					let f:string;
					if (labels[j].srcFile !== textDocument.uri) {
						f = path.basename(URI.parse(labels[j].srcFile).fsPath);
					} else {
						f = "this file.";
					}
					message = "The label \"" + labels[j].name + "\" is already defined in " + f;
				}
				d.relatedInformation = [];
				d.relatedInformation = relatedMessage(textDocument,d.range, message);

				const s = labels[j].range.start;
				// s.character = 1;
				message += " at Line " + s.line + ", Character " + s.character;
				
				if (d.relatedInformation === undefined) d.relatedInformation = [];
				d.relatedInformation.push({
					location: {
						uri: fileFromUri(labels[j].srcFile),
						range: labels[j].range
					},
					message: '<-- Label also defined here.'
				});
				
				diagnostics.push(d);
			}
		}
		// Now we need to do the same thing for sub labels
		if (!subLabels) {
			const subs = labels[i].subLabels;
			diagnostics = diagnostics.concat(checkForDuplicateLabelsInList(textDocument,subs,true));
		}
	}
	return diagnostics;
}

// function checkForDuplicateLabelsOld(t: TextDocument, main:LabelInfo[],sub:LabelInfo[]): Diagnostic[] {
// 	let diagnostics: Diagnostic[] = [];
// 	const labels = getCache(t.uri).getLabels(t);
// 	for (const i in main) {
// 		for (const j in sub) {
// 			if (main[i].subLabels.includes(sub[j].name)) {
// 				const d: Diagnostic = {
// 					range: {
// 						start: t.positionAt((main[i].start > sub[j].start) ? main[i].start : sub[j].start),
// 						end: t.positionAt((main[i].start > sub[j].start) ? main[i].start + main[i].length : sub[j].start+ sub[j].length)
// 					},
// 					severity: DiagnosticSeverity.Error,
// 					message: "Label names can only be used once.",
// 					source: "mast",
					
// 				}
// 				d.relatedInformation = relatedMessage(t,d.range, "This label name is used elsewhere in this file.");
// 				diagnostics.push(d);
// 			}
// 		}
// 	}
// 	return diagnostics;
// }

export function checkLabels(textDocument: TextDocument) : Diagnostic[] {
	const text = textDocument.getText();
	let diagnostics : Diagnostic[] = [];
	//const calledLabel : RegExp = /(^[ \t]*?(->|jump)[ \t]*?\w+)/gm;
	const calledLabel : RegExp = /(?<=^[ \t]*(jump |->)[ \t]*)(\w+)/gm;
	let m: RegExpExecArray | null;
	let mainLabels : LabelInfo[] = getCache(textDocument.uri).getLabels(textDocument, true);//getLabelsInFile(text,textDocument.uri);
	///parseLabels(textDocument.getText(),textDocument.uri, true);
	// const subLabels : LabelInfo[] = parseLabels(textDocument.getText(), textDocument.uri, false);
	// // Add child labels to their parent
	// for (const i in mainLabels) {
	// 	const ml = mainLabels[i];
	// 	for (const j in subLabels) {
	// 		const sl = subLabels[j];
	// 		if (sl.start > ml.start && sl.start < ml.end) {
	// 			ml.subLabels.push(sl.name);
	// 		}
	// 	}
	// }
	// updateLabelNames(mainLabels);
	//debug("Iterating over called labels");
	while (m = calledLabel.exec(text)) {
		const str = m[0].replace(/(->)|(jump )/g,"").trim();
		if (str === "END") {
			continue;
		}
		//debug(str);
		let found: boolean = false;

		const ml: LabelInfo = getMainLabelAtPos(m.index,mainLabels);
		if (ml === undefined) {
			debug("ERROR in checkLabels() at getMainLabelAtPos(" + m.index + ", " + mainLabels.length + ")");
			debug(mainLabels);
			debug(textDocument.uri)
		}
		// debug(ml);
		// Check if the label is the main label
		if (str === ml.name) {
			continue;
		// Check if the label is a sub-label of the main label.
		} else {
			for (const sub of ml.subLabels) {
				if (str === sub.name) {
					found = true;
					break;
				}
			}
			if (found) continue;
		}

		// mainLabels = getCache(textDocument.uri).getLabels(textDocument, false);
		
		// If the label is not a main label, nor a sub-label of the main label,
		// then we need to see if it exists at all.
		// It must either not exist, or be a sublabel of a different main label, which is not allowed.
		for (const main of mainLabels) {
			if (str === main.name) {
				found = true;
				break;
			} else {
				for (const sl of main.subLabels) {
					if (str === sl.name) {
						if (m.index < main.start || m.index > main.end) {
							const d: Diagnostic = {
								range: {
									start: textDocument.positionAt(m.index),
									end: textDocument.positionAt(m.index + m[0].length)
								},
								severity: DiagnosticSeverity.Error,
								message: "Sub-label \"" + sl.name + "\" cannot be called from outside of its parent label.",
								source: "mast",
								
							}
							d.relatedInformation = relatedMessage(textDocument,d.range, "This sub-label is a child of the `" + main.name + "` main label.\nYou can only jump to a sub-label from within its parent label.");
							diagnostics.push(d);
							debug(main.subLabels);
						}
						found = true;
						break;
					}
				}
			}
		}

		// const labels: LabelInfo[] = getCache(textDocument.uri).getLabels(textDocument);

		// for (const lbl of labels) {
		// 	if (str === lbl.name) {
		// 		found = true;
		// 		break;
		// 	} else {
		// 		for (const sl of lbl.subLabels) {
		// 			if (str === sl.name) {
		// 				const d: Diagnostic = {
		// 					range: {
		// 						start: textDocument.positionAt(sl.start),
		// 						end: textDocument.positionAt(sl.start + sl.length)
		// 					},
		// 					severity: DiagnosticSeverity.Error,
		// 					message: "Sub-label \"" + sl.name + "\" cannot be called from outside of its parent label.",
		// 					source: "mast",
							
		// 				}
		// 				d.relatedInformation = relatedMessage(textDocument,d.range, "This sub-label is a child of the " + lbl.name + " main label.\nYou can only jump to a sub-label from within its parent label.");
		// 				diagnostics.push(d);
		// 				debug("Second iteration")
		// 			}
		// 		}
		// 	}
		// }
		// debug("----------------Start------------------")
		// debug(str);
		// debug(textDocument.uri);
		// debug(m.index)
		// debug(textDocument.positionAt(m.index))
		// let labelLoc = getLabelLocation(str, textDocument, textDocument.positionAt(m.index))
		// debug(labelLoc);
		// debug("-----------------END-----------------")

		// Label not found in file
		if (!found) {
			const d: Diagnostic = {
				range: {
					start: textDocument.positionAt(m.index),
					end: textDocument.positionAt(m.index + m[0].length)
				},
				severity: DiagnosticSeverity.Warning,
				message: "Label defnition not found. Make sure that this label is defined before use.",
				source: "mast"
			}
			//d.relatedInformation = relatedMessage(textDocument, d.range, "Labels must be defined in a format beginning (and optionally ending) with two or more = or - signs. They may use A-Z, a-z, 0-9, and _ in their names. Other characters are not allowed.");
			//d.relatedInformation = relatedMessage(textDocument, d.range, "");
			diagnostics.push(d);
		}
	}
	const dups = checkForDuplicateLabelsInList(textDocument,mainLabels);
	// const susb = checkForDuplicateLabelsInList(textDocument,ml)
	diagnostics = diagnostics.concat(dups);
	//debug(diagnostics);
	diagnostics = diagnostics.concat(findBadLabels(textDocument));
	return diagnostics;
}

/**
 * Check for invalid labels, e.g. using both - and = in the same label
 * @param t 
 * @returns 
 */
function findBadLabels(t: TextDocument) : Diagnostic[] {
	const text = t.getText();
	const cache = getCache(t.uri);
	const tokens = cache.getMastFile(t.uri)?.tokens;
	const diagnostics: Diagnostic[] = [];
	const any: RegExp = /(^ *?=+?.*?$)|(^ *?-+?.*?$)/gm;
	const whiteSpaceWarning: RegExp = /^ +?/;
	const good: RegExp = /(^(\s*)(={2,}\s*[ \t]*)(\w+)([ \t]*(={2,})?))|(^(\s*)(-{2,}\s*[ \t]*)(\w+)([ \t]*(-{2,})?))/m;
	const bad: RegExp = /[\!\@\$\%\^\&\*\(\)\.\,\>\<\?\`\[\]\\\/\+\~\{\}\|\'\"\;\:]+?/m;

	// Regex for a good await inline label
	const format = /=\$\w+/;
	const awaitInlineLabel: RegExp = /=\w+:/;
	
	let m: RegExpExecArray | null;
	// Iterate over regular labels
	while (m = any.exec(text)) {
		let lbl = m[0].trim();
		if (lbl.startsWith("#")) {
			continue;
		}
		if (lbl.startsWith("->")) {
			continue;
		}
		let isInYaml = getTokenTypeAtOffset(t, tokens || [], m.index) === "yaml";
		let isInComment = getTokenTypeAtOffset(t, tokens || [], m.index) === "comment";
		if (isInYaml || isInComment) {
			continue;
		}
		//debug("Testing " + m[0]);
		let tr = good.test(lbl) || awaitInlineLabel.test(lbl) || format.test(lbl);
		//debug("  Result: " + tr as string);

		if (!tr) {
			
			//debug("    Bad result");
			
			let d: Diagnostic = {
				range: {
					start: t.positionAt(m.index),
					end: t.positionAt(m.index + m[0].length)
				},
				severity: DiagnosticSeverity.Error,
				message: "Invalid characters in label designation",
				source: "mast"
			}
			
			// TODO: Technically this is not reachable. Evaluate if this should be kept around.
			if (awaitInlineLabel.test(m[0])) {
				d.severity = DiagnosticSeverity.Warning;
				d.message = "Possible improper label definition";
				d.source = __dirname;
				d.relatedInformation = relatedMessage(t,d.range, "The acceptable use of a label with a single starting '=' is rare, and you'd better know what you're doing.\nOne example useage can be found in the legendarymissions, in hangar/bar.mast. \nIn this situation, the disconnect label is used to tell the server how to handle a disconnected client.");
			} else {
				d.relatedInformation = relatedMessage(t, d.range, "Labels must be defined in a format beginning (and optionally ending) with two or more = or - signs. \nThey may use A-Z, a-z, 0-9, and _ in their names. Other characters are not allowed.\nExamples:\"== LabelA\" or \"== LabelA ==\"");
			}
			diagnostics.push(d);
		}

		// Await Inline Labels ignore this error, but other labels should NOT be indented.
		tr = whiteSpaceWarning.test(m[0]) && !awaitInlineLabel.test(lbl) && !format.test(lbl);
		if (tr) {
			//debug("WARNING: Best practice to start the line with label declaration");
			const d: Diagnostic = {
				range: {
					start: t.positionAt(m.index),
					end: t.positionAt(m.index + m[0].length)
				},
				severity: DiagnosticSeverity.Warning,
				message: "Best practice is to start label declaration at the beginning of the line.",
				source: "mast"
			}
			d.relatedInformation = relatedMessage(t, d.range, "Label declarations can cause Mast compiler errors under some circumstances when there are spaces prior to label declaration.");
			diagnostics.push(d);
		}

	}

	// Iterate over possible route labels to check for errors
	const routes = /^.*?\/\/.*?$/gm; // every line that contains "//"
	const badRoute = /[\w\(]+?\/\//; // check for text before the "//"
	const slashCheck = / *?\/\/.+?\/\//; // contains two or more sets of "//"
	const formatCheck = /.*?\/\/\w+(\/(\w+))*.*/m; // checks for proper //something/something/something format
	while (m = routes.exec(text)) {
		/**
		 * I still want to implement a more robust version of this someday, but for now
		 * we're removing due to the use of // as an operator
		 */

		// if (badRoute.test(m[0])) {
		// 	const d: Diagnostic = {
		// 		range: {
		// 			start: t.positionAt(m.index),
		// 			end: t.positionAt(m.index + m[0].length)
		// 		},
		// 		severity: DiagnosticSeverity.Error,
		// 		message: "Route labels can be used only at the beginning of a line.",
		// 		source: "mast"
		// 	}
		// 	d.relatedInformation = relatedMessage(t, d.range, "See https://artemis-sbs.github.io/sbs_utils/mast/routes/ for more details on routes.");
		// 	diagnostics.push(d);
		// }
		if (slashCheck.test(m[0])) {
			const d: Diagnostic = {
				range: {
					start: t.positionAt(m.index),
					end: t.positionAt(m.index + m[0].length)
				},
				severity: DiagnosticSeverity.Error,
				message: "Route label designator (//) may only be used once at the beginning of the line.",
				source: "mast"
			}
			d.relatedInformation = relatedMessage(t, d.range, "See https://artemis-sbs.github.io/sbs_utils/mast/routes/ for more details on routes.");
			diagnostics.push(d);
		}
		// if (!formatCheck.test(m[0])) {
		// 	let message = "Route label format is incorrect. Proper formats include: \n//comms\n//spawn/grid\n//enable/science if has_roles(COMMS_SELECTED_ID, \"raider\")";
		// 	if (m[0].endsWith("/")) {
		// 		message = "Route labels cannot end with a slash. "
		// 	}
		// 	const d: Diagnostic = {
		// 		range: {
		// 			start: t.positionAt(m.index),
		// 			end: t.positionAt(m.index + m[0].length)
		// 		},
		// 		severity: DiagnosticSeverity.Error,
		// 		message: message,
		// 		source: "mast"
		// 	}
		// 	d.relatedInformation = relatedMessage(t, d.range, "See https://artemis-sbs.github.io/sbs_utils/mast/routes/ for more details on routes.");
		// 	diagnostics.push(d);
		// }

		
		// TODO: Add this later. Need to account for things like:
		/**
		 * comms_navigate("//comms/taunt/raider")
		 * and
		 * + "Give Orders" //comms/give_orders
		 */


		// const tr = whiteSpaceWarning.test(m[0]);
		// if (tr) {
		// 	//debug("WARNING: Best practice to start the line with label declaration");
		// 	const d: Diagnostic = {
		// 		range: {
		// 			start: t.positionAt(m.index),
		// 			end: t.positionAt(m.index + m[0].length)
		// 		},
		// 		severity: DiagnosticSeverity.Warning,
		// 		message: "Best practice is to start label declarations at the beginning of the line.",
		// 		source: "mast"
		// 	}
		// 	d.relatedInformation = relatedMessage(t, d.range, "Label declarations can cause Mast compiler errors under some circumstances when there are spaces prior to label declaration.");
		// 	diagnostics.push(d);
		// }
	}

	return diagnostics;
}

export function getMainLabelAtPos(pos: integer, labels: LabelInfo[]): LabelInfo {
	let closestLabel = labels[0];
	for (const label of labels) {
		if (label.type === "inline") {
			continue;
		}
		if (label.start <= pos && label.end >= pos) {
			if (!closestLabel || label.start >= closestLabel.start) {
				closestLabel = label;
			}
		}
	}
	return closestLabel;
}

const LABEL_SCOPE_KEYWORDS = new Set<string>([
	'def', 'async', 'await', 'import', 'if', 'elif', 'else', 'match', 'case', 'yield',
	'return', 'break', 'continue', 'pass', 'raise', 'try', 'except', 'finally', 'with',
	'class', 'while', 'for', 'in', 'is', 'and', 'or', 'not', 'lambda', 'on', 'change', 'signal', 'jump',
	'True', 'False', 'None'
]);

function getUndefinedVariableReferenceNamesInLabel(doc: TextDocument, label: LabelInfo, tokens: Token[]): string[] {
	if (!tokens || tokens.length === 0) {
		return [];
	}

	const fullText = doc.getText();
	const textLength = fullText.length;
	const start = Math.max(0, label.start);
	const end = Math.min(label.end + 1, textLength);
	if (end <= start) {
		return [];
	}

	// Variables defined anywhere in this label scope (default/shared/temp/etc. are all definitions).
	const definedNames = new Set<string>();
	const scopeText = fullText.substring(start, end);
	const defRX = /^[\t ]*(default[ \t]+)?((shared|assigned|client|temp)[ \t]+)?([a-zA-Z_]\w*)[\t ]*(?==[^=])/gm;
	let dm: RegExpExecArray | null;
	while (dm = defRX.exec(scopeText)) {
		definedNames.add(dm[4]);
	}

	// Known labels should never be treated as undefined metadata variables,
	// even when referenced as bare identifiers (e.g. task_schedule(some_label)).
	const knownLabelNames = new Set<string>();
	const allLabels = getCache(doc.uri).getLabels(doc, false);
	const labelStack = [...allLabels];
	while (labelStack.length > 0) {
		const current = labelStack.pop();
		if (!current) continue;
		const n = (current.name || '').trim();
		if (!n) continue;
		knownLabelNames.add(n);
		if (n.startsWith('//')) {
			knownLabelNames.add(n.substring(2));
		} else {
			knownLabelNames.add(`//${n}`);
		}
		for (const sub of current.subLabels || []) {
			labelStack.push(sub);
		}
	}

	const refs = new Set<string>();
	for (const tok of tokens) {
		if (tok.type !== 'variable') {
			continue;
		}
		const tokenStart = doc.offsetAt({ line: tok.line, character: tok.character });
		if (tokenStart < start || tokenStart >= end) {
			continue;
		}
		const name = tok.text;
		if (!/^[a-zA-Z_]\w*$/.test(name)) {
			continue;
		}
		if (knownLabelNames.has(name) || knownLabelNames.has(`//${name}`)) {
			continue;
		}
		if (LABEL_SCOPE_KEYWORDS.has(name) || variableModifiers.some(v => v[0] === name)) {
			continue;
		}

		// Skip property access (obj.foo).
		let prev = tokenStart - 1;
		while (prev >= start && /[ \t]/.test(fullText[prev])) {
			prev--;
		}
		if (prev >= start && fullText[prev] === '.') {
			continue;
		}

		// Skip named args and assignment LHS (identifier directly followed by '=' token text).
		let next = tokenStart + tok.length;
		while (next < end && /[ \t]/.test(fullText[next])) {
			next++;
		}
		if (next < end && fullText[next] === '=') {
			continue;
		}

		if (!definedNames.has(name)) {
			refs.add(name);
		}
	}

	return Array.from(refs.values());
}

export function getLabelMetadataKeys(label:LabelInfo, doc?: TextDocument, tokens?: Token[]) {
	const meta = label.metadata;
	const re: RegExp = /^[ \t]*(\w+):(.*)/gm;
	let m: RegExpExecArray | null;
	let keys = [];
	while (m = re.exec(meta)) {
		let key = m[1];
		let def = m[2].trim();
		keys.push([key,def]);
	}
	keys.push(["START_X",""]);
	keys.push(["START_Y",""]);
	keys.push(["START_Z",""]);

	if (doc && tokens) {
		for (const name of getDefaultVariableNamesForLabel(doc, label)) {
			keys.push([name, ""]);
		}
		for (const name of getUndefinedVariableReferenceNamesInLabel(doc, label, tokens)) {
			keys.push([name, ""]);
		}
	}

	keys = [...new Map(keys.map(v => [v[0], v])).values()];
	return keys;
}

export function getDefaultVariableNamesForLabel(doc: TextDocument, label: LabelInfo): string[] {
	const textLength = doc.getText().length;
	const start = Math.max(0, label.start);
	const end = Math.min(label.end + 1, textLength);
	return getDefaultVariableNamesInRange(doc, start, end);
}

let extraDebug = false;
export function getLabelLocation(symbol:string, doc:TextDocument, pos:Position) {
	const normalize = (s: string): string => {
		let ret = (s || '').trim();
		if ((ret.startsWith('"') && ret.endsWith('"')) || (ret.startsWith("'") && ret.endsWith("'"))) {
			ret = ret.slice(1, -1).trim();
		}
		return ret;
	};

	const baseSymbol = normalize(symbol);
	const candidateNames = new Set<string>();
	if (baseSymbol.length > 0) {
		candidateNames.add(baseSymbol);
		if (baseSymbol.startsWith('//')) {
			candidateNames.add(baseSymbol.substring(2));
		} else {
			candidateNames.add(`//${baseSymbol}`);
		}
	}

	// debug("Getting location of label: `" + symbol + "` in\n" + doc.uri + " at:")
	// debug(pos)
	// Now let's check over all the labels, to see if it's a label. This will be most useful for most people I think.
	// let mainLabels = getCache(doc.uri).getLabels(doc,true);
	let mainLabels = getCache(doc.uri).getLabelsAtPos(doc, doc.offsetAt(pos), true);
	// debug(mainLabels)
	// for (const l of mainLabels){
	// 	if (l.name.startsWith("@")) {
	// 		debug(l)
	// 	}
	// }
	if (mainLabels.length > 0) {
		const mainLabelAtPos = getMainLabelAtPos(doc.offsetAt(pos),mainLabels);
		if (mainLabelAtPos) {
			debug("Main Label: " + mainLabelAtPos.name);
			debug(symbol);
			debug(mainLabelAtPos.subLabels)
			for (const sub of mainLabelAtPos.subLabels) {
				if (candidateNames.has(sub.name)) {
					debug(sub);
					const loc:Location = {
						uri: fileFromUri(sub.srcFile),
						range: sub.range
					}
					return loc
				}
			}
		}
	}
	mainLabels = getCache(doc.uri).getLabels(doc,false);
	for (const main of mainLabels) {
		if (candidateNames.has(main.name)) {
			// debug(main);
			const loc:Location = {
				uri: fileFromUri(main.srcFile),
				range: main.range
			}
			return loc
		}
	}
}


export function getLabelsAsCompletionItems(text: TextDocument, labelNames: LabelInfo[], lbl: LabelInfo|undefined) {
	let ci: CompletionItem[] = [];
	for (const i in labelNames) {
		if (labelNames[i].name === "main") continue;
		if (labelNames[i].name.startsWith("//")) continue;
		if (fixFileName(labelNames[i].srcFile) !== fixFileName(text.uri) && labelNames[i].name === "END") continue;
		if (labelNames[i].type === "main") {
			ci.push({documentation: buildLabelDocs(labelNames[i]),label: labelNames[i].name, kind: CompletionItemKind.Event, labelDetails: {description: path.basename(labelNames[i].srcFile)}});
		}
	}
	labelNames = getCache(text.uri).getLabels(text, true);
	if (lbl === undefined) {
		return ci;
	} else {
		// Check for the parent label at this point (to get sublabels within the same parent)
		if (lbl.srcFile === fixFileName(text.uri)) {
			debug("same file name!");
			let subs = lbl.subLabels;
			debug(lbl.name);
			debug(subs);
			for (const i in subs) {
				ci.push({documentation: buildLabelDocs(subs[i]),label: subs[i].name, kind: CompletionItemKind.Event, labelDetails: {description: "Sub-label of: " + lbl.name}});
			}
		}
		return ci;
	}

	return ci;
}