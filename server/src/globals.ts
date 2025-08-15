import { debug } from 'console';
import { findSubfolderByName, fixFileName, getArtemisDirFromChild, getFilesInDir, getFolders, readFile, readFileSync } from './fileFunctions';
import path = require('path');
import fs = require('fs');
import os = require('os');
import sharp = require('sharp');
import { CompletionItem, CompletionItemLabelDetails, CompletionItemKind, MarkupContent } from 'vscode-languageserver';
import { connection, sendToClient, showProgressBar } from './server';
import { ShipData } from './shipData';
import { sleep } from './python/python';
import { getGridIcons, parseIconSet } from './resources/iconSets';

interface DataSetItem {
	name: string,
	type: string,
	docs: string
}
interface WidgetStyleString {
	function: string,
	name: string,
	docs: string
}
export interface IconIndex {
	index: string,
	filePath: string
}
interface FaceFile {
	shortName: string,
	fileName: string
}

export class Globals {
	currentFile: string = "";
	skyboxes: CompletionItem[] = [];
	music: CompletionItem[] = [];
	data_set_entries: DataSetItem[] = [];
	widget_stylestrings: WidgetStyleString[] = [];
	blob_items: CompletionItem[] = [];
	libModules: string[] = [];
	libModuleCompletionItems: CompletionItem[] = [];
	shipData: ShipData;
	artemisDir: string = "";
	artFiles: CompletionItem[] = [];
	faceArtFiles: FaceFile[] = [];
	gridIcons: IconIndex[] = [];
	/**
	 * 0: Not loaded
	 * 1: Loading but not complete
	 * 2: Loaded
	 */
	loadingState = 0;
	
	constructor() {
		showProgressBar(true);
		const thisDir = path.resolve("../");
		const adir = getArtemisDirFromChild(thisDir);
		debug("Artemis Directory: ");
		debug(adir);
		if (adir) {
			this.artemisDir = adir;
			// TODO: load webview info after globals are gotten?
			// sendToClient("ships", this.artemisDir)
		} else {
			this.artemisDir = "";
		}
		this.shipData = new ShipData(this.artemisDir);
	}

