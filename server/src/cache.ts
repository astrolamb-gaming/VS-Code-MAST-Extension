import * as fs from 'fs';
import * as path from 'path';
import { CompletionItem, integer, Location, SignatureInformation } from 'vscode-languageserver';
import { MastFile } from './files/MastFile';
import { PyFile } from './files/PyFile';
import { parseLabelsInFile, LabelInfo, getMainLabelAtPos } from './tokens/labels';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { debug } from 'console';
import { IRouteLabel, loadMediaLabels, loadResourceLabels, loadRouteLabels } from './tokens/routeLabels';
import { fixFileName, getFilesInDir, getInitContents, getInitFileInFolder, getMissionFolder, getParentFolder, readFile, readFileSync, readZipArchive } from './fileFunctions';
import { connection, requestClientQuickPick, showProgressBar as showProgressBar } from './server';
import { URI } from 'vscode-uri';
import { getArtemisGlobals, initializeArtemisGlobals } from './artemisGlobals';
import * as os from 'os';
import { Variable } from './tokens/variables';
import { getMusicFiles } from './resources/audioFiles';
import { Function, Parameter } from "./data/function";
import { ClassObject } from './data/class';
import { StoryJson } from './data/storyJson';
import { getSpecificGlobals } from './python/python';
import { loadStyleDefs } from './data/styles';
import { Word } from './tokens/words';
import { SignalInfo } from './tokens/signals';

export const testingPython = false;

interface MissionLibManifest {
	version?: string;
	sbslib?: string[];
	mastlib?: string[];
	zip?: string[];
}

interface MissionPackageLayout {
	sbslib: Set<string>;
	mastlib: Set<string>;
	zip: Set<string>;
}

export class MissionCache {

	missionName: string = "";
	missionURI: string = "";
	storyJson: StoryJson;
	missionLibManifestPath: string = "";
	missionLibFolder: string = "";
	ignoreMissingLibManifest = false;
	missionPackageLayout: MissionPackageLayout = {
		sbslib: new Set<string>(),
		mastlib: new Set<string>(),
		zip: new Set<string>()
	};
	ingoreInitFileMissing = false;
	// The Modules are the default sbslib and mastlib files.
	// They apply to ALL files in the mission folder.
	missionPyModules: PyFile[] = [];
	missionMastModules: MastFile[] = [];
	// missionClasses: ClassObject[] = [];
	// missionDefaultFunctions: Function[] = [];


	// These are for the files specific to this mission.
	/**
	 * A list of all {@link PyFile PyFile}s included in modules applicable to the current misison.
	 */
	pyFileCache: PyFile[] = [];
	/**
	 * A list of all {@link MastFile MastFile}s included in modules applicable to the current mission.
	 */
	mastFileCache: MastFile[] = [];
	/**
	 * A two-dimensional array of all the globally-scoped files for the current mission.  
	 * The first index of each array is the file name (e.g. sbs_utils.names)  
	 * The second index is the prepend name - the name that is prepended to all functions in the file.
	 */
	sbsGlobals: string[][] = [];
	/**
	 * Globals defined in `class MastGlobals: globals = {...}` dicts.
	 * Each entry is `[globalRef, globalVar]` where globalRef is the name used in MAST scripts.
	 */
	mastClassGlobals: string[][] = [];

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
	styleDefinitions: string[] = [];

	// Variables to check if the cache has finished loading
	storyJsonLoaded = false;
	pyInfoLoaded = false;
	missionFilesLoaded = false;
	sbsLoaded = false;
	awaitingReload = false;
	lastAccessed: integer = 0;
	deprecatedFunctions: Function[] = [];
	private methodsCache: Function[] | null = null;
	private methodIndex: Map<string, Function[]> | null = null;
	private classMethodIndex: Map<string, Function[]> | null = null;
	private classesCache: ClassObject[] | null = null;
	private signalsCache: SignalInfo[] = [];
	private blobKeysCache: Word[] = [];
	private linksCache: Word[] = [];
	private rolesCache: Word[] = [];
	private inventoryKeysCache: Word[] = [];
	private signalsByFile: Map<string, SignalInfo[]> = new Map();
	private blobKeysByFile: Map<string, Word[]> = new Map();
	private linksByFile: Map<string, Word[]> = new Map();
	private rolesByFile: Map<string, Word[]> = new Map();
	private inventoryKeysByFile: Map<string, Word[]> = new Map();
	/** Debounce timers: uri -> NodeJS.Timeout for deferred full Python re-parse */
	private _reparseTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

	constructor(workspaceUri: string) {
		//debug(workspaceUri);

		this.resourceLabels = loadResourceLabels();
		this.mediaLabels = this.mediaLabels.concat(loadMediaLabels());

		this.missionURI = getMissionFolder(workspaceUri);
		debug(this.missionURI);
		let parent = getParentFolder(this.missionURI);
		this.missionLibManifestPath = path.join(this.missionURI, "__lib__.json");
		this.missionLibFolder = path.join(parent, "__lib__");
		this.missionName = path.basename(this.missionURI);
		this.storyJson = new StoryJson(path.join(this.missionURI,"story.json"));

		// this.load().then(async ()=>{
		// 	await sleep(100);
		// 	// showProgressBar(false);
		// 	debug("Starting python")
		// 	initializePython(path.join(this.missionURI,"story.json"))	
			
		// });
		// this.startWatchers();
	}

	// Promise that resolves when the cache has finished loading
	private _loadedPromise: Promise<void> = Promise.resolve();
	private _loadedResolve: (() => void) | null = null;
	private _isLoading = false;

	private logLoadTiming(stage: string, elapsedMs: number, details: string = '') {
		const suffix = details ? ` | ${details}` : '';
		const msg = `[load:${this.missionName}] ${stage} took ${elapsedMs}ms${suffix}`;
		try {
			connection.console.log(msg);
		} catch (e) {
			debug(e);
		}
	}

	async load() {
		if (this._isLoading) {
			debug(`load() called while already loading for ${this.missionName}, ignoring.`);
			return;
		}
		if (this.missionURI === "") {
			debug("Mission folder not valid: " + this.missionURI + "\nNot loading cache.")
			return;
		}
		this._isLoading = true;
		this.endWatchers();
		this.storyJsonLoaded = false;
		this.pyInfoLoaded = false;
		this.missionFilesLoaded = false;
		this.sbsLoaded = false;
		debug("Starting MissionCache.load()");
		const loadStart = Date.now();
		this.logLoadTiming('load:start', 0, `uri=${this.missionURI}`);
		// create a new loaded promise for callers waiting on awaitLoaded()
		this._loadedPromise = new Promise((resolve) => { this._loadedResolve = resolve; });
		showProgressBar(true);
		// (re)set all the arrays before (re)populating them.
		// this.missionClasses = [];
		// this.missionDefaultFunctions = [];
		this.missionMastModules = [];
		this.missionPyModules = [];
		this.pyFileCache = [];
		this.resourceLabels = [];
		this.mediaLabels = [];
		this.mastFileCache = [];
		this.invalidateStructureCaches();
		this.resetExtractedItemCaches();
		this.resetMissionPackageLayout();
		const layoutStart = Date.now();
		await this.loadMissionPackageLayout();
		this.logLoadTiming(
			'loadMissionPackageLayout',
			Date.now() - layoutStart,
			`sbslib=${this.missionPackageLayout.sbslib.size}, mastlib=${this.missionPackageLayout.mastlib.size}, zip=${this.missionPackageLayout.zip.size}`
		);
		this.storyJson = new StoryJson(path.join(this.missionURI,"story.json"));
		
		const storyStart = Date.now();
		await this.storyJson.readFile()
		this.logLoadTiming(
			'storyJson.readFile',
			Date.now() - storyStart,
			`sbslib=${this.storyJson.sbslib.length}, mastlib=${this.storyJson.mastlib.length}`
		);
			// .then(()=>{
		debug("pyFileCache length: " + this.pyFileCache.length)
		const modulesStart = Date.now();
		await this.modulesLoaded();
		this.logLoadTiming('modulesLoaded', Date.now() - modulesStart, `pyFiles=${this.pyFileCache.length}, mastModules=${this.missionMastModules.length}`);
		// .then(()=>{
		debug("Modules loaded for " + this.missionName);
		// showProgressBar(false);
		this.storyJsonLoaded = true;

		// Now we do the python checks for the MastGlobals that don't exist already
		let globals: string[][] = [];
		for (const p of this.pyFileCache) {
			if (p.globals.length > 0) {
				globals = globals.concat(p.globals)
			}
		}
		// // debug(globals);
		// globals.push(["dict","dict"]);
		// debug(globals);
		const globalsStart = Date.now();
		await this.loadPythonGlobals(globals)
		this.logLoadTiming('loadPythonGlobals', Date.now() - globalsStart, `globals=${globals.length}`);
		// .then((info)=>{
		debug("Loaded globals")
		this.pyInfoLoaded = true;
		// });
		debug("New pyFileCache length: " + this.pyFileCache.length)
				// })
//File structure for sbs_utils changed, so we'll just comment this out..
		// 	// });
		// let p = await loadSbs()//.then(async (p)=>{
		// showProgressBar(true);
		// if (p !== null) {
		// 	this.addMissionPyFile(p);
		// 	// this.missionPyModules.push(p);
		// 	// debug("addding " + p.uri);
		// 	// this.missionClasses = this.missionClasses.concat(p.classes);
		// }
		// debug("Finished loading sbs_utils for " + this.missionName);
		// showProgressBar(false);
		this.sbsLoaded = true;
			// await this.awaitLoaded();
		// });


		this.deprecatedFunctions = [];
		
		for (const p of this.pyFileCache) {
			for (const f of p.defaultFunctions) {
				if (f.documentation.toLowerCase().includes("deprecated")) {
					this.deprecatedFunctions.push(f);
				}
			}
		}
		for (const p of this.missionPyModules) {
			for (const f of p.defaultFunctions) {
				if (f.documentation.toLowerCase().includes("deprecated")) {
					this.deprecatedFunctions.push(f);
				}
			}
		}

		this.checkForCacheUpdates();
		debug(this.missionURI);
		
		//this.checkForInitFolder(this.missionURI);
		debug("Number of py files: "+this.pyFileCache.length);
		debug("Everything is loaded");
		this.startWatchers();
		const loadElapsed = Date.now() - loadStart;
		this.logLoadTiming('load:complete', loadElapsed, `loaded=${this.isLoaded()}`);
		if (this._loadedResolve) {
			this._loadedResolve();
			this._loadedResolve = null;
		}
		this._isLoading = false;
		showProgressBar(false);
	}

