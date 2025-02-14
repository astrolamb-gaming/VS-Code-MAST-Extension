import * as fs from 'fs';
import * as path from 'path';
import { CompletionItem, CompletionItemKind, CompletionItemLabelDetails, SignatureInformation } from 'vscode-languageserver';
import { ClassTypings, FileCache, IClassObject, MastFile, PyFile, Function } from './data';
import { getLabelsInFile, LabelInfo, parseLabels } from './labels';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { debug } from 'console';
import { prepCompletions } from './autocompletion';
import { prepSignatures } from './signatureHelp';
import { parse, RX } from './rx';
import { IRouteLabel, loadMediaLabels, loadResourceLabels, loadRouteLabels } from './routeLabels';
import { findSubfolderByName, getFilesInDir, getFolders, getMissionFolder, getParentFolder, readFile, readZipArchive } from './fileFunctions';
import { updateLabelNames } from './server';
import { URI } from 'vscode-uri';

export class Globals {
	skyboxes: CompletionItem[];
	music: CompletionItem[];
	data_set_entries: DataSetItem[];
	blob_items: CompletionItem[];
	constructor() {
		this.skyboxes = this.findSkyboxes();
		this.music = this.findMusic();
		this.blob_items = [];
		this.data_set_entries = this.loadObjectDataDocumentation();
		
	}
	private loadObjectDataDocumentation(): DataSetItem[] {
		const ds: DataSetItem[] = [];
		const ci: CompletionItem[] = [];
		let initialDir = "../../../../";
		const dataFolder = findSubfolderByName(initialDir, "data");
		if (dataFolder !== null) {
			const files = getFilesInDir(dataFolder);
			for (const file of files) {
				if (file.endsWith("object_data_documentation.txt")) {
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
					});
				}
			}
		}
		return ds;
	}

	private findSkyboxes(): CompletionItem[] {
		const skyboxes: string[] = [];
		const ci: CompletionItem[] = [];
		let initialDir = "../../../../";
		const graphics = findSubfolderByName(initialDir, "graphics");
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
		let initialDir = "../../../../";
		const music = findSubfolderByName(initialDir, "music");
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

const globals: Globals = new Globals();

export function getGlobals() {
	return globals;
}

export function loadCache(dir: string) {
	// TODO: Need a list of caches, in case there are files from more than one mission folder open
let cache = getCache(dir);

	getMissionFolder(dir);



	// if (cache === undefined) {
	// 	cache = new MissionCache(dir);
	// 	caches.push(cache);
	// }
	// const defSource = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/sbs_utils/mast/mast.py";
	// const defSource2 = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/sbs_utils/mast/maststory.py";
	//loadTypings().then(()=>{ debug("Typings Loaded" )});
//loadRouteLabels().then(()=>{ debug("Routes Loaded") });
	// getRexEx(defSource).then(()=>{ debug("Regular Expressions gotten")});
	// getRexEx(defSource2).then(()=>{ debug("Regular Expressions 2 gotten")
	// 	debug("Label?: ");
	// 	debug(exp.get("Label"));
	// });
	
	//debug(getStoryJson(dir));
}

class MissionSubFolder {
	uri: string;

	constructor(uri: string) {
		this.uri = uri;

	}
}

export class MissionCache {

	missionName: string = "";
	missionURI: string = "";
	storyJson: StoryJson;
	// The Modules are the default sbslib and mastlib files.
	// They apply to ALL files in the mission folder.
	missionPyModules: PyFile[] = [];
	missionMastModules: MastFile[] = [];
	missionDefaultCompletions: CompletionItem[] = [];
	missionDefaultSignatures: SignatureInformation[] = [];
	missionClasses: IClassObject[] = [];
	missionDefaultFunctions: Function[] = [];

	// string is the full file path and name
	// FileCache is the information associated with the file
	pyFileInfo: PyFile[] = [];
	mastFileInfo: MastFile[] = [];

	//// Other Labels
	// Route Labels - From RouteDecoratorLabel class
	routeLabels: IRouteLabel[] = [];
	// Media Labels - From procedural/media.py # _media_schedule()
	mediaLabels: IRouteLabel[] = [];
	// Resource Labels - Not sure how best to handle these...
	/**
	 * TODO: See about parsing all python classes that derive from Label
	 */
	resourceLabels: IRouteLabel[] = [];

	constructor(workspaceUri: string) {
		//debug(workspaceUri);

		this.resourceLabels = loadResourceLabels();
		this.mediaLabels = this.mediaLabels.concat(loadMediaLabels());

		this.missionURI = getMissionFolder(workspaceUri);
		debug(this.missionURI);
		this.missionName = path.basename(this.missionURI);
		this.storyJson = new StoryJson(path.join(this.missionURI,"story.json"));
		this.storyJson.readFile().then(()=>{this.modulesLoaded()});
		
		let files: string[] = getFilesInDir(this.missionURI);
		//debug(files);

		loadSbs().then((p)=>{
			if (p !== null) {
				debug(p.classes);
				this.missionPyModules.push(p);
				this.missionClasses = this.missionClasses.concat(p.classes);
				this.missionDefaultCompletions = this.missionDefaultCompletions.concat(p.defaultFunctionCompletionItems);
				for (const s of p.defaultFunctions) {
					this.missionDefaultSignatures.push(s.signatureInformation);
				}
			}
		});

		for (const file of files) {
			//debug(path.extname(file));
			if (path.extname(file) === ".mast") {
				//debug(file);
				if (path.basename(file).includes("__init__")) {
					//debug("INIT file found");
				} else {
					// Parse MAST File
					const m: MastFile = new MastFile(file);
					this.mastFileInfo.push(m);
				}
				
				
			}
			if (path.extname(file) === ".py") {
				//debug(file);
				if (path.basename(file).includes("__init__")) {
					//debug("INIT file found");
				} else {
					// Parse Python File
					const p: PyFile = new PyFile(file);
					this.pyFileInfo.push(p);
				}
			}
		}

	}

	modulesLoaded() {
		const uri = this.missionURI;
		//debug(uri);
		if (uri.includes("sbs_utils")) {
			debug("sbs nope");
		}
		const missionLibFolder = path.join(getParentFolder(uri), "__lib__");
		debug(missionLibFolder);
		const lib = this.storyJson.mastlib.concat(this.storyJson.sbslib);
		for (const zip of lib) {
			const zipPath = path.join(missionLibFolder,zip);
			readZipArchive(zipPath).then((data)=>{
				//debug("Zip archive read for " + zipPath);
				this.handleZipData(data,zip);
			}).catch(err =>{
				debug("Error unzipping. \n" + err);
			});
		}
		
	}

	handleZipData(zip: Map<string, string>, parentFolder:string = "") {
		//debug(zip);
		zip.forEach((data, file)=>{
			if (parentFolder !== "") {
				file = parentFolder + path.sep + file;
			}
			//debug(file);
			if (file.endsWith("__init__.mast") || file.endsWith("__init__.py")) {
				// Do nothing
			} else if (file.endsWith(".py")) {
				this.routeLabels = this.routeLabels.concat(loadRouteLabels(data));
				// this.mediaLabels = this.mediaLabels.concat(loadMediaLabels(data));
				// this.resourceLabels = this.resourceLabels.concat(loadResourceLabels(data));
				const p = new PyFile(file, data);
				this.missionPyModules.push(p);
				this.missionClasses = this.missionClasses.concat(p.classes);
				//debug(this.missionClasses);
				this.missionDefaultCompletions = this.missionDefaultCompletions.concat(p.defaultFunctionCompletionItems);
				//this.missionDefaultSignatures = this.missionDefaultSignatures.concat(p.defaultFunctions)
				//p.defaultFunctions
				this.missionDefaultFunctions = this.missionDefaultFunctions.concat(p.defaultFunctions);
				for (const s of p.defaultFunctions) {
					this.missionDefaultSignatures.push(s.signatureInformation);
				}
			} else if (file.endsWith(".mast")) {
				//debug("Building file: " + file);
				const m = new MastFile(file, data);
				this.missionMastModules.push(m);
			}
		});
		
		
		//debug(this.missionDefaultCompletions);
		//debug(this.missionClasses);
	}

	getRouteLabels(): CompletionItem[] {
		let ci: CompletionItem[] = [];
		for (const r of this.routeLabels) {
			ci.push(r.completionItem);
		}
		return ci;
	}

	getMediaLabels(): CompletionItem[] {
		let ci: CompletionItem[] = [];
		for (const r of this.mediaLabels) {
			ci.push(r.completionItem);
		}
		return ci;
	}

	getResourceLabels(): CompletionItem[] {
		let ci: CompletionItem[] = [];
		for (const r of this.resourceLabels) {
			ci.push(r.completionItem);
		}
		return ci;
	}

	
	/**
	 * @param fileUri The uri of the file. 
	 * @returns List of {@link LabelInfo LabelInfo} applicable to the current scope
	 */
	getLabels(textDocument: TextDocument): LabelInfo[] {
		let fileUri: string = textDocument.uri;
		if (fileUri.startsWith("file")) {
			fileUri = URI.parse(fileUri).fsPath;
		}
		let li: LabelInfo[] = [];
		//debug(this.mastFileInfo);
		for (const f of this.mastFileInfo) {
			if (f.uri === fileUri) {
				li = li.concat(f.labelNames);
			}
			// Check if the mast files are in scope
			// TODO: Check init.mast for if any files should not be included
			//debug(fileUri);
			if (f.parentFolder === getParentFolder(fileUri)) {
				//debug("adding labels for: ");
				//debug(f);
				li = li.concat(f.labelNames);
			}
		}
		// Remove duplicates (should just be a bunch of END entries)
		const arrUniq = [...new Map(li.map(v => [v.name, v])).values()]
		return arrUniq;
	}

	/**
	 * Call when the contents of a file changes
	 * @param textDocument 
	 */
	updateLabels(textDocument: TextDocument) {
		let fileUri: string = textDocument.uri;
		if (fileUri.startsWith("file")) {
			fileUri = URI.parse(fileUri).fsPath;
		}
		for (const file of this.mastFileInfo) {
			if (file.uri === fileUri) {
				file.labelNames = getLabelsInFile(textDocument.getText(), textDocument.uri);
			}
		}
	}

	/**
	 * @param _class String name of the class that we're dealing with. Optional. Default value is an empty string, and the default functions will be returned.
	 * @returns List of {@link CompletionItem CompletionItem} related to the class, or the default function completions
	 */
	getCompletions(_class: string = "") {
		//debug(this.missionDefaultCompletions.length);
		let ci:CompletionItem[] = [];
		// Don't need to do this, but will be slightly faster than iterating over missionClasses and then returning the defaults
		if (_class === "") {
			//debug(ci.length);
			ci = ci.concat(this.missionDefaultCompletions);
			for (const c of this.missionClasses) {
				ci.push(c.completionItem);
			}
			// TODO: Add variables in scope
			return ci;
		}
		debug(this.missionDefaultCompletions.length);
		for (const c of this.missionClasses) {
			if (c.name === _class) {
				debug(c.name + " is the class we're looking for.")
				debug(c.methodCompletionItems);
				return c.methodCompletionItems;
			}
		}
		return this.missionDefaultCompletions;
	}

	getMethodSignatures(name: string) {
		let si: SignatureInformation[] = this.missionDefaultSignatures;
		// .filter((sig, index, arr)=>{
		// 	sig.label === name;
		// });
		// TODO: Add functions from py files in local directory
		return si;
	}

}

interface DataSetItem {
	name: string,
	type: string,
	docs: string
}



interface StoryJsonContents {
	sbslib: string[],
	mastlib: string[]
}

export class StoryJson {
	uri: string = "";
	sbslib: string[] = [];
	mastlib: string[] = [];
	complete: boolean = false;

	constructor(uri: string) {
		this.uri = uri;
	}

	/**
	 * Must be called after instantiating the object.
	 */
	async readFile() {
		try {
			const data = fs.readFileSync(this.uri, "utf-8");
			this.parseFile(data);
		} catch (e) {
			debug("Couldn't read file");
			debug(e);
		}
	}

	/** Only call this from readFile() */
	private parseFile(text:string) {
		const story: StoryJsonContents = JSON.parse(text);
		debug(story);
		if (story.sbslib) this.sbslib = story.sbslib;
		if (story.mastlib) this.mastlib = story.mastlib;
		this.complete = true;
	}
}

const sourceFiles: PyFile[] = []
export function getSourceFiles(): PyFile[] { return sourceFiles; }

async function loadTypings(): Promise<void> {
	try {
		//const { default: fetch } = await import("node-fetch");
		//const fetch = await import('node-fetch');
		//let github : string = "https://github.com/artemis-sbs/sbs_utils/raw/refs/heads/master/mock/sbs.py";
		let gh : string = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/typings/";
		// TODO: try getting local files. If this fails, then use the github files.
		for (const page in files) {
			let url = gh+files[page]+".pyi";
			const data = await fetch(url);
			const textData = await data.text();
			//sourceFiles.push(parseWholeFile(textData, files[page]));
			sourceFiles.push(new PyFile(url));
		}
		prepCompletions(sourceFiles);
		prepSignatures(sourceFiles);
	} catch (err) {
		debug("\nFailed to load\n"+err as string);
	}
}

async function loadSbs(): Promise<PyFile|null>{
	let gh: string = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/mock/sbs.py";
	let text = "";
	try {
		const data = await fetch(gh);
		text = await data.text();
		return new PyFile(gh, text);
	} catch (e) {
		debug("Can't find sbs.py on github");
		try {
			gh = path.join(__dirname, "sbs.py");
			text = await readFile(gh);
			return new PyFile(gh, text);
		} catch (ex) {
			debug("Can't find sbs.py locally either.");
		}
	}
	return null;
}

const expressions: RX[] = [];
const exp: Map<string, RegExp> = new Map();
async function getRexEx(src: string) :Promise<void> {
	const data = await fetch(src);
	const txt = await data.text();
	parse(txt, exp);
	let name: string = "Geralt";
	let age: number = 95;
	let message: string = `The Witcher is of age ${age} and his name is ${name}`;
}

let files: string[] = [
	"sbs/__init__",
	"sbs_utils/agent",
	"sbs_utils/consoledispatcher",
	"sbs_utils/damagedispatcher",
	"sbs_utils/extra_dispatcher",
	"sbs_utils/faces",
	"sbs_utils/fs",
	"sbs_utils/futures",
	"sbs_utils/griddispatcher",
	"sbs_utils/gridobject",
	"sbs_utils/gui",
	"sbs_utils/handlerhooks",
	"sbs_utils/helpers",
	"sbs_utils/layout",
	"sbs_utils/lifetimedispatchers",
	"sbs_utils/objects",
	"sbs_utils/scatter",
	"sbs_utils/spaceobject",
	"sbs_utils/tickdispatcher",
	"sbs_utils/vec",
	"sbs_utils/mast/label",
	"sbs_utils/mast/mast",
	"sbs_utils/mast/mast_sbs_procedural",
	"sbs_utils/mast/mastmission",
	"sbs_utils/mast/mastobjects",
	"sbs_utils/mast/mastscheduler",
	"sbs_utils/mast/maststory",
	"sbs_utils/mast/maststorypage",
	"sbs_utils/mast/maststoryscheduler",
	"sbs_utils/mast/parsers",
	"sbs_utils/mast/pollresults",
	"sbs_utils/pages/avatar",
	"sbs_utils/pages/shippicker",
	"sbs_utils/pages/start",
	"sbs_utils/pages/layout/layout",
	"sbs_utils/pages/layout/text_area",
	"sbs_utils/pages/widgets/control",
	"sbs_utils/pages/widgets/layout_listbox",
	"sbs_utils/pages/widgets/listbox",
	"sbs_utils/pages/widgets/shippicker",
	"sbs_utils/procedural/behavior",
	"sbs_utils/procedural/comms",
	"sbs_utils/procedural/cosmos",
	"sbs_utils/procedural/execution",
	"sbs_utils/procedural/grid",
	"sbs_utils/procedural/gui",
	"sbs_utils/procedural/internal_damage",
	"sbs_utils/procedural/inventory",
	"sbs_utils/procedural/links",
	"sbs_utils/procedural/maps",
	"sbs_utils/procedural/query",
	"sbs_utils/procedural/roles",
	"sbs_utils/procedural/routes",
	"sbs_utils/procedural/science",
	"sbs_utils/procedural/screen_shot",
	"sbs_utils/procedural/ship_data",
	"sbs_utils/procedural/signal",
	"sbs_utils/procedural/space_objects",
	"sbs_utils/procedural/spawn",
	"sbs_utils/procedural/style",
	"sbs_utils/procedural/timers"
];

let caches: MissionCache[] = [];


/**
 * 
 * @param name Can be either the name of the mission folder, or a URI to that folder or any folder within the mission folder.
 * @returns 
 */
export function getCache(name:string): MissionCache {
	let ret = undefined;
	if (name.startsWith("file")) {
		name = URI.parse(name).fsPath;
	}
	//debug("Trying to get cache with name: " + name);
	const mf = getMissionFolder(name);
	//debug(mf);
	for (const cache of caches) {
		if (cache.missionName === name || cache.missionURI === mf) {
			return cache;
		}
	}
	if (ret === undefined) {
		ret = new MissionCache(name);
		caches.push(ret);
	}
	return ret;
}