import { debug } from 'console';
import { findSubfolderByName, getArtemisDirFromChild, getFilesInDir, getFolders, readFile } from './fileFunctions';
import path = require('path');
import { CompletionItem, CompletionItemLabelDetails, CompletionItemKind } from 'vscode-languageserver';
import { connection } from './server';

interface DataSetItem {
	name: string,
	type: string,
	docs: string
}

export class Globals {
	skyboxes: CompletionItem[];
	music: CompletionItem[];
	data_set_entries: DataSetItem[];
	blob_items: CompletionItem[];
	libModules: string[];
	artemisDir: string = "";
	constructor() {
		const thisDir = path.resolve("../");
		const adir = getArtemisDirFromChild(thisDir);
		debug("Artemis Directory: ");
		debug(adir);
		if (adir ===  null) {
			// Do something, throw an error, whatever it takes, artemis dir not found
			this.skyboxes = [];
			this.music = [];
			this.blob_items = [];
			this.data_set_entries = [];
			this.libModules = [];
			debug("Artemis directory not found. Global information not loaded.");
			artemisDirNotFoundError();
		} else {
			// Valid artemis dir has been found
			this.artemisDir = adir;
			this.skyboxes = this.findSkyboxes();
			this.music = this.findMusic();
			this.blob_items = [];
			// this.data_set_entries is not populated here, since loadObjectDataDocumentation() has a promise in it. 
			// That promise then populates the field when complete.
			this.data_set_entries = this.loadObjectDataDocumentation();
			this.libModules = this.loadLibs();
		}
		
	}

	private loadLibs(): string[] {
		let libs: string[] = [];
		let libPath = path.join(this.artemisDir,'data','missions','__lib__');
		libs = getFilesInDir(libPath,false);
		return libs;
	}

	private loadObjectDataDocumentation(): DataSetItem[] {
		const ds: DataSetItem[] = [];
		const ci: CompletionItem[] = [];
		const dataFolder = findSubfolderByName(this.artemisDir, "data");
		if (dataFolder !== null) {
			const files = getFilesInDir(dataFolder, false);
			for (const file of files) {
				//debug(file);
				if (file.endsWith("object_data_documentation.txt")) {
					debug("Reading file");
					readFile(file).then((text)=>{
						const lines = text.split("\n");
						let lineNum = 0;
						for (const line of lines) {
							// ignore the first 3 lines
							if (lineNum > 2) {
								const name = line.substring(0,31).trim();
								let typeCheck = line.substring(31,48);
								const isArr = typeCheck.includes("array");
								if (isArr) {
									typeCheck = typeCheck.replace("array","");
								}
								typeCheck = typeCheck.trim();
								if (isArr) {
									typeCheck = "List[" + typeCheck + "]";
								}
								const docs = line.substring(48).trim();
								this.data_set_entries.push({
									name: name,
									type: typeCheck,
									docs: docs
								});
								const deets: CompletionItemLabelDetails = {
									description: typeCheck
								}
								const ci: CompletionItem = {
									label: name,
									kind: CompletionItemKind.Text,
									documentation: docs,
									detail: "Type: " + typeCheck,
									labelDetails: deets
								};
								this.blob_items.push(ci);
							}
							lineNum++;
						}
						//debug(this.blob_items);
						//console.log(this.blob_items)
					});
					break;
				}
			}
		}
		return ds;
	}

	private findSkyboxes(): CompletionItem[] {
		const skyboxes: string[] = [];
		const ci: CompletionItem[] = [];
		const graphics = findSubfolderByName(this.artemisDir, "graphics");
		if (graphics !== null) {
			const files = getFilesInDir(graphics);
			for (const file of files) {
				if (file.includes("sky") && file.endsWith(".png")) {
					const last = file.lastIndexOf("/");
					let sb = file.substring(last+1).replace(".png","");
					skyboxes.push(sb);
					ci.push({
						label: path.basename(file).replace(".png","")
					});
	
				}
			}
		}
		return ci;
	}
	private findMusic(): CompletionItem[] {
		const options: string[] = [];
		const ci: CompletionItem[] = [];
		const music = findSubfolderByName(this.artemisDir, "music");
		if (music !== null) {
			const files = getFolders(music);
			for (const file of files) {
				ci.push({
					label: path.basename(file)
				});
			}
		}
		return ci;
	}
}

let globals: Globals = new Globals();

export function getGlobals() {
	if (globals === null) {
		try {
			globals = new Globals();
		} catch (e) {
			debug(e);
			debug("Error getting Globals information");
		}
	}
	return globals;
}

async function artemisDirNotFoundError() {
	const res = await connection.window.showErrorMessage("Root Artemis directory not found. Cannot load some important information.",{title:"Ignore"},{title:"Don't show again"});
	if (res !== undefined) {
		if (res.title === "Ignore") {
			// Do nothing
		} else if (res.title === "Don't show again") {
			// TODO: Add persistence to extension.
		}
	}
}