	/**
	 * Reload the cache after it's already been loaded to reset everything.
	 */
	async reload() {
		// Don't load until it's finished loading the first time
		if (this.awaitingReload) return;
		const reloadStart = Date.now();
		this.logLoadTiming('reload:start', 0);
		this.awaitingReload = true;
		debug("Awaiting loaded")
		await this.awaitLoaded();
		await this.load();
		debug("Reload complete.");
		this.logLoadTiming('reload:complete', Date.now() - reloadStart);
		this.awaitingReload = false;
	}

	watchers: fs.FSWatcher[] = [];
	/**
	 * Start file system watchers
	 * These enable cache reloading if story.json is changed, or if a mastlib/sbslib file is changed.
	 * Also handles deleted mast/py files.
	 * Does NOT handle new files, it will be added when it is opened.
	 */
	startWatchers() {
		let w = fs.watch(this.missionURI, {"recursive": true}, (eventType, filename) => {
			// debug("fs.watch() EVENT: ")
			// debug(eventType);
			// could be either 'rename' or 'change'. new file event and delete
			// also generally emit 'rename'
			// debug(filename);
			if (filename === null || filename.includes(".git") || filename.includes("__pycache__") || filename.includes("__init__")) return;
			// debug(this.missionURI)
			// debug(filename)
			if (eventType === "rename") {
				const filePath = path.join(this.missionURI, filename);

				// Check if the file was added
				if (fs.existsSync(filePath)) {
					console.log(`File added: ${filename}`);
					const init = getInitContents(path.join(this.missionURI, filename));
					let inInit = false;
					for (const i of init) {
						if (filename.endsWith(i)) {
							inInit = true;
							break;
						}
					}
					if (!inInit) {
						this.tryAddToInitFile(path.dirname(path.join(this.missionURI, filename)), path.basename(filename));
					}
				} else {
					if (filename?.endsWith(".py")) {
						this.removePyFile(path.join(this.missionURI,filename));
					}
					if (filename?.endsWith(".mast")) {
						this.removeMastFile(path.join(this.missionURI,filename));
					}
				}
				return;
			}
			// Should only trigger when the py file is saved.
			if (eventType === "change") {
				if (filename?.endsWith(".py")) {
					// let text = readFileSync(filename);
					let file = path.join(this.missionURI, filename);
					// debug(file);
					let pyFile = this.getPyFile(file);
					// Use async readFile to avoid blocking the language server
					readFile(file).then((text) => {
						const textDoc = TextDocument.create(file, "py", 1, text);
						if (textDoc) {
							this.updateFileInfo(textDoc);
						} else {
							debug("File not found in watcher")
						}
					}).catch((err) => {
						debug("Error reading file in watcher: " + file);
						debug(err);
					});
					
				}
			}
			if (filename ==="story.json" && eventType === "change") {
				this.reload();
			}
			if (filename === "__lib__.json" && eventType === "change") {
				this.reload();
			}
		});
		this.watchers.push(w);
		// Watches for changes to the sbs_lib or mast_lib files
		let libFolder = path.join(getArtemisGlobals().artemisDir, "data", "missions", "__lib__");
		// debug(libFolder);
		let w2 = fs.watch(libFolder, {}, (eventType, filename) => {
			// TODO: Only load the bits applicable for these files?
			// More efficient to only reload what needs reloaded.
			// As is, will need to reload the whole cache...
			
			// debug("Event Type: " + eventType);
			if (eventType === "change") {
				debug("Change detected - checking if update is needed")
				// debug(filename + "  Changed\n\nHERE\n\n................");
				for (const lib of this.storyJson.sbslib) {
					if (lib === filename) {
						this.reload();
					}
				}
				for (const lib of this.storyJson.mastlib) {
					if (lib === filename) {	
						this.reload();
					}
				}
			}
		});
		this.watchers.push(w2);
	}
	endWatchers() {
		for (const w of this.watchers) {
			w.close();
		}
		this.watchers = [];
	}
	/**
	 * Load globals from the python shell and builtins.py (stuff like len() and list())
	 * @param globals 
	 */
	async loadPythonGlobals(globals: string[][]) {

		


		// Now we add the globals from the python shell. We have to do this after loading the modules, since some globals are defined in the modules.
		let go = await initializeArtemisGlobals();
		showProgressBar(true);
		let sigParser = /'(.*?)'/g;
		let globalInfo: any = [];
		let globalNames:string[][] = [];
		for (const g of globals) {
			// mission_dir and data_dir references we aleady know, and might return bad values if left to python outside of an actual artemis dir
			if (g[0] === "mission_dir") {
				globalInfo.push([g[0], this.missionURI]);
				continue;
			}
			if (g[0] === "data_dir") {
				globalInfo.push([g[0], path.join(go.artemisDir,"data")]);
				continue;
			}

			// Add all other names to the list to check globals in python
			globalNames.push(g);
		}
		let info: any[] = await getSpecificGlobals(this, globalNames);
		// debug(info);
		let classes:ClassObject[] = [];
		for (const g of info) {
			let mod = g["module"];
			let doc = g["documentation"];
			let kind = g["kind"];
			let name = g["mastName"];
			if (kind === "module") {
				// if (builtInFunctions.classes.find((c) => c.name === name)) {
				// 	continue;
				// }
				const _c = new ClassObject("","");
				_c.name = name;
				_c.sourceFile = "built-in"
				_c.documentation = doc
				classes.push(_c);
			} else {
				// try to find the module/class the function is from
				// Shouldn't be any that aren't from a class/module, since we use the mock file.
				for (const _c of classes) {
					if (_c.name === mod) {
						let val = g["value"];
						let sigs = g["argspec"];

						// Add the function to the class
						const f = new Function("","","");
						f.name = name;
						f.className = mod;
						if (val !== undefined) {
							f.functionType = "constant";
							f.returnType = "float";
						} else {
							f.functionType = "function";
							f.returnType = "";
						}
						f.rawParams = "";
						f.sourceFile = "builtin";
						f.documentation = doc;

						// Add signature information
						let m: RegExpExecArray | null;
						if (sigs !== undefined) {
							let params = [];
							while (m = sigParser.exec(sigs)) {
								params.push(m[1])
								if (m[1] !== "self") {
									const p = new Parameter(m[1],f.parameters.length,"");
									f.parameters.push(p);
								}
							}
							f.rawParams = params.join(', ');
						}
						// If there's no sig info, such as for math.hypot, we can do this to parse the documentation
						if (f.parameters.length === 0 && doc !== undefined) {
							let paramCheck = /\((.*?)\)/g;
							let params:string[] = [];
							while (m = paramCheck.exec(doc)) {
								if (doc.includes(name + m[0])) {
									f.rawParams = m[1];
									params = m[1].split(",");
									break;
								}
							}
							for (const p of params) {
								if (p !== "self") {
									const param = new Parameter(p,f.parameters.length,"");
									f.parameters.push(param);
								}
							}
							f.rawParams = params.join(', ');
						}
						_c.methods.push(f);
					}
				}
			}
		}
		// This is built from the python shell
		const builtIns = new PyFile("builtin.py","");
		builtIns.classes = classes;
		builtIns.isGlobal = true;



		// Now we add the mock pyfile:
		const scriptPath = __dirname.replace("out","src");
		let contents = await readFile(path.join(scriptPath,"files","globals.py"));
		// debug(contents)
		const builtInFunctions = new PyFile("builtin_functions.py",contents);
		builtInFunctions.isGlobal = true;

		
		// for (const m of builtInFunctions.defaultFunctions) {
		// 	m.sourceFile = "builtin";
		// }
		// debug(builtInFunctions);

		this.addSbsPyFile(builtIns);
		this.addSbsPyFile(builtInFunctions);
		// this.pyFileCache.push(builtIns);
		// this.pyFileCache.push(builtInFunctions);
		debug("buitins added")
		// showProgressBar(false);
		this.pyInfoLoaded = true;
	}

