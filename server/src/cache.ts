import * as fs from 'fs';
import * as path from 'path';
import { CompletionItem, integer, Position, SignatureInformation } from 'vscode-languageserver';
import { MastFile, PyFile } from './data';
import { parseLabelsInFile, LabelInfo, getMainLabelAtPos } from './tokens/labels';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { debug } from 'console';
import { prepSignatures } from './signatureHelp';
import { parse, RX } from './rx';
import { IRouteLabel, loadMediaLabels, loadResourceLabels, loadRouteLabels } from './tokens/routeLabels';
import { fixFileName, getFilesInDir, getInitContents, getInitFileInFolder, getMissionFolder, getParentFolder, readFile, readZipArchive } from './fileFunctions';
import { connection, notifyClient, showProgressBar as showProgressBar, sendToClient } from './server';
import { URI } from 'vscode-uri';
import { getGlobals } from './globals';
import * as os from 'os';
import { Variable } from './tokens/variables';
import { getMusicFiles } from './resources/audioFiles';
import { Function } from "./data/function";
import { ClassObject } from './data/class';
import { StoryJson } from './data/storyJson';
import { sleep } from './python/python';


const includeNonProcedurals = [
	"scatter",
	"faces",
	"names",
	"vec.py",
	"spaceobject.py",
	"agent"
]

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
	ingoreInitFileMissing = false;
	// The Modules are the default sbslib and mastlib files.
	// They apply to ALL files in the mission folder.
	missionPyModules: PyFile[] = [];
	missionMastModules: MastFile[] = [];
	// missionDefaultCompletions: CompletionItem[] = [];
	missionDefaultSignatures: SignatureInformation[] = [];
	missionClasses: ClassObject[] = [];
	missionDefaultFunctions: Function[] = [];


	// These are for the files specific to this mission.
	pyFileCache: PyFile[] = [];
	mastFileCache: MastFile[] = [];

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
		debug("Starting MissionCache.load()");
		showProgressBar(true);
		// (re)set all the arrays before (re)populating them.
		this.missionClasses = [];
		// this.missionDefaultCompletions = [];
		this.missionDefaultFunctions = [];
		this.missionDefaultSignatures = [];
		this.missionMastModules = [];
		this.missionPyModules = [];
		this.pyFileCache = [];
		this.resourceLabels = [];
		this.mediaLabels = [];
		this.mastFileCache = [];
		this.storyJson = new StoryJson(path.join(this.missionURI,"story.json"));
		this.storyJson.readFile()
			.then(()=>{
				showProgressBar(true);
				this.modulesLoaded().then(()=>{
					debug("Modules loaded for " + this.missionName);
					showProgressBar(false);
				})
			})
			// .finally(()=>{debug("Finished loading modules")});
		loadSbs().then((p)=>{
			showProgressBar(true);
			if (p !== null) {
				this.missionPyModules.push(p);
				debug("addding " + p.uri);
				this.missionClasses = this.missionClasses.concat(p.classes);
				// this.missionDefaultCompletions = this.missionDefaultCompletions.concat(p.getDefaultMethodCompletionItems());
				// TODO: This is not doing anything anymore pretty sure
				for (const s of p.defaultFunctions) {
					this.missionDefaultSignatures.push(s.signatureInformation);
				}
			}
			debug("Finished loading sbs_utils for " + this.missionName);
			showProgressBar(false);
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
					this.mastFileCache.push(m);
				}
				

				
			}
			if (path.extname(file) === ".py") {
				//debug(file);
				if (path.basename(file).includes("__init__")) {
					//debug("INIT file found");
				} else {
					// Parse Python File
					const p: PyFile = new PyFile(file);
					this.pyFileCache.push(p);
				}
			}
		}
		//this.checkForInitFolder(this.missionURI);
		debug("Number of py files: "+this.pyFileCache.length);
	}

	async checkForInitFolder(folder:string) : Promise<boolean> {
		// if (this.ingoreInitFileMissing) return;
		if (getInitFileInFolder(folder) === undefined) {
			debug("No __init__.mast file for this folder.");
			debug(folder);
			let ret = await connection.window.showErrorMessage(
				"No '__init__.mast' file found in this folder.",
				{title: "Create With Files"},
				{title: "Create Empty"},
				{title: "Ignore"},
				//{title: hide} // TODO: Add this later!!!!!!
			);
			if (ret === undefined) return true;
			if (ret.title === "Create With Files") {
				// Create a new __init__.mast file
				// Then add all files in folder
				this.createInitFile(folder, true);
			} else if (ret.title === "Create Empty") {
				// Create a new __init__.mast file
				this.createInitFile(folder, false);
			} else if (ret.title === "Ignore") {
				return true;
			}
		}
		return false;
	}

	private async createInitFile(folder: string, withFiles:boolean) {
		try {
			let contents: string = "";
			if (withFiles) {
				let files = getFilesInDir(folder,false);
				for (const f of files) {
					if (f.endsWith("__init__.mast")) continue;
					if (!f.endsWith(".mast") && !f.endsWith(".py")) continue;
					const baseDir = path.basename(f);
					contents = contents + "import " + baseDir + "\n";
				}
			}
			fs.writeFile(path.join(folder,"__init__.mast"), contents, ()=>{
				// Reload cache?
				console.log('File created successfully!');
			});
		} catch (err) {
			console.error('Error writing file:', err);
		}
	}

	// TODO: When a file is opened, check if it is in __init__.mast. If not, prompt the user to add it.
	private async addToInitFile(folder:string, newFile:string) {
		try {
			fs.writeFile(path.join(folder,"__init__.mast"), "\n" + newFile, {flag: "a+"}, ()=>{});
		} catch (e) {
			debug(e);
		}
	}

	async modulesLoaded() {
		const uri = this.missionURI;
		debug(uri);
		if (uri.includes("sbs_utils")) {
			debug("sbs nope");
		}
		try {
			const libErrs: string[] = [];
			//debug(this.missionLibFolder);
			const lib = this.storyJson.mastlib.concat(this.storyJson.sbslib);
			let complete = 0;
			debug("Beginning to load modules");
			const total = lib.length;
			for (const zip of lib) {
				let found = false;
				for (const m of getGlobals().getAllMissions()) {
					if (this.storyJson.getModuleBaseName(zip).toLowerCase().includes(m.toLowerCase())) {
						found = true;
						// Here we refer to the mission instead of the zip
						const missionFolder = path.join(getGlobals().artemisDir,"data","missions",m);
						const files = getFilesInDir(missionFolder,true);
						for (const f of files) {
							const data = readFile(f).then((data)=>{
								this.handleZipData(data, f);
								complete += 1;
								// progressUpdate(complete/total*100);
							});
						}
					}
				}
				if (!found) {
					// Here we load the module from the zip
					const zipPath = path.join(this.missionLibFolder,zip);
					readZipArchive(zipPath).then((data)=>{
						debug("Loading " + zip);
						data.forEach((data,file)=>{
							debug(file)
							if (zip !== "") {
								file = path.join(zip,file);
							}
							file = saveZipTempFile(file,data);
							this.handleZipData(data,file);
							complete += 1;
							// progressUpdate(complete/total*100);
						});
					}).catch(err =>{
						debug("Error unzipping. \n  " + err);
						if (("" + err).includes("Invalid filename")) {
							libErrs.push("File does not exist:\n" + zipPath);
						}
					});
				}
			}
		} catch(e) {
			debug("Error in modulesLoaded()");
			debug(e);
		}
	}

	/**
	 * Takes file name and contents and handles them. Checks if it's a .py or .mast file, creates the relevant object, ignores everything else.
	 * Also ignores __init__ files of both the mast and py varieties
	 * @param data Contents of a file, as a {@link string string}
	 * @param file name of a file, as a {@link string string}
	 * @returns 
	 */
	handleZipData(data:string, file:string = "") {
		if (file.endsWith("__init__.mast") || file.endsWith("__init__.py") || file.includes("mock")) {
			// Do nothing
		} else if (file.endsWith(".py")) {
			this.routeLabels = this.routeLabels.concat(loadRouteLabels(data));
			// this.mediaLabels = this.mediaLabels.concat(loadMediaLabels(data));
			// this.resourceLabels = this.resourceLabels.concat(loadResourceLabels(data));
			const p = new PyFile(file, data);
			this.missionPyModules.push(p);
			if (file.includes("sbs_utils") && !file.includes("procedural")) {
				// Don't wanat anything not procedural included???
				for (const special of includeNonProcedurals) {
					if (file.includes(special)) {
						//don't return
						debug("Adding " + special);
						break;
					} else {
					}
				}
			}
			this.missionClasses = this.missionClasses.concat(p.classes);
			// this.missionDefaultCompletions = this.missionDefaultCompletions.concat(p.getDefaultMethodCompletionItems());
			this.missionDefaultFunctions = this.missionDefaultFunctions.concat(p.defaultFunctions);
			for (const s of p.defaultFunctions) {
				this.missionDefaultSignatures.push(s.signatureInformation);
			}
		} else if (file.endsWith(".mast")) {
			//debug("Building file: " + file);
			const m = new MastFile(file, data);
			this.missionMastModules.push(m);
		}
	}

	updateFileInfo(doc: TextDocument) {
		if (doc.languageId === "mast") {
			debug("Updating mast file");
			this.getMastFile(doc.uri).parse(doc.getText());
		} else if (doc.languageId === "py") {
			// this.getPyFile(doc.getText())
		}
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

	getMusicFiles(): CompletionItem[] {
		return getMusicFiles(this.missionLibFolder);
	}

	/**
	 * Get all methods in scope for this cache
	 * @returns List of {@link Function Function}
	 */
	getMethods(): Function[] {
		let methods: Function[] = [];
		for (const py of this.pyFileCache) {
			methods = methods.concat(py.defaultFunctions);
		}
		return methods;
	}

	/**
	 * Get the method with the given name, if it exists in scope for this cache.
	 * @param name Name of the {@link Function Function}
	 * @returns The function with the given name.
	 */
	getMethod(name:string): Function | undefined {
		for (const m of this.getMethods()) {
			if (m.name === name) {
				return m;
			}
		}
		return undefined;
	}

	/**
	 * TODO: This should only return variables that are in scope
	 * @returns 
	 */
	getVariableCompletionItems(doc:TextDocument|undefined): CompletionItem[] {
		// const parent = getParentFolder(URI.parse(file).fsPath);
		// const inits = getInitContents(fixFileName(doc?.uri));
		let ci: CompletionItem[] = [];
		for (const m of this.mastFileCache) {
			// if (m.parentFolder === parent) {
			// 	// Check if the file is included in the init file
			// 	for (const i of inits) {
			// 		if (i === path.basename(m.uri)) {
			ci = ci.concat(m.getVariableNames());
			// 		}
			// 	}
				
			// }
			// for (const v of m.variables) {
				
			// }
		}
		//const arrUniq = [...new Map(ci.map(v => [v.label, v])).values()]
		return ci;
	}

	getVariables(doc:TextDocument|undefined) {
		let vars: Variable[] = [];
		for (const m of this.mastFileCache) {
			if (doc) {
				if (fixFileName(m.uri) === fixFileName(doc.uri)) {
					vars = vars.concat(m.variables);
				}
			} else {
				vars = vars.concat(m.variables);
			}
		}
		return vars;
	}

	
	/**
	 * @param fileUri The uri of the file. 
	 * @returns List of {@link LabelInfo LabelInfo} applicable to the current scope (including modules)
	 */
	getLabels(textDocument: TextDocument): LabelInfo[] {
		let fileUri: string = fixFileName(textDocument.uri);
		let li: LabelInfo[] = [];
		//debug(this.mastFileInfo);
		for (const f of this.mastFileCache) {
				li = li.concat(f.labelNames);
		}

		// This gets stuff from LegendaryMissions, if the current file isn't LegendaryMissions itself.
		for (const f of this.missionMastModules) {
			li = li.concat(f.labelNames);
		}
		//debug(li);
		// Remove duplicates (should just be a bunch of END entries)
		// Could also include labels that exist in another file
		const arrUniq = [...new Map(li.map(v => [v.name, v])).values()]
		return li;
	}

	/**
	 * Get all labels, including sublabels, that are within the current scope at the specified position within the document.
	 * @param doc 
	 * @param pos 
	 */
	getLabelsAtPos(doc:TextDocument, pos:integer): LabelInfo[] {
		// const labels: LabelInfo[] = this.getLabels(doc);
		if (doc.languageId !== "mast") return [];
		const labels = this.getMastFile(doc.uri).labelNames;
		const main = getMainLabelAtPos(pos,labels);
		const subs = main.subLabels;
		const ret = this.getLabels(doc).concat(subs);
		return ret;
	}

	/**
	 * Call when the contents of a file changes
	 * Depracated. Call updateFileInfo() instead
	 * @param textDocument 
	 */
	updateLabels(textDocument: TextDocument) {
		let fileUri: string = fixFileName(textDocument.uri);
		for (const file of this.mastFileCache) {
			if (file.uri === fileUri) {
				file.labelNames = parseLabelsInFile(textDocument.getText(), textDocument.uri);
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
			// ci = ci.concat(this.missionDefaultCompletions);
			for (const f of this.missionDefaultFunctions) {
				ci.push(f.buildCompletionItem());
			}
			for (const c of this.missionClasses) {
				ci.push(c.completionItem);
			}
			for (const p of this.pyFileCache) {
				for (const f of p.defaultFunctions) {
					ci.push(f.completionItem);
				}
			}
			return ci;
		}
		// I don't think this is ever used.
		for (const c of this.missionClasses) {
			if (c.name === _class) {
				debug(c.name + " is the class we're looking for.")
				debug(c.getMethodCompletionItems());
				return c.getMethodCompletionItems();
			}
		}
		return [];//this.missionDefaultCompletions;
	}

	getMethodSignatures(name: string) {
		let si: SignatureInformation[] = this.missionDefaultSignatures;
		// .filter((sig, index, arr)=>{
		// 	sig.label === name;
		// });
		// TODO: Add functions from py files in local directory
		return si;
	}

	/**
	 * Gets a single method signature for the specified function.
	 * @param name Name of the method or function
	 * @returns Associated {@link SignatureInformation}
	 */
	getSignatureOfMethod(name: string): SignatureInformation | undefined {
		for (const f of this.missionDefaultFunctions) {
			if (f.name === name) {
				return f.buildSignatureInformation();
			}
		}
		for (const c of this.missionClasses) {
			for (const m of c.methods) {
				if (m.name === name) {
					return m.buildSignatureInformation();
				}
			}
		}
		for (const m of this.pyFileCache) {
			for (const f of m.defaultFunctions) {
				if (f.name === name) {
					return f.buildSignatureInformation();
				}
			}
			for (const c of m.classes) {
				for (const f of c.methods) {
					if (f.name === name) {
						return f.buildSignatureInformation();
					}
				}
			}
		}
		

		debug("The right way failed...");

		// for (const s of this.missionDefaultSignatures) {
		// 	if (s.label === name) {
		// 		return s;
		// 	}
		// }
		// for (const c of this.missionClasses) {
		// 	for (const m of c.methodSignatureInformation) {
		// 		if (m.label === name) {
		// 			return m;
		// 		}
		// 	}
		// }
		return undefined;
	}

	/**
	 * 
	 * @param folder The folder the current file is in.
	 * @returns 
	 */
	getRoles(folder: string): string[] {
		folder = fixFileName(folder);
		let roles: string[] = [];
		const ini = getInitContents(folder);
		debug(ini);
		for (const m of this.mastFileCache) {
			debug(folder);
			if (ini.includes(path.basename(m.uri))) {
				roles = roles.concat(m.roles);
			}
		}
		return roles;
	}

	/**
	 * Must actually be a mast file, so check before using!
	 * @param uri The uri of the file
	 */
	getMastFile(uri:string): MastFile {
		uri = fixFileName(uri);
		for (const m of this.mastFileCache) {
			if (m.uri === fixFileName(uri)) {
				return m;
			}
		}
		const m: MastFile = new MastFile(uri);
		return m;
	}

	/**
	 * Must actually be a python file, so check before using!
	 * @param uri The uri of the file
	 */
	getPyFile(uri:string) : PyFile {
		uri = fixFileName(uri);
		for (const p of this.pyFileCache) {
			if (p.uri === fixFileName(uri)) {
				return p;
			}
		}
		const p: PyFile = new PyFile(uri);
		return p;
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
		// prepCompletions(sourceFiles);
		prepSignatures(sourceFiles);
	} catch (err) {
		debug("\nFailed to load\n"+err as string);
	}
}

async function loadSbs(): Promise<PyFile|null>{
	let gh: string = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/typings/sbs/__init__.pyi";
	let text = "";
	try {
		const data = await fetch(gh);
		text = await data.text();
		gh = saveZipTempFile("sbs.py",text);
		const p = new PyFile(gh, text);
		return p;
	} catch (e) {
		debug("Can't find sbs.py on github");
		try {
			gh = path.join(__dirname, "sbs.py");
			text = await readFile(gh);
			const p = new PyFile(gh, text);
			debug("SBS py file generated")
			// debug(p.defaultFunctions);
			return p;
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

function saveZipTempFile(uri:string, contents:string) : string{
	const tempPath = fixFileName(path.join(os.tmpdir(),"cosmosModules",uri));
	if (!fs.existsSync(path.dirname(tempPath))) {
		debug("Making dir: " + path.dirname(tempPath));
		fs.mkdirSync(path.dirname(tempPath), { recursive: true });
	}
	debug(tempPath);
	fs.writeFileSync(tempPath,contents);
	return tempPath;
}
