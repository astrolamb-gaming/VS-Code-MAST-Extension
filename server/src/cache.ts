import * as fs from 'fs';
import * as path from 'path';
import { CompletionItem, CompletionItemKind, CompletionItemLabelDetails, integer, SignatureInformation } from 'vscode-languageserver';
import { ClassTypings, FileCache, IClassObject, MastFile, PyFile, Function } from './data';
import { getLabelsInFile, LabelInfo, parseLabels } from './labels';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { debug } from 'console';
import { prepCompletions } from './autocompletion';
import { prepSignatures } from './signatureHelp';
import { parse, RX } from './rx';
import { IRouteLabel, loadMediaLabels, loadResourceLabels, loadRouteLabels } from './routeLabels';
import { findSubfolderByName, getArtemisDirFromChild, getFilesInDir, getFolders, getMissionFolder, getParentFolder, readFile, readZipArchive } from './fileFunctions';
import { storyJsonNotif, updateLabelNames } from './server';
import { URI } from 'vscode-uri';
import { compileMission, sleep } from './python';

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
	missionLibFolder: string = "";
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
		let parent = getParentFolder(this.missionURI);
		this.missionLibFolder = path.join(parent, "__lib__");
		this.missionName = path.basename(this.missionURI);
		this.storyJson = new StoryJson(path.join(this.missionURI,"story.json"));
		let files: string[] = getFilesInDir(this.missionURI);
		//debug(files);
		this.load();
	}

	load() {
		// (re)set all the arrays before (re)populating them.
		this.missionClasses = [];
		this.missionDefaultCompletions = [];
		this.missionDefaultFunctions = [];
		this.missionDefaultSignatures = [];
		this.missionMastModules = [];
		this.missionPyModules = [];
		this.pyFileInfo = [];
		this.resourceLabels = [];
		this.mediaLabels = [];
		this.mastFileInfo = [];
		this.storyJson.readFile().then(()=>{this.modulesLoaded()});
		loadSbs().then((p)=>{
			debug("Loaded SBS, starting to parse.");
			if (p !== null) {
				//debug(p.classes);
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

	async modulesLoaded() {
		const uri = this.missionURI;
		//debug(uri);
		if (uri.includes("sbs_utils")) {
			debug("sbs nope");
		}
		try {
			const libErrs: string[] = [];
			debug(this.missionLibFolder);
			const lib = this.storyJson.mastlib.concat(this.storyJson.sbslib);
			let complete = 0;
			for (const zip of lib) {
				const zipPath = path.join(this.missionLibFolder,zip);
				readZipArchive(zipPath).then((data)=>{
					//debug("Zip archive read for " + zipPath);
					this.handleZipData(data,zip);
					complete += 1;
				}).catch(err =>{
					debug("Error unzipping. \n" + err);
					if (("" + err).includes("Invalid filename")) {
						libErrs.push("File does not exist:\n" + zipPath);
					}
					complete += 1;
				});
			}
			while (complete < lib.length) {
				await sleep(50);
			}
			if (libErrs.length > 0) {
				storyJsonNotif(0,this.storyJson.uri,"",libErrs.join("\n"));
			}
		}catch(e) {
			debug("Error in modulesLoaded()");
			debug(e);
		}
		
	}

	handleZipData(zip: Map<string, string>, parentFolder:string = "") {
		//debug(zip);
		zip.forEach((data, file)=>{
			//debug(file)
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
				if (file.includes("sbs_utils") && !file.includes("procedural")) {
					// Don't wanat anything not procedural included???
					return;
				}
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
			// for (const c of this.missionClasses) {
			// 	ci.push(c.completionItem);
			// }
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

interface StoryJsonError {
	libName: string,
	exists: boolean,
	latestVersion: string
}

export class StoryJson {
	uri: string = "";
	sbslib: string[] = [];
	mastlib: string[] = [];
	storyJsonErrors: StoryJsonError[] = [];
	complete: boolean = false;
	regex: RegExp = /\.v(\d+)\.(\d+)\.(\d+)\.(((mast|sbs)lib)|(zip))/;
	errorCheckIgnore = false;

	constructor(uri: string) {
		this.uri = uri;
	}

	checkForErrors() {
		const files = this.mastlib.concat(this.sbslib);
		let errors = false;
		debug(files)
		for (const m of files) {
			const libDir = path.join(globals.artemisDir,"data","missions","__lib__",m);
			const res = this.regex.exec(m);
			if (res === null) break; // Should never occur
			const libName = m.substring(0,res.index);
			
			if (globals.libModules.includes(libDir)) {
				// Module found. Check for updated versions
				const latest = path.basename(this.getLatestVersion(libName));
				if (latest === m) {
					continue;
				} else {
					// Recommend latest version
					errors = true;
					storyJsonNotif(1,this.uri,latest,m)
				}
			} else {
				// Module NOT found. Show error message and recommend latest version.
				const lv = path.basename(this.getLatestVersion(libName));
				debug("Module NOT found");
				storyJsonNotif(0,this.uri,lv,m);
			}
		}
	}

	getVersionPriority(version:string) : integer {
		try {
			const res = this.regex.exec(version);
			if (res === null) return 0; // Should never occur
			const major = res[1].padStart(4,"0");
			const minor = res[2].padStart(4,"0");
			const incremental = res[3].padStart(4,"0");
			const ret =  major + minor + incremental;
			if (ret === "000300090039") return 0;
			return Number.parseInt(ret);
		} catch (e) {
			return 0;
		}
	}

	getLatestVersion(name:string) {
		let version = 0;
		let latestFile = "";
		for (const file of globals.libModules) {
			if (file.includes(name)) {
				const v = this.getVersionPriority(file);
				if (v > version) {
					version = v;
					latestFile = file;
				}
			}
		}
		return latestFile;
	}

	/**
	 * Must be called after instantiating the object.
	 */
	async readFile() {
		try {
			const data = fs.readFileSync(this.uri, "utf-8");
			this.parseFile(data);
			this.checkForErrors();
		} catch (e) {
			debug("Couldn't read file");
			storyJsonNotif(0,this.uri,"","");
			debug(e);
		}
	}

	/** Only call this from readFile() */
	private parseFile(text:string) {
		const story: StoryJsonContents = JSON.parse(text);
		//debug(story);
		if (story.sbslib) this.sbslib = story.sbslib;
		if (story.mastlib) this.mastlib = story.mastlib;
		this.complete = true;
		// debug("Sending notification to client");
		// storyJsonNotif(0,this.uri,"","");
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
export function getCache(name:string, reloadCache:boolean = false): MissionCache {
	let ret = undefined;
	if (name.startsWith("file")) {
		name = URI.parse(name).fsPath;
	}
	//debug("Trying to get cache with name: " + name);
	const mf = getMissionFolder(name);
	//debug(mf);
	for (const cache of caches) {
		if (cache.missionName === name || cache.missionURI === mf) {
			cache.load();
			return cache;
		}
	}
	if (ret === undefined) {
		ret = new MissionCache(name);
		caches.push(ret);
	}
	return ret;
}