	async checkForInitFolder(folder:string) : Promise<boolean> {
		// if (this.ingoreInitFileMissing) return;
		if (folder.endsWith(this.missionName)) return false;
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
					if (f.endsWith("__init__.mast") || f.endsWith(".json")) continue;
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
	private async tryAddToInitFile(folder:string, newFile:string) {
		if (!newFile.endsWith(".mast") && !newFile.endsWith(".py")) return;

		let ret = await connection.window.showWarningMessage(
			"File not found in '__init__.mast': " + newFile,
			{title: "Add " + newFile + " to __init__.mast"},
			{title: "Don't add"}
			//{title: hide} // TODO: Add this later!!!!!!
		);
		if (ret === undefined) return true;
		if (ret.title === "Add " + newFile + " to __init__.mast") {
			try {
				fs.writeFile(path.join(folder,"__init__.mast"), "\nimport " + newFile, {flag: "a+"}, ()=>{});
			} catch (e) {
				debug("Can't add " + newFile + " to __init__.mast");
				debug(e);
			}
		}
	}

	/**
	 * Process an array of work items with controlled concurrency.
	 * Limits concurrent operations to prevent resource exhaustion.
	 * @param items Array of items to process
	 * @param processor Async function that processes each item
	 * @param maxConcurrent Maximum number of concurrent operations (default 3)
	 */
	private async processConcurrent<T>(
		items: T[],
		processor: (item: T) => Promise<void>,
		maxConcurrent: number = 3
	): Promise<void> {
		const executing: Promise<void>[] = [];
		for (const item of items) {
			const promise = processor(item).then(() => {
				executing.splice(executing.indexOf(promise), 1);
			});
			executing.push(promise);
			if (executing.length >= maxConcurrent) {
				await Promise.race(executing);
			}
		}
		await Promise.all(executing);
	}

	/**
	 * Loads the zip/mastlib/sbslib file modules
	 * @returns Promise<void>
	 */
	async modulesLoaded() {
		const modulesStart = Date.now();
		if (testingPython) return;
		const uri = this.missionURI;
		let globals = getArtemisGlobals();
		if (globals === undefined) {
			globals = await initializeArtemisGlobals();
		}
		debug(uri);
		// Don't load modules if it's the sbs_utils folder?
		if (uri.includes("sbs_utils")) {
			debug("sbs nope");
		}
		try {
			const libErrs: string[] = [];
			//debug(this.missionLibFolder);
			const lib = this.storyJson.mastlib.concat(this.storyJson.sbslib);
			let totalPyLoaded = 0;
			let totalMastLoaded = 0;
			debug("Beginning to load modules");
			const total = lib.length;
			this.logLoadTiming('modules:scan', 0, `modules=${total}`);
			// Process zip archives with controlled concurrency (max 3 concurrent reads)
			// This prevents resource exhaustion from opening too many file handles at once
			await this.processConcurrent(
				lib,
				async (zip) => {
					const moduleStart = Date.now();
					let modulePyLoaded = 0;
					let moduleMastLoaded = 0;
					let moduleSource = 'zip';
					debug("Unzipping: " + zip);
					
					let found = false;
					let missions = globals!.getAllMissions()
					for (const m of missions) {
						if (this.storyJson.getModuleBaseName(zip).toLowerCase().includes(m.toLowerCase())) {
							found = true;
							moduleSource = 'mission-folder';
							// Here we refer to the mission instead of the zip
							const missionFolder = path.join(globals!.artemisDir,"data","missions",m);
							const files = getFilesInDir(missionFolder,true);
							for (const f of files) {
								if (f.endsWith(".py")|| f.endsWith(".mast")) {
									const data = await readFile(f);
									debug("Loading: " + path.basename(f));
									this.handleZipData(data, f);
									if (f.endsWith('.py')) modulePyLoaded++;
									if (f.endsWith('.mast')) moduleMastLoaded++;
								}
							}
							break;
						}
					}
					if (!found) {
						// Here we load the module from the zip
						const zipPath = path.join(this.missionLibFolder,zip);
						try {
							const data = await readZipArchive(zipPath);
							debug("Loading " + zip);
							for (const [file, fileData] of data.entries()) {
								debug(file)
								let processFile = file;
								if (zip !== "") {
									processFile = path.join(zip,file);
								}
								if (file.endsWith(".py") || file.endsWith(".mast")) {
									processFile = saveZipTempFile(file,fileData);
									this.handleZipData(fileData,processFile);
									if (file.endsWith('.py')) modulePyLoaded++;
									if (file.endsWith('.mast')) moduleMastLoaded++;
								}
							}
						} catch (err) {
							debug("Error unzipping. \n  " + err);
							if (("" + err).includes("Invalid filename")) {
								libErrs.push("File does not exist:\n" + zipPath);
							}
						}
					}
					totalPyLoaded += modulePyLoaded;
					totalMastLoaded += moduleMastLoaded;
					this.logLoadTiming(
						'modules:module',
						Date.now() - moduleStart,
						`${zip} | source=${moduleSource}, py=${modulePyLoaded}, mast=${moduleMastLoaded}`
					);
				},
				3  // max 3 concurrent zip file reads
			);
			if (libErrs.length > 0) {
				this.logLoadTiming('modules:missing', 0, `count=${libErrs.length}`);
				for (const err of libErrs) {
					debug(err);
				}
			}
			this.logLoadTiming('modules:totals', Date.now() - modulesStart, `py=${totalPyLoaded}, mast=${totalMastLoaded}`);
		} catch(e) {
			debug("Error in modulesLoaded()");
			debug(e);
		}
		const modulesElapsed = Date.now() - modulesStart;
		try {
			connection.console.log(`modulesLoaded for ${this.missionName} took ${modulesElapsed}ms`);
			debug(`modulesLoaded for ${this.missionName} took ${modulesElapsed}ms`);
		} catch (e) {
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
		const parseStart = Date.now();
		let handledAs = 'ignored';
		// debug("Beginning to load zip data for: " + file);
		if (file.endsWith("__init__.mast") || file.endsWith("__init__.py")) {
			// Do nothing
			handledAs = 'init-skip';
		} else if (file.endsWith(".py")) {
			handledAs = 'python';
			// debug(file)
			this.routeLabels = this.routeLabels.concat(loadRouteLabels(data));
			this.styleDefinitions = this.styleDefinitions.concat(loadStyleDefs(file,data))
			// if (file.includes("sbs_utils\\mast")) return;
			// if (file.includes("sbs_utils") && !file.includes("procedural")) {
			// 	// Don't wanat anything not procedural included???
			// 	let found = false;
			// 	for (const special of includeNonProcedurals) {
			// 		if (file.includes(special)) {
			// 			found = true;
			// 			//don't return
			// 			debug("Adding " + special);
			// 			// const p = new PyFile(file, data);
			// 			// this.missionPyModules.push(p);
			// 			// this.missionClasses = this.missionClasses.concat(p.classes);
			// 			// this.missionDefaultFunctions = this.missionDefaultFunctions.concat(p.defaultFunctions);
			// 			break;
			// 		}
			// 	}
			// 	// TODO: Uncomment this to remove all the extra stuff like Gui that most mission writers probably don't need...
			// 	// if (!found) return;
			// }
			const p = new PyFile(file, data);
			if (file.includes("sbs_utils")) {
				this.addSbsPyFile(p);
				return;
			}
			this.addMissionPyFile(p);
			
			// this.missionDefaultFunctions = this.missionDefaultFunctions.concat(p.defaultFunctions);
		} else if (file.endsWith(".mast")) {
			handledAs = 'mast';
			//debug("Building file: " + file);
			if (file.includes("sbs_utils")) return;
			const m = new MastFile(file, data);
			m.inZip = true;
			this.missionMastModules.push(m);
			this.syncMastExtractedItems(m);
		}
		const parseElapsed = Date.now() - parseStart;
		if (parseElapsed > 20) {
			this.logLoadTiming('handleZipData', parseElapsed, `${handledAs} | ${path.basename(file)}`);
		}
		// debug("Finished loading: " + path.basename(file))
	}

	/**
	 * Triggers an update to the {@link MastFile MastFile} or {@link PyFile PyFile} associated with the specified {@link TextDocument TextDocument}.
	 * @param doc The {@link TextDocument TextDocument}
	 */
	updateFileInfo(doc: TextDocument) {
		const updateStart = Date.now();
		if (doc.languageId === "mast") {
			// debug("Updating " + doc.uri);
			const mastFile = this.getMastFile(doc.uri);
			mastFile.updateFromDocument(doc);
			this.syncMastExtractedItems(mastFile);
		} else if (doc.languageId === "py" || doc.languageId === "python") {
			// debug("Updating " + doc.uri);
			const pyFile = this.getPyFile(doc.uri);
			const isSbsUtils = fixFileName(doc.uri).includes("sbs_utils");
			if (isSbsUtils) {
				// sbs_utils files are read-only library files; only refresh extracted
				// string items (roles, signals, etc.) without re-running PythonLexer
				pyFile.parseTokensOnly(doc.getText());
				this.syncPyExtractedItems(pyFile, this.shouldIncludeBlobKeysFromPyFile(pyFile));
			} else {
				// Immediately do the cheap token-only pass so context (roles, signals etc.)
				// is always fresh while the user types.
				const text = doc.getText();
				pyFile.parseTokensOnly(text);
				this.syncPyExtractedItems(pyFile, this.shouldIncludeBlobKeysFromPyFile(pyFile));

				// Debounce the expensive PythonLexer structural reparse: fire 300 ms
				// after the user stops typing so class/function completions update
				// without blocking the event loop on every keystroke.
				const uri = fixFileName(doc.uri);
				const existing = this._reparseTimers.get(uri);
				if (existing) clearTimeout(existing);
				const timer = setTimeout(() => {
					 this._reparseTimers.delete(uri);
					 const reparseStart = Date.now();
					 pyFile.parseWholeFile(text);
					 this.invalidateStructureCaches();
					 this.syncPyExtractedItems(pyFile, this.shouldIncludeBlobKeysFromPyFile(pyFile));
					 const reparseElapsed = Date.now() - reparseStart;
					 if (reparseElapsed > 12) {
						 this.logLoadTiming('deferredReparse', reparseElapsed, path.basename(uri));
					 }
				}, 300);
				this._reparseTimers.set(uri, timer);
			}
		}
		const elapsed = Date.now() - updateStart;
		if (elapsed > 12) {
			this.logLoadTiming('updateFileInfo', elapsed, `${doc.languageId} | ${path.basename(doc.uri)}`);
		}
	}

	private invalidateStructureCaches() {
		this.methodsCache = null;
		this.methodIndex = null;
		this.classMethodIndex = null;
		this.classesCache = null;
	}

	private resetExtractedItemCaches() {
		this.signalsCache = [];
		this.blobKeysCache = [];
		this.linksCache = [];
		this.rolesCache = [];
		this.inventoryKeysCache = [];
		this.signalsByFile.clear();
		this.blobKeysByFile.clear();
		this.linksByFile.clear();
		this.rolesByFile.clear();
		this.inventoryKeysByFile.clear();
	}

	private resetMissionPackageLayout() {
		this.missionPackageLayout.sbslib.clear();
		this.missionPackageLayout.mastlib.clear();
		this.missionPackageLayout.zip.clear();
	}

	private normalizeMissionPackageEntry(entry: string): string {
		const normalized = fixFileName(entry).trim().replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
		if (normalized === '') return '';
		return normalized.split('/')[0];
	}

	private parseManifestArray(entries: unknown): string[] {
		if (!Array.isArray(entries)) return [];
		return entries
			.filter((entry) => typeof entry === 'string')
			.map((entry) => this.normalizeMissionPackageEntry(entry))
			.filter((entry) => entry.length > 0);
	}

	private parseMissionLibManifest(text: string): MissionLibManifest | undefined {
		try {
			return JSON.parse(text) as MissionLibManifest;
		} catch {
			try {
				const withoutTrailingCommas = text.replace(/,\s*([}\]])/g, '$1');
				return JSON.parse(withoutTrailingCommas) as MissionLibManifest;
			} catch (e) {
				debug('Unable to parse __lib__.json');
				debug(e);
				return undefined;
			}
		}
	}