	loadGlobals() {
		this.loadingState = 1;
		if (this.artemisDir ===  null) {
			// Do something, throw an error, whatever it takes, artemis dir not found
			this.skyboxes = [];
			this.music = [];
			this.blob_items = [];
			this.data_set_entries = [];
			this.widget_stylestrings = [];
			this.libModules = [];
			this.libModuleCompletionItems = [];
			this.shipData = new ShipData("");
			debug("Artemis directory not found. Global information not loaded.");
			artemisDirNotFoundError();
		} else {
			this.skyboxes = this.findSkyboxes();
			this.music = this.findMusic();
			this.blob_items = [];
			// this.data_set_entries is not populated here, since loadObjectDataDocumentation() has a promise in it. 
			// That promise then populates the field when complete.
			this.data_set_entries = this.loadObjectDataDocumentation();
			debug("Loading libs");
			this.libModules = this.loadLibs();
			let libPath = path.join(this.artemisDir,'data','missions','__lib__')
			fs.watch(libPath, (eventType, filename)=>{
				this.libModules = this.loadLibs();
			});
			debug("Done loading libs.")
			this.libModuleCompletionItems = [];
			debug("Getting ship data")
			this.shipData = new ShipData(this.artemisDir);
			this.shipData.load();
			debug("ship data gotten")
			for (const lib of this.libModules) {
				const ci: CompletionItem = {
					label: path.basename(lib),
					kind: CompletionItemKind.File
				}
				this.libModuleCompletionItems.push(ci);
			}
			this.artFiles = this.findArtFiles(true);
			this.faceArtFiles = this.loadFaceArt();
			const allFaceFiles = path.join(this.artemisDir, "data", "graphics", "allFaceFiles.txt");
			fs.watch(allFaceFiles, (eventType, filename)=>{
				if (eventType === "change") {
					this.faceArtFiles = this.loadFaceArt();
				}
			});
			parseIconSet(path.join(this.artemisDir,"data","graphics","grid-icon-sheet.png"),128,false);
			debug("Grid Icon Sheet parsed")
			this.gridIcons = getGridIcons();
			debug(this.faceArtFiles)
			debug("art files gotten")
		}
		this.loadingState = 2;
		// showProgressBar(false);
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
				// debug(file);

				// Here we get all stylestrings by parsing the documentation file.
				if (file.endsWith("widget_stylestring_documentation.txt")) {
					readFile(file).then((text)=>{
						const lines = text.split("\n");
						let lineNum = 0;
						for (const line of lines) {
							if (lineNum > 2) {
								const functionName = line.substring(0,23).trim();
								const stylestringName = line.substring(23,42).trim();
								const docs = line.substring(42).trim();

								this.widget_stylestrings.push({
									function: functionName,
									name: stylestringName,
									docs: docs
								});
							}
							lineNum += 1;
						}
						// debug(this.widget_stylestrings)
					});
				}
				// Now we get all the object_data options, used by blob.set() and blob.get()
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
					debug("Done reading object data docs")
				}
			}
		}
		return ds;
	}

	getCurrentFile(): string {
		return this.currentFile;
	}

	setCurrentFile(f:string): void {
		this.currentFile = fixFileName(f);
	}

	isCurrentFile(f:string): boolean {
		return fixFileName(f) === f;
	}

	private loadFaceArt(): FaceFile[] {
		let ret: FaceFile[] = [];
		const allFaceFiles = path.join(this.artemisDir, "data", "graphics", "allFaceFiles.txt");
		let faceInfo = readFileSync(allFaceFiles);
		let line = /(\w+)[ \t]+([\w-]+)/gm;
		let m: RegExpExecArray | null;
		while (m = line.exec(faceInfo)) {
			const ff: FaceFile = {
				shortName: m[1],
				fileName: m[2]
			}
			ret.push(ff);
		}
		return ret;
	}

	private findArtFiles(byID:boolean): CompletionItem[] {
		let ret: CompletionItem[] = [];
		const files = getFilesInDir(path.join(this.artemisDir,"data","graphics","ships"));
		const ids: string[] = [];
		if (byID) {
			for (const file of files) {
				if (file.endsWith(".obj")) {
					const id = path.basename(file).replace(".obj","").toLowerCase();
					ids.push(id);
					const docs: MarkupContent = {
						kind: "markdown",
						value: "![img](/img_dir)\n![diffuse](/diffuse_dir)"
					}
					const ci: CompletionItem = {
						label: id,
						kind: CompletionItemKind.File,
						insertText: id,
						documentation: docs
					}
					ret.push(ci);
					// debug(id);
				}
			}
		}
		// Build Temp folder
		const tempPath = path.join(os.tmpdir(),"cosmosImages");
		if (!fs.existsSync(tempPath)) {
			fs.mkdirSync(tempPath);
		}
		for (const file of files) {
			const baseName = path.basename(file).toLowerCase();
			let tempFile = path.join(tempPath,baseName);
			if (byID) tempFile = tempFile.replace(".png","_150.png");
			// if (!baseName.includes("_diffuse")) {
			// 	if (fs.existsSync(tempFile.replace("256","1024")) || fs.existsSync(tempFile.replace("1024","256"))) {
			// 		continue;
			// 	}
			// }
			// Regardless if we're using ID or not, we want to create the file
			if (baseName.endsWith(".png") && !baseName.includes("specular") && !baseName.includes("emissive") && !baseName.includes("normal")) {
				// debug(baseName)
				if (byID) {				
				// if (!fs.existsSync(tempFile)) {
					try {
						if (byID) {
							sharp(file).resize(150,150).toFile(tempFile);
						} else {
							sharp(file).resize(256,256).toFile(tempFile);
						}
					} catch (e) {
						debug(tempFile)
						debug(e);
					}

					for (const c of ret) {
						if (baseName.includes(c.label)) {
							const base = baseName.replace(".png","");
							let val = "";
							if (c.documentation !== undefined) val = (c.documentation as MarkupContent).value;
							// debug(baseName)
							if (!val.includes("img") && !baseName.includes("diffuse")) continue;
							if (!val.includes("diffuse") && baseName.includes("diffuse")) continue;
							// if (val.includes(base)) continue;
							if (baseName.includes("diffuse")) {
								val = val.replace("diffuse",baseName).replace("diffuse_dir",tempFile);
							} else {
								val = val.replace("img",baseName).replace("img_dir",tempFile);
							}
							// val = val + "![" + baseName + "](/" + tempFile + ")\n";
							// debug(val);
							c.documentation = {
								kind: "markdown",
								value: val
							};
						}
					}
					continue;
				}
				// Effectively an else statement
				if (file.endsWith(".png")) {
					const docs: MarkupContent = {
						kind: "markdown",
						value: ""
					}
					let val = "![" + path.basename(file) + "](/" + tempFile + ")"
					docs.value = val;
					// debug(val);
					const c: CompletionItem = {
						label: path.basename(file),
						kind: CompletionItemKind.File,
						documentation: docs,
						insertText: path.basename(file)
					}
					ret.push(c);
				}
			}
		}
		return ret;
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

	getAllMissions(): string[] {
		return getFolders(path.join(this.artemisDir,"data","missions"));
	}
	async awaitLoading() {
		while (this.loadingState !== 2) {
			if (this.loadingState === 0) {
				this.loadGlobals();
			}
			await sleep(50);
		}
		return this;
	}
}
let globals: Globals;
// sleep(100).then(()=>{
// 	globals = new Globals();
// })

export async function initializeGlobals(): Promise<Globals> {
	debug("Initializing globals")
	if (globals !== undefined) {
		return await globals.awaitLoading();
	}
	globals = new Globals();
	// globals.loadGlobals();
	return await globals.awaitLoading();
}


export function getGlobals(): Globals {
	if (globals === null || globals === undefined) {
		debug("Error getting Globals information - Globals not loaded");
		globals = new Globals();
		globals.loadGlobals();
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
