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
import { myDebug } from './server';
import { debug } from 'console';
import AdmZip = require("adm-zip");
import { StoryJson } from './cache';
import { URI } from 'vscode-uri';

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
	const uri = dir.replace("file:///c%3A","C:");
	const entries = await fetch(uri);
	return entries.text();
}

export async function readFile(dir: string) {
	let ret: string = "";
	
	const d = fs.readFile(dir, "utf-8", (err,data)=>{
		if (err) {
			debug("error reading file: " + dir + "\n" + err);
		}
		ret = data;
	});
	return ret;
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
					let newDir = path.join(uri, files[f].name);
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

/**
 * TODO: For now I'll just assume that ALL files in a directory are imported. This may not be actually true at times.
 * @param uri 
 * @returns 
 */
export function getInitFileInFolder(uri: string): string | undefined {
	const files =  fs.readdirSync(uri, { withFileTypes: true });
	let ret = undefined;
	for (const file of files) {
		if (file.name.includes("__init__")) {
			ret = file.parentPath + path.sep + file.name;
			return ret;
		}
	}
	return ret;
}



export function readAllFilesIn(folder: WorkspaceFolder) {
	const files = getFilesInDir(folder.uri, false);
	for (const f in files) {
		debug(files[f]);
	}
}



export async function readZipArchive(filepath: string) {
	const map: Map<string, string> = new Map();
	debug(filepath);
	const zip = new AdmZip(filepath);
	try {
		
		for (const zipEntry of zip.getEntries()) {
			if (!zipEntry.isDirectory) {
				let data = zipEntry.getData().toString('utf-8');
				map.set(zipEntry.entryName,data);
			}
		}
	} catch (e) {
		console.log(`Unzipping ${filepath} failed. \n${e}`);
	}
	return map;
}

export function getStoryJson(uri: string) {
	let mission = findSubfolderByName("../../../","missions");
	debug(mission);
	debug(uri);
	let ret = "";
	getFilesInDir(uri).forEach((file)=>{
		if (file.endsWith("story.json")) {
			debug("Found file");
			ret = file;
		}
	});
	if (ret !== "") {
		return ret;
	}
	const m = uri.indexOf("missions");
	const end = m + 9;
	const dir1 = uri.substring(end);
	debug(dir1);
	const n = dir1.indexOf(path.sep);
	if (n === -1) {
		return uri;
	}
	ret = uri.substring(0,end + n + 1);
	return ret;
}

export function getParentFolder(childUri:string) {
	let p = path.dirname(childUri);
	debug(p);
	fs.lstat(p, (err,stats) => {
		if (err) {
			debug(err);
			throw new URIError(err.message);
			return p;
		}
		if (stats.isSymbolicLink()) {
			fs.readlink(p,(err2,dat)=>{
				if (err2) {
					debug(err2);
				}				
				p = path.dirname(dat);
			});
		}
	});
	return p;
}

export function getMissionFolder(uri: string) : string {
	// Check if it's the right format
	if (uri.startsWith("file")) {
		uri = URI.parse(uri).fsPath;
	}
	let arr = uri.split(path.sep);
	let retArr = [];
	let found = false;
	for (let i = 0; i < arr.length; i++) {
		// Check if this is the mission folder
		if (arr[i] !== "missions") {
			retArr.push(arr[i]);
		} else {
			retArr.push(arr[i]);
			if (i + 1 < arr.length) {
				retArr.push(arr[i + 1]);
			} else {
				debug("Can't determine the mission folder: " + uri);
				return "";
			}
			found = true;
			break;
		}

	}
	// Rebuild the path
	let ret = retArr.join(path.sep);
	//debug(ret);
	// Check if it's in a mission folder
	if (!found) {
		return "";
	}
	return ret;
}


//readZipArchive("C:/Users/mholderbaum/Documents/Cosmos-1-0-0/data/missions/__lib__/artemis-sbs.LegendaryMissions.autoplay.v3.9.39.mastlib");