	private getTopLevelMissionEntries(): string[] {
		try {
			const entries = fs.readdirSync(this.missionURI, { withFileTypes: true });
			return entries
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name)
				.filter((name) => name !== '' && !name.startsWith('.') && name !== '__pycache__')
				.sort((a, b) => a.localeCompare(b));
		} catch (e) {
			debug('Unable to enumerate mission folders for __lib__.json bootstrap');
			debug(e);
			return [];
		}
	}

	private applyDefaultMastlibLayoutForMissingManifest() {
		for (const entry of this.getTopLevelMissionEntries()) {
			this.missionPackageLayout.mastlib.add(entry);
		}
	}

	private getAvailableMissionLibVersions(): string[] {
		const versions = new Set<string>();
		const missionsRoot = getParentFolder(this.missionURI);

		try {
			const missionEntries = fs.readdirSync(missionsRoot, { withFileTypes: true });
			for (const entry of missionEntries) {
				if (!entry.isDirectory()) continue;
				if (entry.name.startsWith('.')) continue;

				const manifestPath = path.join(missionsRoot, entry.name, '__lib__.json');
				if (!fs.existsSync(manifestPath)) continue;

				try {
					const text = fs.readFileSync(manifestPath, 'utf-8');
					const manifest = this.parseMissionLibManifest(text);
					if (manifest?.version && manifest.version.trim() !== '') {
						versions.add(manifest.version.trim());
					}
				} catch (e) {
					debug(`Unable to read mission lib manifest at ${manifestPath}`);
					debug(e);
				}
			}
		} catch (e) {
			debug('Unable to enumerate mission folders for __lib__.json version discovery');
			debug(e);
		}

		if (versions.size === 0) {
			versions.add('v1.3.0');
		}

		return [...versions].sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
	}

	private async promptForMissionLibVersion(): Promise<string> {
		const versions = this.getAvailableMissionLibVersions();
		if (versions.length === 1) {
			return versions[0];
		}

		const selected = await requestClientQuickPick(
			'Select a version for the new __lib__.json file.',
			versions,
			'Choose a version'
		);
		return selected || versions[0] || 'v1.3.0';
	}

	private buildDefaultMissionLibManifest(version: string): MissionLibManifest {
		const sbslib: string[] = [];
		const mastlib: string[] = [];
		const zip: string[] = [];

		for (const folder of this.getTopLevelMissionEntries()) {
			const folderPath = path.join(this.missionURI, folder);
			const files = getFilesInDir(folderPath, true).map((file) => fixFileName(file));
			const hasMast = files.some((file) => file.endsWith('.mast'));
			const hasPy = files.some((file) => file.endsWith('.py'));

			if (hasMast) {
				mastlib.push(folder);
			} else if (hasPy) {
				sbslib.push(folder);
			} else {
				zip.push(folder);
			}
		}

		const manifest: MissionLibManifest = {
			version
		};
		if (sbslib.length > 0) {
			manifest.sbslib = sbslib;
		}
		if (mastlib.length > 0) {
			manifest.mastlib = mastlib;
		}
		if (zip.length > 0) {
			manifest.zip = zip;
		}

		return manifest;
	}

	private async promptToCreateMissingMissionLibManifest() {
		if (this.ignoreMissingLibManifest) {
			return;
		}

		const createOption = { title: 'Create __lib__.json' };
		const ignoreOption = { title: 'Ignore' };
		const choice = await connection.window.showWarningMessage(
			'No __lib__.json file found in this mission root. The mission will be treated as mastlib by default.',
			createOption,
			ignoreOption
		);

		if (!choice || choice.title === ignoreOption.title) {
			this.ignoreMissingLibManifest = true;
			return;
		}

		if (choice.title === createOption.title) {
			const version = await this.promptForMissionLibVersion();
			const manifest = this.buildDefaultMissionLibManifest(version);
			fs.writeFileSync(this.missionLibManifestPath, JSON.stringify(manifest, null, 4), { encoding: 'utf-8' });
		}
	}

	private async loadMissionPackageLayout() {
		const layoutStart = Date.now();
		if (!fs.existsSync(this.missionLibManifestPath)) {
			this.applyDefaultMastlibLayoutForMissingManifest();
			await this.promptToCreateMissingMissionLibManifest();
			if (!fs.existsSync(this.missionLibManifestPath)) {
				this.logLoadTiming('loadMissionPackageLayout:manifest', Date.now() - layoutStart, 'manifest missing; default mastlib layout');
				return;
			}
		}

		try {
			const manifestText = fs.readFileSync(this.missionLibManifestPath, 'utf-8');
			const manifest = this.parseMissionLibManifest(manifestText);
			if (!manifest) {
				return;
			}

			for (const entry of this.parseManifestArray(manifest.sbslib)) {
				this.missionPackageLayout.sbslib.add(entry);
			}
			for (const entry of this.parseManifestArray(manifest.mastlib)) {
				this.missionPackageLayout.mastlib.add(entry);
			}
			for (const entry of this.parseManifestArray(manifest.zip)) {
				this.missionPackageLayout.zip.add(entry);
			}
		} catch (e) {
			debug('Unable to load __lib__.json');
			debug(e);
		} finally {
			this.logLoadTiming(
				'loadMissionPackageLayout:manifest',
				Date.now() - layoutStart,
				`sbslib=${this.missionPackageLayout.sbslib.size}, mastlib=${this.missionPackageLayout.mastlib.size}, zip=${this.missionPackageLayout.zip.size}`
			);
		}
	}

	private getMissionRelativePath(filePath: string): string | undefined {
		const normalizedMission = fixFileName(this.missionURI).replace(/\/+$/, '');
		const normalizedFile = fixFileName(filePath);
		if (!normalizedFile.startsWith(normalizedMission + '/')) {
			return undefined;
		}
		return normalizedFile.substring(normalizedMission.length + 1);
	}

	private getTopLevelMissionFolder(filePath: string): string | undefined {
		const rel = this.getMissionRelativePath(filePath);
		if (!rel) return undefined;
		const top = rel.split('/')[0]?.trim();
		if (!top) return undefined;
		return top;
	}

	isSbslibFile(filePath: string): boolean {
		const topFolder = this.getTopLevelMissionFolder(filePath);
		if (!topFolder) return false;
		return this.missionPackageLayout.sbslib.has(topFolder);
	}

	private toPythonModulePathWithoutExtension(filePath: string): string {
		let normalized = fixFileName(filePath);
		if (normalized.endsWith('.py')) {
			normalized = normalized.substring(0, normalized.length - 3);
		}
		if (normalized.endsWith('/__init__')) {
			normalized = normalized.substring(0, normalized.length - '/__init__'.length);
		}
		return normalized;
	}

	private buildRelativePythonModulePath(importingFile: string, sourceFile: string): string | undefined {
		const importerDir = path.posix.dirname(fixFileName(importingFile));
		const sourceModulePath = this.toPythonModulePathWithoutExtension(sourceFile);
		let rel = path.posix.relative(importerDir, sourceModulePath).replace(/\\/g, '/');
		if (!rel || rel === '.') {
			return undefined;
		}

		const parts = rel.split('/').filter(Boolean);
		let parentDepth = 0;
		while (parts[parentDepth] === '..') {
			parentDepth++;
		}

		const moduleParts = parts.slice(parentDepth);
		const prefix = '.'.repeat(parentDepth + 1);
		if (moduleParts.length === 0) {
			return prefix;
		}
		return `${prefix}${moduleParts.join('.')}`;
	}

	getPythonImportModuleNameForSource(sourceFile: string, importingFile: string): string | undefined {
		if (!this.isSbslibFile(sourceFile)) {
			return undefined;
		}
		return this.buildRelativePythonModulePath(importingFile, sourceFile);
	}

	private syncMastExtractedItems(file: MastFile) {
		this.syncExtractedItemsForUri(file.uri, file.signals, file.blob_keys, file.links, file.roles, file.inventory_keys);
	}

	private syncPyExtractedItems(file: PyFile, includeBlobKeys: boolean) {
		this.syncExtractedItemsForUri(file.uri, file.signals, includeBlobKeys ? file.blob_keys : [], file.links, file.roles, file.inventory_keys);
	}

	private syncExtractedItemsForUri(
		uri: string,
		signals: SignalInfo[],
		blobKeys: Word[],
		links: Word[],
		roles: Word[],
		inventoryKeys: Word[]
	) {
		const normalizedUri = fixFileName(uri);
		this.replaceSignalContribution(normalizedUri, signals);
		this.replaceWordContribution(this.blobKeysByFile, 'blobKeysCache', normalizedUri, blobKeys);
		this.replaceWordContribution(this.linksByFile, 'linksCache', normalizedUri, links);
		this.replaceWordContribution(this.rolesByFile, 'rolesCache', normalizedUri, roles);
		this.replaceWordContribution(this.inventoryKeysByFile, 'inventoryKeysCache', normalizedUri, inventoryKeys);
	}

	private removeExtractedItemsForUri(uri: string) {
		const normalizedUri = fixFileName(uri);
		this.replaceSignalContribution(normalizedUri, []);
		this.replaceWordContribution(this.blobKeysByFile, 'blobKeysCache', normalizedUri, []);
		this.replaceWordContribution(this.linksByFile, 'linksCache', normalizedUri, []);
		this.replaceWordContribution(this.rolesByFile, 'rolesCache', normalizedUri, []);
		this.replaceWordContribution(this.inventoryKeysByFile, 'inventoryKeysCache', normalizedUri, []);
	}

	private replaceWordContribution(
		contributions: Map<string, Word[]>,
		cacheKey: 'blobKeysCache' | 'linksCache' | 'rolesCache' | 'inventoryKeysCache',
		uri: string,
		nextWords: Word[]
	) {
		const previous = contributions.get(uri) || [];
		if (previous.length > 0) {
			const previousSet = new Set(previous);
			this[cacheKey] = this[cacheKey].filter(word => !previousSet.has(word));
		}

		if (nextWords.length > 0) {
			contributions.set(uri, nextWords);
			this[cacheKey] = this[cacheKey].concat(nextWords);
		} else {
			contributions.delete(uri);
		}
	}

	private replaceSignalContribution(uri: string, nextSignals: SignalInfo[]) {
		const previous = this.signalsByFile.get(uri) || [];
		for (const signal of previous) {
			this.removeSignalFromAggregate(signal);
		}

		if (nextSignals.length > 0) {
			this.signalsByFile.set(uri, nextSignals);
			for (const signal of nextSignals) {
				this.addSignalToAggregate(signal);
			}
		} else {
			this.signalsByFile.delete(uri);
		}
	}

	private addSignalToAggregate(signal: SignalInfo) {
		let aggregate = this.signalsCache.find(current => current.name === signal.name);
		if (!aggregate) {
			aggregate = {
				name: signal.name,
				description: signal.description,
				emit: [...signal.emit],
				triggered: [...signal.triggered]
			};
			this.signalsCache.push(aggregate);
			return;
		}

		if (!aggregate.description && signal.description) {
			aggregate.description = signal.description;
		}
		this.appendUniqueLocations(aggregate.emit, signal.emit);
		this.appendUniqueLocations(aggregate.triggered, signal.triggered);
	}

	private removeSignalFromAggregate(signal: SignalInfo) {
		const aggregate = this.signalsCache.find(current => current.name === signal.name);
		if (!aggregate) {
			return;
		}

		this.removeLocations(aggregate.emit, signal.emit);
		this.removeLocations(aggregate.triggered, signal.triggered);
		if (aggregate.description === signal.description) {
			aggregate.description = this.getReplacementSignalDescription(signal.name);
		}

		if (aggregate.emit.length === 0 && aggregate.triggered.length === 0) {
			this.signalsCache = this.signalsCache.filter(current => current !== aggregate);
		}
	}

	private appendUniqueLocations(target: Location[], incoming: Location[]) {
		const existing = new Set(target.map(loc => this.getLocationKey(loc)));
		for (const loc of incoming) {
			const key = this.getLocationKey(loc);
			if (existing.has(key)) {
				continue;
			}
			existing.add(key);
			target.push(loc);
		}
	}

	private removeLocations(target: Location[], toRemove: Location[]) {
		if (toRemove.length === 0 || target.length === 0) {
			return;
		}
		const removalKeys = new Set(toRemove.map(loc => this.getLocationKey(loc)));
		for (let i = target.length - 1; i >= 0; i--) {
			if (removalKeys.has(this.getLocationKey(target[i]))) {
				target.splice(i, 1);
			}
		}
	}

	private getReplacementSignalDescription(name: string): string | undefined {
		for (const signals of this.signalsByFile.values()) {
			for (const signal of signals) {
				if (signal.name === name && signal.description) {
					return signal.description;
				}
			}
		}
		return undefined;
	}

	private getLocationKey(loc: Location): string {
		return `${loc.uri}:${loc.range.start.line}:${loc.range.start.character}:${loc.range.end.line}:${loc.range.end.character}`;
	}

	private shouldIncludeBlobKeysFromPyFile(file: PyFile): boolean {
		return this.pyFileCache.some(current => fixFileName(current.uri) === fixFileName(file.uri));
	}

	private ensureClassCache() {
		if (this.classesCache !== null) {
			return;
		}

		let ret: ClassObject[] = [];
		for (const p of this.pyFileCache) {
			ret = ret.concat(p.classes);
		}
		for (const p of this.missionPyModules) {
			ret = ret.concat(p.classes);
		}
		this.classesCache = ret;
	}

	private addMethodToIndex(index: Map<string, Function[]>, method: Function) {
		const methods = index.get(method.name);
		if (methods) {
			methods.push(method);
		} else {
			index.set(method.name, [method]);
		}
	}

	private ensureMethodCaches() {
		if (this.methodsCache !== null && this.methodIndex !== null && this.classMethodIndex !== null) {
			return;
		}

		const methods: Function[] = [];
		const methodIndex = new Map<string, Function[]>();
		const classMethodIndex = new Map<string, Function[]>();

		for (const py of this.pyFileCache) {
			if (!py.isGlobal) {
				continue;
			}
			for (const method of py.defaultFunctions) {
				methods.push(method);
				this.addMethodToIndex(methodIndex, method);
			}
		}

		for (const py of this.missionPyModules) {
			for (const method of py.defaultFunctions) {
				methods.push(method);
				this.addMethodToIndex(methodIndex, method);
			}
		}

		for (const py of this.pyFileCache) {
			for (const c of py.classes) {
				for (const method of c.methods) {
					// this.addMethodToIndex(methodIndex, method);
					this.addMethodToIndex(classMethodIndex, method);
				}
			}
		}

		for (const py of this.missionPyModules) {
			for (const c of py.classes) {
				for (const method of c.methods) {
					// this.addMethodToIndex(methodIndex, method);
					this.addMethodToIndex(classMethodIndex, method);
				}
			}
		}

		methods.sort((a, b) => {
			if (a.name < b.name) {
				return -1;
			}
			if (a.name > b.name) {
				return 1;
			}
			return 0;
		});

		this.methodsCache = methods;
		this.methodIndex = methodIndex;
		this.classMethodIndex = classMethodIndex;
	}

	/**
	 * Add a py file to the mision cache (stuff in the mission folder, or a module that isn't sbs_utils)
	 * @param p A {@link PyFile PyFile} that should be added to {@link MissionCache.missionPyModules MissionCache.missionPyModules}
	 */
	addMissionPyFile(p:PyFile) {
		for (const f of this.missionPyModules) {
			if (f.uri === p.uri) {
				return;
			}
		}

		if (p.globalFiles.length > 0) {
			this.sbsGlobals = this.sbsGlobals.concat(p.globalFiles);
			for (const g of p.globalFiles) {
				for (const f of this.pyFileCache) {
					this.tryApplyFileAsGlobal(f, g);
				}
				for (const f of this.missionPyModules) {
					this.tryApplyFileAsGlobal(f, g);
				}
			}
		}

		if (p.globals.length > 0) {
			this.mastClassGlobals = this.mastClassGlobals.concat(p.globals);
			for (const g of p.globals) {
				for (const f of this.pyFileCache) {
					this.tryApplyMastClassGlobal(f, g);
				}
				for (const f of this.missionPyModules) {
					this.tryApplyMastClassGlobal(f, g);
				}
			}
		}

		for (const g of this.sbsGlobals) {
			this.tryApplyFileAsGlobal(p, g);
		}
		for (const g of this.mastClassGlobals) {
			this.tryApplyMastClassGlobal(p, g);
		}

		// Only do this if the file doesn't exist yet
		this.missionPyModules.push(p);
		this.invalidateStructureCaches();
		this.syncPyExtractedItems(p, false);
		// this.missionClasses = this.missionClasses.concat(p.classes);
	}

	/**
	 * Add a py file to the sbs_utils cache (stuff that's in sbs_utils)
	 * @param p A {@link PyFile PyFile} that should be added to {@link MissionCache.pyFileCache MissionCache.pyFileCache}
	 */
	addSbsPyFile(p:PyFile) {
		// If it's already there, return
		for (const f of this.pyFileCache) {
			if (fixFileName(f.uri) === fixFileName(p.uri)) {
				return;
			}
		}
		
		// ONly trigger when there are defined globals
		if (p.globalFiles.length > 0) {
			this.sbsGlobals = this.sbsGlobals.concat(p.globalFiles);
			// Update all existing py files if they are globals
			for (const g of p.globalFiles) {
				for (const f of this.pyFileCache) {
					this.tryApplyFileAsGlobal(f, g);
				}
			}
		}
		if (p.globals.length > 0) {
			this.mastClassGlobals = this.mastClassGlobals.concat(p.globals);
			// Update all existing py files that match a MastGlobals class entry
			for (const g of p.globals) {
				for (const f of this.pyFileCache) {
					this.tryApplyMastClassGlobal(f, g);
				}
			}
		}
		
		// ALWAYS go over the existing globals for the new file
		for (const g of this.sbsGlobals) {
			this.tryApplyFileAsGlobal(p, g);
		}
		for (const g of this.mastClassGlobals) {
			this.tryApplyMastClassGlobal(p, g);
		}

		// Now add it to the cache
		this.pyFileCache.push(p);
		this.invalidateStructureCaches();
		this.syncPyExtractedItems(p, true);
	}

	tryApplyMastClassGlobal(f: PyFile, g: string[]) {
		const baseName = path.basename(f.uri, '.py');
		if (baseName === g[0]) {
			f.isGlobal = true;
			f.globalAlias = g[0];
			f.applyImportedGlobalAlias(false);
		}
	}

	tryApplyFileAsGlobal(f:PyFile, g:string[]) {
		if (g[0] === "sbs") {
			// Treat sbs differently
			return;
		}
		const file = f.uri.replace(/\//g,".").replace(/\\/g,".");
		if (file.includes(g[0]) && file.endsWith(".py")) {
			f.isGlobal = true;
			f.globalAlias = g[1] || "";
			const moduleBase = (g[0] || '').split('.').pop() || '';
			const alias = f.globalAlias || moduleBase;
			const createPrefixedFunctions = alias !== 'names';
			f.applyImportedGlobalAlias(createPrefixedFunctions);
		}
	}

	/**
	 * Triggers an update to any files that do or don't exist anymore
	 * Files that no longer exist should be removed by the filesystem watcher
	 * The only real use for this now is when loading the initial cache info.
	 */
	checkForCacheUpdates() {
		const updateStart = Date.now();
		this.missionFilesLoaded = false;
		// First check for any files that have been deleted
		const files = getFilesInDir(this.missionURI);
		let found = false;
		for (const m of this.mastFileCache) {
			for (const f of files) {
				if (f === fixFileName(m.uri)) found = true; break;
			}
			if (found) break;
		}
		if (!found) {
			for (const p of this.pyFileCache) {
				for (const f of files) {
					if (f === fixFileName(p.uri)) found = true; break;
				}
				if (found) break;
			}
		}
		if (found) {
			this.logLoadTiming('checkForCacheUpdates', Date.now() - updateStart, 'found existing files; no sync needed');
			return;
		}

		// Check for any files that should be included, but are not.
		for (const file of files) {
			//debug(path.extname(file));
			if (path.extname(file) === ".mast") {
				//debug(file);
				if (path.basename(file).includes("__init__")) {
					//debug("INIT file found");
				} else {
					// Parse MAST File
					this.getMastFile(file);
				}
			}
			if (path.extname(file) === ".py") {
				//debug(file);
				if (path.basename(file).includes("__init__")) {
					//debug("INIT file found");
				} else {
					// Parse Python File
					this.getPyFile(file);
				}
			}
		}
		// showProgressBar(false);
		this.missionFilesLoaded = true;
		this.logLoadTiming('checkForCacheUpdates', Date.now() - updateStart, `mast=${this.mastFileCache.length}, py=${this.pyFileCache.length}`);
	}

	/**
	 * Gets all route labels in scope for the given cache.
	 * @returns A list of {@link string string}s
	 */
	getRouteLabels(): string[] {
		let str: string[] = [];
		for (const r of this.routeLabels) {
			str.push(r.route);
		}
		return str;
	}

	getUsedRoutes(routeStart:string): string[] {
		let str: string[] = this.getRouteLabels();
		for (const m of this.mastFileCache) {
			str = str.concat(m.routes);
		}
		for (const m of this.missionMastModules) {
			str = str.concat(m.routes);
		}
		if (routeStart !== "") {
			let ret = str;
			str = [];
			for (const s of ret) {
				if (s.startsWith(routeStart)) {
					str.push(s.replace(routeStart,""));
				}
			}
		}
		return str;
	}
 
	/**
	 * Gets all media labels in scope for the given cache.
	 * @returns A list of {@link CompletionItem CompletionItem}s
	 */
	getMediaLabels(): CompletionItem[] {
		let ci: CompletionItem[] = [];
		for (const r of this.mediaLabels) {
			ci.push(r.completionItem);
		}
		return ci;
	}

	/**
	 * Gets all resource labels in scope for the given cache.
	 * @returns A list of {@link CompletionItem CompletionItem}s
	 */
	getResourceLabels(): CompletionItem[] {
		let ci: CompletionItem[] = [];
		for (const r of this.resourceLabels) {
			ci.push(r.completionItem);
		}
		return ci;
	}

	/**
	 * Gets all music files in scope for the given cache.
	 * @returns A list of {@link CompletionItem CompletionItem}s
	 */
	getMusicFiles(): CompletionItem[] {
		return getMusicFiles(this.missionLibFolder);
	}

	/**
	 * Get all methods in scope for this cache
	 * @returns List of {@link Function Function}
	 */
	getMethods(): Function[] {
		this.ensureMethodCaches();
		return this.methodsCache ? [...this.methodsCache] : [];
	}

	/**
	 * Get the method with the given name, if it exists in scope for this cache.
	 * If it's not a default function, it'll check classes too
	 * @param name Name of the {@link Function Function}
	 * @returns The function with the given name.
	 */
	getMethod(name:string): Function | undefined {
		this.ensureMethodCaches();
		return this.methodIndex?.get(name)?.[0];
	}

	/**
	 * Checks over all {@link Function Function}s that are class methods and finds the ones with the given name.
	 * @param name The name of the function
	 * @returns A list of all {@link Function Function}s with that name
	 */
	getPossibleMethods(name:string): Function[] {
		this.ensureMethodCaches();
		return [...(this.classMethodIndex?.get(name) || [])];
	}

	/**
	 * Resolve the best callable for a call expression like `name(...)`.
	 *
	 * For plain calls (default), prefer globals/constructors first.
	 * For member calls (`obj.name(...)`), pass `preferClassMethod=true` to
	 * prefer class methods over constructor/global fallbacks.
	 */
	getCallableForName(name: string, preferClassMethod: boolean = false): Function | undefined {
		const possible = this.getPossibleMethods(name);

		if (preferClassMethod) {
			if (possible.length > 0) {
				return possible[0];
			}
			return this.getMethod(name);
		}

		const globalMethod = this.getMethod(name);
		if (globalMethod) {
			return globalMethod;
		}

		if (possible.length === 0) {
			return undefined;
		}

		const ctor = possible.find((m) => m.functionType === 'constructor' && m.className === name);
		if (ctor) {
			return ctor;
		}

		const sameClassMethod = possible.find((m) => m.className === name);
		if (sameClassMethod) {
			return sameClassMethod;
		}

		return possible[0];
	}

	/**
	 * Get MastGlobals entry by exported global reference name.
	 * Values are sourced from parsed `class MastGlobals: globals = {...}`
	 * definitions in mission python files and mission python modules.
	 *
	 * This intentionally does not treat `MastGlobals.import_python_module(...)`
	 * entries as module globals. Those imports expose the module's functions in
	 * global scope, but do not make the module/file name itself a global symbol
	 * unless it is also exported via the MastGlobals dict.
	 *
	 * `sbs` remains a special-case module global for historical behavior.
	 */
	getMastGlobal(name: string): string[] | undefined {
		const target = (name || '').trim();
		if (target === '') {
			return undefined;
		}

		const findIn = (files: PyFile[]): string[] | undefined => {
			for (const p of files) {
				for (const g of (p.globals || [])) {
					if (g && g.length > 0 && g[0] === target) {
						return g;
					}
				}
			}
			return undefined;
		};

		const findSpecialImportedModule = (globals: string[][]): string[] | undefined => {
			for (const g of globals) {
				if (!g || g.length === 0) {
					continue;
				}
				const modulePath = (g[0] || '').trim();
				const alias = (g[1] || '').trim();
				const moduleBase = modulePath.split('.').pop() || '';

				if (target === 'sbs' && (modulePath === 'sbs' || alias === 'sbs' || moduleBase === 'sbs')) {
					return g;
				}
			}
			return undefined;
		};

		return findIn(this.pyFileCache)
			|| findIn(this.missionPyModules)
			|| findSpecialImportedModule(this.sbsGlobals);
	}

	/**
	 * 
	 * @returns All the classes in scope for this mission cache
	 */
	getClasses(): ClassObject[] {
		this.ensureClassCache();
		return this.classesCache ? [...this.classesCache] : [];
	}

	/**
	 * TODO: This should only return variables that are in scope
	 * @returns A list of {@link CompletionItem CompletionItem}
	 */
	getVariableCompletionItems(doc:TextDocument|undefined): CompletionItem[] {
		// const parent = getParentFolder(URI.parse(file).fsPath);
		// const inits = getInitContents(fixFileName(doc?.uri));
		let uri = ""
		if (doc) uri = fixFileName(doc.uri);
		let ci: CompletionItem[] = [];
		for (const m of this.mastFileCache) {
			if (m.uri === uri) {
				for (const v of m.getVariableNames()) {
					v.sortText = "__" + v.label
					ci.push(v);
				}
				continue;
			}
			ci = ci.concat(m.getVariableNames());
		}
		for (const m of this.missionMastModules) {
			ci = ci.concat(m.getVariableNames());
		}
		//const arrUniq = [...new Map(ci.map(v => [v.label, v])).values()]
		return ci;
	}

	/**
	 * Get {@link Variable Variable}s in scope
	 * @param doc The {@link TextDocument TextDocument}
	 * @returns List of {@link Variable Variable}
	 */
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
	 * Get all signals used in the mission
	 * @returns an array of {@link string string}s representing the signals used elsewhere in the mission
	 */
	getSignals(): SignalInfo[] {
		return [...this.signalsCache];
	}

	getBlobKeys(): Word[] {
		return [...this.blobKeysCache];
	}

	/**
	 * Get all the words in scope
	 * @returns a list of {@link Word Word}
	 */
	getWordLocations(word: string) : Location[] {
		let words: Location[] = [];
		for (const m of this.mastFileCache) {
			words = words.concat(m.getWordLocations(word));
		}
		for (const m of this.missionMastModules) {
			words = words.concat(m.getWordLocations(word));
		}
		// for (const p of this.pyFileCache) {
		// 	words = words.concat(p.getWordLocations(word));
		// }
		// for (const p of this.missionPyModules) {
		// 	words = words.concat(p.getWordLocations(word));
		// }
		return words;
	}

	getLinks(): Word[] {
		return [...this.linksCache];
	}
	
	/**
	 * @param textDocument the current {@link TextDocument TextDocument}
	 * @param thisFileOnly if true, returns only labels in the current file. Default is false.
	 * @returns List of {@link LabelInfo LabelInfo} applicable to the current scope (including modules)
	 */
	getLabels(textDocument: TextDocument, thisFileOnly=false): LabelInfo[] {
		// debug(this.mastFileCache)
		let fileUri: string = fixFileName(textDocument.uri);
		let li: LabelInfo[] = [];
		//debug(this.mastFileInfo);
		for (const f of this.mastFileCache) {
			if (!thisFileOnly || fileUri === f.uri) {
				li = li.concat(f.labelNames);
			}
		}
		if (thisFileOnly) return li;

		// This gets stuff from LegendaryMissions, if the current file isn't LegendaryMissions itself.
		for (const f of this.missionMastModules) {
			li = li.concat(f.labelNames);
		}

		// Remove duplicates (should just be a bunch of END entries)
		// Could also include labels that exist in another file
		// const arrUniq = [...new Map(li.map(v => [v.name, v])).values()]
		return li;
	}

	/**
	 * Get the first label in mission scope matching the given name.
	 * Includes main labels and inline sublabels.
	 * @param name Label name to find
	 * @returns Matching {@link LabelInfo LabelInfo}, or undefined if not found
	 */
	getLabel(name:string, mainOnly:boolean=true): LabelInfo | undefined {
		const target = (name || '').trim();
		if (target === '') {
			return undefined;
		}

		
		const findIn = (labels: LabelInfo[]): LabelInfo | undefined => {
			// console.log(labels);
			for (const label of labels) {
				if (label.name === target) {
					return label;
				}
				if (mainOnly) {
					continue;
				}
				if (label.subLabels && label.subLabels.length > 0) {
					for (const sub of label.subLabels) {
						if (sub.name === target) {
							return sub;
						}
					}
				}
			}
			return undefined;
		};

		for (const file of this.mastFileCache) {
			const found = findIn(file.labelNames);
			// if (file.uri.includes("side_prefabs")) {
			// 	console.log(file.labelNames)
			// 	console.log(found);
			// }
			if (found) {
				return found;
			}
		}

		for (const file of this.missionMastModules) {
			const found = findIn(file.labelNames);
			if (found) {
				return found;
			}
		}

		return undefined;
	}

	/**
	 * Get all labels, including sublabels, that are within the current scope at the specified position within the document.
	 * @param doc 
	 * @param pos 
	 */
	getLabelsAtPos(doc:TextDocument, pos:integer, thisFileOnly:boolean=false): LabelInfo[] {
		// const labels: LabelInfo[] = this.getLabels(doc);
		if (doc.languageId !== "mast") return [];
		const labels = this.getMastFile(doc.uri)?.labelNames || [];
		const main = getMainLabelAtPos(pos,labels);
		const subs = main?.subLabels || [];
		let ret;
		if (thisFileOnly) {
			ret = labels.concat(subs);
		} else {
			ret = this.getLabels(doc).concat(subs);
		}
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
			// for (const f of this.missionDefaultFunctions) {
			// 	ci.push(f.buildCompletionItem());
			// }
			for (const p of this.missionPyModules) {
				for (const f of p.defaultFunctions) {
					ci.push(f.buildCompletionItem());
				}
			}
			for (const c of this.getClasses()) {
				ci.push(c.buildCompletionItem());
			}
			for (const p of this.pyFileCache) {
				if (p.isGlobal) {
					for (const f of p.defaultFunctions) {
						ci.push(f.buildCompletionItem());
					}
				}
			}
			return ci;
		}
		// I don't think this is ever used.
		for (const c of this.getClasses()) {
			if (c.name === _class) {
				debug(c.name + " is the class we're looking for.")
				debug(c.getMethodCompletionItems());
				return c.getMethodCompletionItems();
			}
		}
		return [];//this.missionDefaultCompletions;
	}

	/**
	 * Gets a single method signature for the specified function.
	 * @param name Name of the method or function
	 * @returns Associated {@link SignatureInformation}
	 */
	getSignatureOfMethod(name: string, isClassMethod: boolean=false): SignatureInformation | undefined {
		if (isClassMethod) {
			for (const c of this.getClasses()) {
				for (const f of c.methods) {
					if (f.name === name) {
						return f.buildSignatureInformation();
					}
				}
			}
		}
		for (const p of this.missionPyModules) {
			for (const f of p.defaultFunctions) {
				// for (const f of this.missionDefaultFunctions) {
				if (f.name === name) {
					return f.buildSignatureInformation();
				}
			}
		}
		if (isClassMethod) {
			for (const c of this.getClasses()) {
				for (const m of c.methods) {
					if (m.name === name) {
						return m.buildSignatureInformation();
					}
				}
			}
		}
		for (const m of this.pyFileCache) {
			for (const f of m.defaultFunctions) {
				if (f.name === name) {
					return f.buildSignatureInformation();
				}
			}
			if (isClassMethod) {
				for (const c of m.classes) {
					for (const f of c.methods) {
						if (f.name === name) {
							return f.buildSignatureInformation();
						}
					}
				}
			}
		}
		debug("The right signatures the right way failed...");
		return undefined;
	}

	/**
	 * 
	 * @param folder The folder the current file is in, or just the file uri
	 * @returns an array of strings
	 */
	getRoles(folder: string): Word[] {
		return this.rolesCache.concat(getArtemisGlobals().shipData.roles);
	}

	/**
	 * 
	 * @param folder The folder the current file is in, or just the file uri
	 * @returns an array of strings representing all the inventory keys in scope
	 */
	getInventoryKeys(folder: string): Word[] {
		// folder = fixFileName(folder);
		return [...this.inventoryKeysCache];
	}

	/**
	 * Gets the {@link MastFile MastFile} associated with the given uri, or makes one if it doesn't exist
	 * Must actually be a mast file, so check before using!
	 * @param uri The uri of the file
	 */
	getMastFile(uri:string): MastFile {
		uri = fixFileName(uri);
		for (const m of this.mastFileCache) {
			if (m.uri === uri) {
				return m;
			}
		}
		// debug("Creating Mast File: " + uri);
		let m: MastFile;
		try {
			if (fs.existsSync(uri)) {
				const contents = readFileSync(uri);
				m = new MastFile(uri, contents);
			} else {
				m = new MastFile(uri);
			}
		} catch (e) {
			debug("Failed to synchronously load mast file, falling back to async constructor: " + uri);
			debug(e);
			m = new MastFile(uri);
		}
		this.mastFileCache.push(m);
		this.syncMastExtractedItems(m);
		return m;
	}

	/**
	 * Gets rid of a Mast file from the cache
	 * @param uri Uri of the file to remove
	 */
	removeMastFile(uri:string) {
		uri = fixFileName(uri);
		let newCache: MastFile[] = [];
		for (const m of this.mastFileCache) {
			if (m.uri !== uri) {
				newCache.push(m);
			}
		}
		this.mastFileCache = newCache;
		this.removeExtractedItemsForUri(uri);
	}

	/**
	 * Gets rid of a Python file from the cache
	 * @param uri Uri of the file to remove
	 */
	removePyFile(uri:string) {
		uri = fixFileName(uri);
		debug("Removing " + uri);
		let newMissionCache: PyFile[] = [];
		for (const m of this.missionPyModules) {
			if (fixFileName(m.uri) !== uri) {
				newMissionCache.push(m);
			}
		}
		this.missionPyModules = newMissionCache;

		let newSbsCache: PyFile[] = [];
		for (const p of this.pyFileCache) {
			if (fixFileName(p.uri) !== uri) {
				newSbsCache.push(p);
			}
		}
		this.pyFileCache = newSbsCache;
		this.invalidateStructureCaches();
		this.removeExtractedItemsForUri(uri);
	}

	/**
	 * Must actually be a python file, so check before using!
	 * @param uri The uri of the file
	 */
	getPyFile(uri:string) : PyFile {
		uri = fixFileName(uri);
		for (const p of this.missionPyModules) {
			if (fixFileName(p.uri) === uri) {
				return p;
			}
		}
		for (const p of this.pyFileCache) {
			if (fixFileName(p.uri) === uri) {
				return p;
			}
		}
		/// Should never get to this point unless a new py file was created.
		// debug("New py file: " + uri);
		let p: PyFile;
		try {
			if (fs.existsSync(uri)) {
				const contents = readFileSync(uri);
				p = new PyFile(uri, contents);
			} else {
				p = new PyFile(uri);
			}
		} catch (e) {
			debug("Failed to synchronously load python file, falling back to async constructor: " + uri);
			debug(e);
			p = new PyFile(uri);
		}
		if (uri.includes("sbs_utils")) {
			this.addSbsPyFile(p);
		} else {
			this.addMissionPyFile(p);
		}
		// this.pyFileCache.push(p);
		return p;
	}

	// addMissionPyFile(py:PyFile) {
	// 	for (const p of this.missionPyModules) {

	// 	}
	// }
	isLoaded() {
		let all = this.sbsLoaded && this.storyJsonLoaded && this.pyInfoLoaded && this.missionFilesLoaded;
		// debug("Loaded status:");
		// debug(this.sbsLoaded);
		// debug(this.storyJsonLoaded);
		// debug(this.pyInfoLoaded);
		return all;
	}

	async awaitLoaded() {
		// Await the promise that is resolved when load() completes.
		const waitStart = Date.now();
		await this._loadedPromise;
		const elapsed = Date.now() - waitStart;
		if (elapsed > 50) {
			this.logLoadTiming('awaitLoaded', elapsed);
		}
	}

}

