import * as path from 'path';
import * as fs from 'fs';
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	DocumentDiagnosticReportKind,
	type DocumentDiagnosticReport,
	integer,
	SignatureInformation,
	ParameterInformation,
	CompletionItemLabelDetails,
	InsertTextFormat,
	WorkspaceFolder
} from 'vscode-languageserver/node';
import { appendFunctionData, myDebug } from './server';
import { checkServerIdentity } from 'tls';

import { getRegExMatch } from './data';
import { debug } from 'console';

/**
 * TODO: Use parsers.py to determine the style definitions available for UI elements
 * See https://github.com/artemis-sbs/sbs_utils/blob/master/sbs_utils/mast/parsers.py
 */

export function getRootFolder() : string | null{
	// let initialDir = "./";
	// let dir = findSubfolderByName(initialDir,"__lib__");
	// if (dir === null) {
	
	// Need to be sure we're capturing the right folder - we don't know if the user
	// is using the root Artemis folder or the missions folder, or anything in between.
		let initialDir = "../../../../";
		let dir = findSubfolderByName(initialDir, "data");
		debug(dir + "\n");
		if (dir !== null) {
			dir =findSubfolderByName(dir, "missions");
			if (dir !== null) {
				dir = findSubfolderByName(dir, "__lib__");
				if (dir !== null) {
					//dir = dir.replace(/\.\.\\/g,"");
					return dir;
				}
			}
		}
		return null;
}

export function findSubfolderByName(dir: string, folderName: string): string | null {
	const files = fs.readdirSync(dir, { withFileTypes: true });
  
	for (const file of files) {
	  if (file.isDirectory()) {
		if (file.name === folderName) {
		  return path.join(dir, file.name);
		} else {
		  const subfolderPath = findSubfolderByName(path.join(dir, file.name), folderName);
		  if (subfolderPath) {
			return subfolderPath;
		  }
		}
	  }
	}
  
	return null;
}


/**
 * Get all folders within a directory
 * @param dir 
 * @returns 
 */
export function getFolders(dir: string) : string[] {
	const entries = fs.readdirSync(dir, {withFileTypes: true});
	return entries.filter(entry=>entry.isDirectory()).map(entry=>entry.name);
}

/**
 * Get the contents of a file
 * @param dir The uri of a file
 * @returns A promise containing the text contents of the file specified
 */
export async function getFileContents(dir: string): Promise<string> {
	const entries = await fetch(dir);
	return entries.text();
}

export function getFilesInDir(dir: string, includeChildren: boolean = true): string[] {
	let ret: string[] = [];
	try {
		// Not sure why workspace.uri returns this weird initial designator, but we can fix it just fine.
		// Probably because we're using fetch()
		const uri = dir.replace("file:///c%3A","C:");
		const files =  fs.readdirSync(uri, { withFileTypes: true });
		for (const f in files) {
			if (files[f].isDirectory()) {
				if (includeChildren) {
					let newDir = path.join(dir, files[f].name);
					ret = ret.concat(getFilesInDir(newDir, includeChildren));
				}
			} else {
				ret.push(path.join(uri, files[f].name));
			}
			
		}
	} catch (e) {
		debug(e);
	}
	return ret;
	
}

export function readAllFilesIn(folder: WorkspaceFolder) {
	const files = getFilesInDir(folder.uri, false);
	for (const f in files) {
		debug(files[f]);
	}
}