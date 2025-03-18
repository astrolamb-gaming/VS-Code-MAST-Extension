import * as fs from 'fs';
import * as path from 'path';
import { CompletionItem, integer, SignatureInformation } from 'vscode-languageserver';
import { IClassObject, MastFile, PyFile, Function } from './data';
import { getLabelsInFile, LabelInfo } from './labels';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { debug } from 'console';
import { prepCompletions } from './autocompletion';
import { prepSignatures } from './signatureHelp';
import { parse, RX } from './rx';
import { IRouteLabel, loadMediaLabels, loadResourceLabels, loadRouteLabels } from './routeLabels';
import { getFilesInDir, getInitContents, getMissionFolder, getParentFolder, readFile, readZipArchive } from './fileFunctions';
import { connection, notifyClient, sendToClient } from './server';
import { URI } from 'vscode-uri';
import { getGlobals } from './globals';


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
		this.storyJson = new StoryJson(path.join(this.missionURI,"story.json"));
		this.storyJson.readFile().then(()=>{this.modulesLoaded()});
		loadSbs().then((p)=>{
			debug("Loaded SBS, starting to parse.");
			if (p !== null) {
				this.missionPyModules.push(p);
				this.missionClasses = this.missionClasses.concat(p.classes);
				this.missionDefaultCompletions = this.missionDefaultCompletions.concat(p.defaultFunctionCompletionItems);
				for (const s of p.defaultFunctions) {
					this.missionDefaultSignatures.push(s.signatureInformation);
				}
			}
		});
		let files: string[] = getFilesInDir(this.missionURI);
		//debug(files);
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
			//debug(this.missionLibFolder);
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
			// while (complete < lib.length) {
			// 	await sleep(50);
			// }
			// if (libErrs.length > 0) {
			// 	storyJsonNotif(0,this.storyJson.uri,"",libErrs.join("\n"));
			// }
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
				//debug("Checking: " + file)
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
		debug(ci);
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
	 * TODO: This should only return variables that are in scope
	 * @returns 
	 */
	getVariables(file:string): CompletionItem[] {
		const parent = getParentFolder(URI.parse(file).fsPath);
		const inits = getInitContents(file);
		let ci: CompletionItem[] = [];
		for (const m of this.mastFileInfo) {
			if (m.parentFolder === parent) {
				// Check if the file is included in the init file
				for (const i of inits) {
					if (i === path.basename(m.uri)) {
						ci = ci.concat(m.variables);
					}
				}
				
			}
		}
		//const arrUniq = [...new Map(ci.map(v => [v.label, v])).values()]
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
		//debug(li);
		// Remove duplicates (should just be a bunch of END entries)
		// Could also include labels that exist in another file
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
	regex: RegExp = /\.v((\d+)\.(\d+)\.(\d+))\.(\d+\.)*(((mast|sbs)lib)|(zip))/;
	errorCheckIgnore = false;

	constructor(uri: string) {
		this.uri = uri;
	}

	getModuleBaseName(module:string) {
		const res = this.regex.exec(module);
		if (res === null) return ""; // Should never occur
		return module.substring(0,res.index);
	}

	checkForErrors() {
		const files = this.mastlib.concat(this.sbslib);
		let errors = -1;
		//debug(files)
		for (const m of files) {
			const libDir = path.join(getGlobals().artemisDir,"data","missions","__lib__",m);
			const libName = this.getModuleBaseName(m);
			if (getGlobals().libModules.includes(libDir)) {
				// Module found. Check for updated versions
				let latest = this.getLatestVersion(libName);
				if (latest === "") {
					continue;
				}
				latest = path.basename(latest);
				// This is the latest version, move on to next module
				if (latest === m) {
					continue;
				} else {
					// Recommend latest version
					errors = 1;
					debug(latest);
					debug(m)
					break;
				}
			} else {
				// Module NOT found. Show error message and recommend latest version.
				errors = 0;
				const lv = path.basename(this.getLatestVersion(libName));
				debug("Module NOT found");
				break;
			}
		}
		if (errors != -1) {
			this.storyJsonError(errors);
		}
	}

	getVersionPriority(version:string) : number {
		try {
			const res = this.regex.exec(version);
			if (res === null) return 0; // Should never occur, but gotta be sure
			// Here we standardize the format of the number.
			// Each version section could have various lengths, e.g. 1.12.40
			// Therefore, to have a consistent standard even with large numbers, 
			// we put each one into a string with a length of four, then add them
			// together before we parse the number.
			// Dev versions (using a fourth version number), are accounted for using decimal places.
			const major = res[2].padStart(4,"0");
			const minor = res[3].padStart(4,"0");
			const incremental = res[4].padStart(4,"0");
			let dev = res[5];
			if (dev !== null && dev !== undefined) {
				dev = dev.replace(".","").padStart(4,"0");
			} else {
				dev = "0";
			}
			const ret =  major + minor + incremental + "." + dev;
			// Since version 1.0.0 has mastlibs designated 3.9.39, we compensate for that, assigning the file a value slightly above zero.
			if (ret.includes("000300090039")) return 0.0001;
			return Number.parseFloat(ret);
		} catch (e) {
			debug(e);
			return 0;
		}
	}

	getVersionString(name:string): string {
		const res = this.regex.exec(name);
		if (res === null) return "";
		return res[0];
	}

	compareVersions() {

	}

	/**
	 * 
	 * @param name Name of the module, excluding the version number (call getModuleBaseName() first)
	 * @returns String with the name of the most recent version. If the
	 */
	getLatestVersion(name:string) {
		debug("Name: " + name);
		let version = 0;
		debug(version);
		let latestFile = "";
		for (const file of getGlobals().libModules) {
			if (file.includes(name)) {
				debug(file);
				const v = this.getVersionPriority(file);
				debug(v)
				if (v > version) {
					debug(file);
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
			// storyJsonNotif(0,this.uri,"","");
			debug(e);
		}
	}

	async updateModule(module:string, newVersion: string="") {
		try {
			let data = fs.readFileSync(this.uri,"utf-8");
			if (newVersion === "") {
				newVersion = this.getLatestVersion(module);
				debug(newVersion);
			}
			data = data.replace(module,newVersion);
			fs.writeFileSync(this.uri, data);
			this.parseFile(data);
			this.checkForErrors();
		} catch (e) {
			debug(e);
			notifyClient("Could not update module\n" + e);
		}
	}

	async updateAllModules() {
		const libs = this.mastlib.concat(this.sbslib);
		try {
		let data = fs.readFileSync(this.uri,"utf-8");
		for (const module of libs) {
			let name = this.getModuleBaseName(module);
			const newest = this.getLatestVersion(name);
			data = data.replace(module, path.basename(newest));
		}
		fs.writeFileSync(this.uri,data);
		this.parseFile(data);
		this.checkForErrors();
		} catch (e) {
			debug(e);
			notifyClient("Could not update module\n" + e);
		}
	}

	/** Only call this from readFile() */
	private parseFile(text:string) {
		const story: StoryJsonContents = JSON.parse(text);
		if (story.sbslib) this.sbslib = story.sbslib;
		if (story.mastlib) this.mastlib = story.mastlib;
	}

	/**
	 * @param errorType 
	 * story.json error types:
	 * 0 - Error - Referenced file does not exist
	 * 1 - Warning - Referenced file is not the latest version
	 * @param jsonUri 
	 */
	async storyJsonError(errorType: integer) {

		const useLatest: string = "Update to latest";
		const manual: string = "Update manually";
		const hide: string = "Don't show again";

		const err = "story.json contains references to files that do not exist";
		const warn = "Newer versions are available for story.json references";
		let message;
		if (errorType === 0) message = err;
		if (errorType === 1) message = warn;
		if (message === undefined) return;
		
		let ret = await connection.window.showErrorMessage(
			message,
			{title: useLatest},
			{title: manual},
			//{title: hide} // TODO: Add this later!!!!!!
		);
		if (ret === undefined) return;
		if (ret.title === useLatest) {
			// Update story.json to reference latest file versions
			this.updateAllModules();
		} else if (ret.title === manual) {
			// Open story.json
			sendToClient("showFile",this.uri);
		} else if (ret.title === hide) {
			// Add persistence setting to this
		}
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
			if (reloadCache) cache.load();
			return cache;
		}
	}
	if (ret === undefined) {
		ret = new MissionCache(name);
		caches.push(ret);
	}
	return ret;
}