// Map of missionURI -> MissionCache for O(1) lookups
let caches: Map<string, MissionCache> = new Map();

/**
 * 
 * @param name Can be either the name of the mission folder, or a URI to that folder or any folder within the mission folder.
 * @returns 
 */
export function getCache(name:string, reloadCache:boolean = false): MissionCache {
	name = (name || '').trim();
	if (name === '') {
		const fallback = caches.values().next().value as MissionCache | undefined;
		if (fallback) {
			if (reloadCache) fallback.load();
			fallback.lastAccessed = Date.now();
			return fallback;
		}
		debug('getCache called with empty name and no caches available.');
	}

	if (name.startsWith("file")) {
		name = URI.parse(name).fsPath;
	}
	const mf = getMissionFolder(name);
	if (mf === '') {
		const fallback = caches.values().next().value as MissionCache | undefined;
		if (fallback) {
			if (reloadCache) fallback.load();
			fallback.lastAccessed = Date.now();
			return fallback;
		}
	}

	// First try direct lookup by mission folder
	const existing = caches.get(mf);
	if (existing) {
		if (reloadCache) existing.load();
		existing.lastAccessed = Date.now();
		return existing;
	}

	// Fall back: try match by mission name (legacy behavior)
	for (const cache of caches.values()) {
		if (cache.missionName === name) {
			if (reloadCache) cache.load();
			cache.lastAccessed = Date.now();
			return cache;
		}
	}

	// Create a new cache
	const ret = new MissionCache(name);
	caches.set(ret.missionURI, ret);
	ret.load();
	ret.lastAccessed = Date.now();
	return ret;
}



/**
 * If the cache hasn't been accessed in awhile, garbage collect the cache.
 * TODO: Make this a user-customizable option.
 */
function cacheGC() {
	setInterval(()=>{
		const now = Date.now();
		for (const [key, c] of caches.entries()) {
			if (now - c.lastAccessed > 1000 * 60 * 7) { // 7 minutes
				// stop watchers and free resources
				try { c.endWatchers(); } catch (e) { debug(e); }
				caches.delete(key);
			}
		}
	}, 1000 * 60 * 5); // run every 5 minutes
}

// start GC loop
cacheGC();

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


