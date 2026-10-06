import * as fs from 'fs';
import * as path from 'path';
import { MissionDescription, readMissionDescription } from './data/missionDescription';
import { CompletionItem, CompletionItemKind, integer, Location, SignatureInformation } from 'vscode-languageserver';
import { MastFile } from './files/MastFile';
import { PyFile } from './files/PyFile';
import { parseLabelsInFile, LabelInfo, getMainLabelAtPos } from './tokens/labels';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { debug } from 'console';
import { IRouteLabel, loadMediaLabels, loadResourceLabels, loadRouteLabels } from './tokens/routeLabels';
import { fileFromUri, fixFileName, getArtemisDirFromChild, getFilesInDir, getInitFileInFolder, getMissionFolder, getParentFolder, readFile, readFileSync } from './fileFunctions';
import { connection, documents, getProfilingCollectionMode, isAllowMultipleCaches, isProfilingCollectionEnabled, requestClientQuickPick, setProgress } from './server';
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
import { packageManager, ParsedLibraryFile, PackageSnapshot } from './packageManager';

export const testingPython = false;
const isMochaProcess = process.argv.some((arg) => arg.toLowerCase().includes('mocha')) || !!process.env.MOCHA_WORKER_ID;
let knownWorkspaceFolderUris: string[] = [];

export function setWorkspaceFolderUris(uris: string[]): void {
	knownWorkspaceFolderUris = [...uris];
}

export function updateWorkspaceFolderUris(added: string[], removed: string[]): void {
	const current = new Set(knownWorkspaceFolderUris);
	for (const uri of removed) current.delete(uri);
	for (const uri of added) current.add(uri);
	knownWorkspaceFolderUris = [...current];
}

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

interface ProfilingStageStats {
	count: number;
	totalMs: number;
	maxMs: number;
}

let sharedLibraryOwnerSequence = 0;

function appendUniquePairs(target: string[][], entries: string[][]): string[][] {
	const seen = new Set(target.map((entry) => JSON.stringify(entry)));
	for (const entry of entries) {
		const key = JSON.stringify(entry);
		if (!seen.has(key)) {
			target.push(entry);
			seen.add(key);
		}
	}
	return target;
}

function createMissionPyFileView(source: PyFile): PyFile {
	const overlay = new Map<PropertyKey, unknown>();
	let globalAliasApplied = false;
	const read = <T>(property: PropertyKey, fallback: T): T =>
		overlay.has(property) ? overlay.get(property) as T : fallback;

	return new Proxy(source, {
		get(target, property, receiver) {
			if (property === 'applyImportedGlobalAlias') {
				return (createPrefixedFunctions: boolean = true) => {
					const globalAlias = read('globalAlias', target.globalAlias);
					if (globalAliasApplied || globalAlias === '') return;
					const aliasClass = new ClassObject('', path.basename(target.uri));
					aliasClass.name = globalAlias;
					aliasClass.methods = read('defaultFunctions', target.defaultFunctions).map((func) => {
						const copy = func.copy();
						copy.className = aliasClass.name;
						return copy;
					});
					overlay.set('classes', [...read('classes', target.classes), aliasClass]);
					if (createPrefixedFunctions) {
						overlay.set('defaultFunctions', read('defaultFunctions', target.defaultFunctions).map((func) => {
							const copy = func.copy();
							copy.name = `${globalAlias}_${copy.name}`;
							return copy;
						}));
					}
					globalAliasApplied = true;
				};
			}
			if (overlay.has(property)) return overlay.get(property);
			return Reflect.get(target, property, receiver);
		},
		set(_target, property, value) {
			if (property === 'globalAliasApplied') {
				globalAliasApplied = value as boolean;
			}
			overlay.set(property, value);
			return true;
		}
	});
}

export class MissionCache {

	missionName: string = "";
	missionURI: string = "";
	missionDescription: MissionDescription | undefined = undefined;
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
	// awaitingReload = false;
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
	private sharedVariableKeysCache: Word[] = [];
	private signalsByFile: Map<string, SignalInfo[]> = new Map();
	private blobKeysByFile: Map<string, Word[]> = new Map();
	private linksByFile: Map<string, Word[]> = new Map();
	private rolesByFile: Map<string, Word[]> = new Map();
	private inventoryKeysByFile: Map<string, Word[]> = new Map();
	private sharedVariableKeysByFile: Map<string, Word[]> = new Map();
	/** Debounce timers: uri -> NodeJS.Timeout for deferred full Python re-parse */
	private _reparseTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
	/** Aggregated profiling metrics for load/reload phases */
	private _profilingStageStats: Map<string, ProfilingStageStats> = new Map();
	private _profilingSampleCount = 0;
	private _sharedLibraryParseKeys = new Set<string>();
	private _nextSharedLibraryParseKeys: Set<string> | undefined;
	private _sharedLibraryPackageSourceKeys = new Map<string, Set<string>>();
	private _sharedLibraryFilesByKey = new Map<string, ParsedLibraryFile>();
		private _sharedPackageSnapshots = new Map<string, PackageSnapshot>();
	private _routeLabelsBySharedSource = new Map<string, IRouteLabel[]>();
	private _styleDefinitionsBySharedSource = new Map<string, string[]>();
	private readonly _sharedLibraryOwnerId = ++sharedLibraryOwnerSequence;

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
	private _isLoading = false;
	private get progressOperationId(): string {
		return `cache:${this.missionURI}`;
	}

	private logLoadTiming(stage: string, elapsedMs: number, details: string = '') {
		try {
			const suffix = details ? ` | ${details}` : '';
			const msg = `[load:${this.missionName}] ${stage} took ${elapsedMs}ms${suffix}`;
			debug(msg);
			// connection.console.log(msg);
		} catch (e) {
			debug(e);
		}

		// if (!isMochaProcess && isProfilingCollectionEnabled()) {
		// 	this.recordProfilingSample(stage, elapsedMs);
		// 	if (stage === 'load:complete' || stage === 'reload:complete') {
		// 		this.flushProfilingSummary(stage);
		// 	}
		// }
		debug("Finished logLoadTiming for stage: " + stage);
	}

	private recordProfilingSample(stage: string, elapsedMs: number) {
		const existing = this._profilingStageStats.get(stage);
		if (existing) {
			existing.count += 1;
			existing.totalMs += elapsedMs;
			existing.maxMs = Math.max(existing.maxMs, elapsedMs);
		} else {
			this._profilingStageStats.set(stage, {
				count: 1,
				totalMs: elapsedMs,
				maxMs: elapsedMs
			});
		}
		this._profilingSampleCount += 1;
	}

	private flushProfilingSummary(triggerStage: string) {
		if (this._profilingStageStats.size === 0) {
			return;
		}

		const ranked = [...this._profilingStageStats.entries()]
			.map(([stage, stats]) => ({
				stage,
				count: stats.count,
				totalMs: stats.totalMs,
				avgMs: Math.round(stats.totalMs / Math.max(1, stats.count)),
				maxMs: stats.maxMs
			}))
			.sort((a, b) => b.totalMs - a.totalMs)
			.slice(0, 8)
			.map((item) => `${item.stage}: count=${item.count}, total=${item.totalMs}ms, avg=${item.avgMs}ms, max=${item.maxMs}ms`)
			.join(' || ');

		const mode = getProfilingCollectionMode();
		const summary = `[profile:${this.missionName}] trigger=${triggerStage} mode=${mode} samples=${this._profilingSampleCount} | ${ranked}`;
		try {
			connection.console.log(summary);
		} catch (e) {
			debug(e);
		}

		try {
			if (this.missionURI) {
				const logPath = path.join(this.missionURI, 'mast-profiler.log');
				const line = `${new Date().toISOString()} ${summary}\n`;
				fs.appendFileSync(logPath, line, 'utf8');
			}
		} catch (e) {
			debug(e);
		}

		this._profilingStageStats.clear();
		this._profilingSampleCount = 0;
	}

	load(): Promise<void> {
		if (this._isLoading) {
			debug(`load() called while already loading for ${this.missionName}, ignoring.`);
			return this._loadedPromise;
		}
		if (this.missionURI === "") {
			debug("Mission folder not valid: " + this.missionURI + "\nNot loading cache.")
			return Promise.resolve();
		}
		this._isLoading = true;
		this._loadedPromise = this.loadInternal().catch((e) => {
			debug(`[load:${this.missionName}] MissionCache.load() failed`);
			debug(e);
		}).finally(() => {
			this._isLoading = false;
			setProgress(this.progressOperationId, false);
		});
		return this._loadedPromise;
	}

	private async loadInternal(): Promise<void> {
		this.missionDescription = readMissionDescription(this.missionURI);

		const artemisDir = getArtemisDirFromChild(this.missionURI);
		const missionFiles = fs.existsSync(this.missionURI) ? getFilesInDir(this.missionURI, true) : [];
		const hasMastFiles = missionFiles.some((file) => path.extname(file).toLowerCase() === '.mast');
		if (!artemisDir && !hasMastFiles) {
			debug(`[load:${this.missionName}] Skipping cache load: no Artemis directory or MAST files found at ${this.missionURI}`);
			return;
		}
		this.beginSharedLibraryParseLoad();

		this.endWatchers();
		this.storyJsonLoaded = false;
		this.pyInfoLoaded = false;
		this.missionFilesLoaded = false;
		this.sbsLoaded = false;
		debug("Starting MissionCache.load()");
		const loadStart = Date.now();
		// this.logLoadTiming('load:start', 0, `uri=${this.missionURI}`);
		debug("logLoadTiming for 'load:start' recorded");
		
		debug("Showing progress bar");
		setProgress(this.progressOperationId, true, 'Loading MAST Data');
		// (re)set all the arrays before (re)populating them.
		// this.missionClasses = [];
		// this.missionDefaultFunctions = [];
		debug("Resetting mission cache arrays");
		this.missionMastModules = [];
		this.missionPyModules = [];
		this.pyFileCache = [];
		this.routeLabels = [];
		this.styleDefinitions = [];
		this._sharedLibraryPackageSourceKeys.clear();
		this._sharedPackageSnapshots.clear();
		this._routeLabelsBySharedSource.clear();
		this._styleDefinitionsBySharedSource.clear();
		this.resourceLabels = [];
		this.mediaLabels = [];
		this.mastFileCache = [];
		debug("Invalidating structure caches");
		this.invalidateStructureCaches();
		debug("Resetting extracted item caches");
		this.resetExtractedItemCaches();
		debug("Resetting mission package layout");
		this.resetMissionPackageLayout();
		const layoutStart = Date.now();
		debug("Starting to load mission package layout");
		try {
			this.loadMissionPackageLayout();
		} catch (e) {
			debug(`[load:${this.missionName}] loadMissionPackageLayout failed`);
			debug(e);
			this.applyDefaultMastlibLayoutForMissingManifest();
		}
		debug("Finished loading mission package layout");
		this.logLoadTiming(
			'loadMissionPackageLayout',
			Date.now() - layoutStart,
			`sbslib=${this.missionPackageLayout.sbslib.size}, mastlib=${this.missionPackageLayout.mastlib.size}, zip=${this.missionPackageLayout.zip.size}`
		);
		debug("Logged mission package layout")
		this.storyJson = new StoryJson(path.join(this.missionURI,"story.json"));
		debug("storyJson initialized")
		const storyStart = Date.now();
		this.storyJson.readFile()
		debug("storyJson read from file")
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
				if (f.isDeprecated) {
					this.deprecatedFunctions.push(f);
				}
			}
		}
		for (const p of this.missionPyModules) {
			for (const f of p.defaultFunctions) {
				if (f.isDeprecated) {
					this.deprecatedFunctions.push(f);
				}
			}
		}

		this.checkForCacheUpdates();
		debug(this.missionURI);
		
		//this.checkForInitFolder(this.missionURI);
		debug("Number of py files: "+this.pyFileCache.length);
		debug("Everything is loaded");
		this.commitSharedLibraryParseLoad();
		this.startWatchers();
		const loadElapsed = Date.now() - loadStart;
		this.logLoadTiming('load:complete', loadElapsed, `loaded=${this.isLoaded()}`);
	}

	/**
	 * Reload the cache after it's already been loaded to reset everything.
	 */
	async reload() {
		// Don't load until it's finished loading the first time
		if (this._isLoading) return;
		const reloadStart = Date.now();
		// this.logLoadTiming('reload:start', 0);
		this._isLoading = true;
		debug("Awaiting loaded")
		try {
			await this.awaitLoaded();
			await this.load();
			debug("Reload complete.");
			// this.logLoadTiming('reload:complete', Date.now() - reloadStart);
		} finally {
			this._isLoading = false;
		}
	}

	watchers: fs.FSWatcher[] = [];

	private isPackageTempPath(targetPath: string): boolean {
		const normalizedPath = fixFileName(targetPath).replace(/\/+$/, '');
		const packageTempRoot = fixFileName(path.join(os.tmpdir(), 'cosmosModules')).replace(/\/+$/, '');
		const comparablePath = process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
		const comparableRoot = process.platform === 'win32' ? packageTempRoot.toLowerCase() : packageTempRoot;
		return comparablePath === comparableRoot || comparablePath.startsWith(`${comparableRoot}/`);
	}

	private get sharedLibraryOwnerKey(): string {
		return `${normalizeCacheKey(this.missionURI)}#${this._sharedLibraryOwnerId}`;
	}

	private beginSharedLibraryParseLoad() {
		if (this._nextSharedLibraryParseKeys) {
			for (const key of this._nextSharedLibraryParseKeys) {
				if (!this._sharedLibraryParseKeys.has(key)) {
					packageManager.releaseParsedFile(key, this.sharedLibraryOwnerKey);
					this._sharedLibraryFilesByKey.delete(key);
				}
			}
		}
		this._nextSharedLibraryParseKeys = new Set<string>();
	}

	private retainSharedLibraryParse(key: string, parsed: ParsedLibraryFile) {
		packageManager.retainParsedFile(key, this.sharedLibraryOwnerKey);
		this._sharedLibraryFilesByKey.set(key, parsed);
		(this._nextSharedLibraryParseKeys ?? this._sharedLibraryParseKeys).add(key);
	}

	private commitSharedLibraryParseLoad() {
		if (!this._nextSharedLibraryParseKeys) return;
		for (const key of this._sharedLibraryParseKeys) {
			if (!this._nextSharedLibraryParseKeys.has(key)) {
				packageManager.releaseParsedFile(key, this.sharedLibraryOwnerKey);
				this._sharedLibraryFilesByKey.delete(key);
			}
		}
		this._sharedLibraryParseKeys = this._nextSharedLibraryParseKeys;
		this._nextSharedLibraryParseKeys = undefined;
	}

	releaseSharedLibraryParses() {
		const keys = new Set([...this._sharedLibraryParseKeys, ...(this._nextSharedLibraryParseKeys ?? [])]);
		for (const key of keys) {
			packageManager.releaseParsedFile(key, this.sharedLibraryOwnerKey);
		}
		this._sharedLibraryFilesByKey.clear();
		this._sharedLibraryParseKeys.clear();
		this._nextSharedLibraryParseKeys = undefined;
		packageManager.releaseOwnerPackages(this.sharedLibraryOwnerKey);
	}

	/**
	 * Watch mission-local files and metadata; PackageManager owns archive package watchers.
	 */
	startWatchers() {
		if (isMochaProcess) {
			return;
		}

		let w = fs.watch(this.missionURI, {"recursive": true}, (eventType, filename) => {
			// debug("fs.watch() EVENT: ")
			// debug(eventType);
			// could be either 'rename' or 'change'. new file event and delete
			// also generally emit 'rename'
			// debug(filename);
			if (filename === null || filename.includes(".git") || filename.includes("__pycache__") || filename.includes("__init__") || filename.endsWith(".pyc")) return;
			if (filename === 'description.yaml') {
				void this.reload().catch((e) => debug(e));
				return;
			}
			// debug(this.missionURI)
			// debug(filename)
			if (eventType === "rename") {
				const filePath = path.join(this.missionURI, filename);

				// Check if the file was added
				if (fs.existsSync(filePath)) {
					if (!filename.endsWith(".py") && !filename.endsWith(".mast")) return;
					console.log(`File added: ${filename}`);
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
				void this.reload().catch((e) => debug(e));
			}
			if (filename === "__lib__.json" && eventType === "change") {
				void this.reload().catch((e) => debug(e));
			}
		});
		this.watchers.push(w);
		const runtime = path.join(this.missionURI,"mast.runtime.log");
		const compile = path.join(this.missionURI,"mast.compile.log");
		// Create absent logs without truncating existing files so both paths can be watched immediately.
		fs.writeFileSync(runtime, '', { flag: 'a' });
		fs.writeFileSync(compile, '', { flag: 'a' });
		const runWatch = fs.watch(runtime, {}, (eventType, filename) => {
			if (eventType === "change") void this.showLog("runtime", filename).catch((e) => debug(e));
		});
		this.watchers.push(runWatch);
		const compileWatch = fs.watch(compile, {}, (eventType, filename) => {
			if (eventType === "change") void this.showLog("compile", filename).catch((e) => debug(e));
		});
		this.watchers.push(compileWatch);
	}
	endWatchers() {
		for (const w of this.watchers) {
			w.close();
		}
		this.watchers = [];
	}

	async showLog(type: "runtime" | "compile", uri:string | null) {
		if (!uri) {
			uri = path.join(this.missionURI,"mast." + type + ".log")
		}
		fs.stat(uri, async (err, stats) => {
			if (err) {
				debug(err);
				return;
			}
			if (stats.size === 0) {
				debug("Log file is empty: " + uri);
				return;
			}
			connection.sendNotification('custom/showFile', {file: uri, open:true});
			// return;
			// let view = "View";
			// let ignore = "Ignore"
			// let message = (type === "runtime" ? "Runtime" : "Compile") + " Error Detected for " + this.missionName;
			// let ret = await connection.window.showErrorMessage(
			// 	message,
			// 	{title: view},
			// 	{title: ignore}
			// );
			// if (ret === undefined) return false;
			// if (ret.title === view) {
			// 	connection.sendNotification('custom/showFile', {file: uri, open:true});
			// }
		});
	}

	/**
	 * Load globals from the python shell and builtins.py (stuff like len() and list())
	 * @param globals 
	 */
	async loadPythonGlobals(globals: string[][]) {

		


		// Now we add the globals from the python shell. We have to do this after loading the modules, since some globals are defined in the modules.
		let go = await initializeArtemisGlobals();
		setProgress(this.progressOperationId, true, 'Loading Python Globals');
		let sigParser = /'(.*?)'/g;
		const parseDocSignatureParams = (signatureText: string): Array<{ name: string; optional: boolean }> => {
			const parsed: Array<{ name: string; optional: boolean }> = [];
			let token = '';
			let depth = 0;
			let tokenOptional = false;

			const pushToken = () => {
				const raw = token.trim();
				token = '';
				if (!raw) {
					tokenOptional = depth > 0;
					return;
				}

				let cleaned = raw.replace(/[\[\]]/g, '').trim();
				if (cleaned === '' || cleaned === '/' || cleaned === '*' || cleaned === '...') {
					tokenOptional = depth > 0;
					return;
				}

				cleaned = cleaned.replace(/^\*\*?/, '').trim();
				const baseName = cleaned.split('=')[0].split(':')[0].trim();
				if (baseName !== '') {
					const hasInlineDefault = cleaned.includes('=');
					parsed.push({ name: baseName, optional: tokenOptional || hasInlineDefault });
				}

				tokenOptional = depth > 0;
			};

			for (const ch of signatureText) {
				if (ch === '[') {
					depth++;
					if (token.trim() === '') {
						tokenOptional = true;
					}
					continue;
				}
				if (ch === ']') {
					pushToken();
					depth = Math.max(0, depth - 1);
					continue;
				}
				if (ch === ',') {
					pushToken();
					continue;
				}

				if (token.length === 0 && /\S/.test(ch)) {
					tokenOptional = depth > 0;
				}
				token += ch;
			}

			pushToken();
			return parsed;
		};
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
		let info: any[] = [];
		// Query even when the mission has no custom globals: the Python helper also
		// contributes standard built-in type methods such as str.replace().
		debug(`[load:${this.missionName}] resolving ${globalNames.length} Python globals and built-in types`);
		info = await getSpecificGlobals(this, globalNames);
		debug(`[load:${this.missionName}] Python global lookup returned ${info.length} entries`);
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
						const paramMetadata = Array.isArray(g["param_metadata"]) ? g["param_metadata"] : [];
						const defaultParams = Array.isArray(g["default_params"]) ? g["default_params"] : [];
						const defaultMap = new Map<string, string>();
						const typeMap = new Map<string, string>();
						const docMap = new Map<string, string>();
						for (const pm of paramMetadata) {
							if (!pm || typeof pm !== 'object') continue;
							const paramName = (pm["name"] ?? "").toString().trim();
							if (paramName === "") continue;
							const defaultVal = (pm["default"] ?? "").toString();
							const typeVal = (pm["type"] ?? "").toString().trim();
							const docVal = (pm["documentation"] ?? "").toString();
							if (defaultVal !== "") defaultMap.set(paramName, defaultVal);
							if (typeVal !== "") typeMap.set(paramName, typeVal);
							if (docVal !== "") docMap.set(paramName, docVal);
						}
						for (const dp of defaultParams) {
							if (!dp || typeof dp !== 'object') continue;
							const paramName = (dp["name"] ?? "").toString().trim();
							if (paramName === "") continue;
							if (!defaultMap.has(paramName)) {
								const defaultVal = (dp["default"] ?? "").toString();
								if (defaultVal !== "") defaultMap.set(paramName, defaultVal);
							}
						}

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
								const argName = m[1];
								const argType = typeMap.get(argName);
								const defaultVal = defaultMap.get(argName);
								let rawParam = argName;
								if (argType !== undefined && argType !== '') {
									rawParam += `: ${argType}`;
								}
								if (defaultVal !== undefined && defaultVal !== '') {
									rawParam += ` = ${defaultVal}`;
								}
								params.push(rawParam)
								if (argName !== "self") {
									const p = new Parameter(rawParam,f.parameters.length,docMap.get(argName) || "");
									f.parameters.push(p);
								}
							}
							f.rawParams = params.join(', ');
						}
						// If there's no sig info, such as for math.hypot, we can do this to parse the documentation
						if (f.parameters.length === 0 && doc !== undefined) {
							let paramCheck = /\((.*?)\)/g;
							let params: Array<{ name: string; optional: boolean }> = [];
							while (m = paramCheck.exec(doc)) {
								if (doc.includes(name + m[0])) {
									f.rawParams = m[1];
									params = parseDocSignatureParams(m[1]);
									break;
								}
							}
							const fallbackRawParams: string[] = [];
							for (const p of params) {
								if (p.name !== "self") {
									const argType = typeMap.get(p.name);
									const mappedDefault = defaultMap.get(p.name);
									let rawParam = p.name;
									if (argType !== undefined && argType !== '') {
										rawParam += `: ${argType}`;
									}
									if (mappedDefault !== undefined && mappedDefault !== '') {
										rawParam += ` = ${mappedDefault}`;
									} else if (p.optional) {
										// Bracketed signatures like sub[, start[, end]] denote optional params.
										rawParam += ' = None';
									}
									const param = new Parameter(rawParam,f.parameters.length,docMap.get(p.name) || "");
									f.parameters.push(param);
									fallbackRawParams.push(rawParam);
								}
							}
							f.rawParams = fallbackRawParams.join(', ');
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
		if (this.isPackageTempPath(folder)) return false;
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

	/**
	 * Loads the zip/mastlib/sbslib file modules
	 * @returns Promise<void>
	 */
	async modulesLoaded() {
		const modulesStart = Date.now();
		if (testingPython) return;
		const seenModuleFiles = new Set<string>();
		let globals = getArtemisGlobals();
		debug("Getting Artemis globals");
		if (globals === undefined) {
			debug("Artemis globals not found, initializing...");
			globals = await initializeArtemisGlobals();
			debug("Artemis globals initialized");
		}
		try {
			const lib = this.storyJson.mastlib.concat(this.storyJson.sbslib);
			let totalPyLoaded = 0;
			let totalMastLoaded = 0;
			debug("Beginning to load modules");
			const workspaceFolders = this.getWorkspaceFolderPaths();
			let artemisMissions: Array<{ name: string; path: string }> = [];
			const globalMissionsRoot = globals.artemisDir
				? path.join(globals.artemisDir, 'data', 'missions')
				: '';
			if (lib.length > 0 && globalMissionsRoot && fs.existsSync(globalMissionsRoot)) {
				try {
					artemisMissions = globals.getAllMissions().map((missionName) => ({
						name: missionName,
						path: path.join(globalMissionsRoot, missionName)
					}));
				} catch (error) {
					debug(`Unable to enumerate global Artemis package sources at ${globalMissionsRoot}; will also search the mission-local package root ${this.missionLibFolder}`);
					debug(error);
				}
			}
			const requests = lib.map((name) => ({
				name,
				missionLibFolder: this.missionLibFolder,
				artemisMissions,
				workspaceFolders,
				getModuleBaseName: (moduleName: string) => this.storyJson.getModuleBaseName(moduleName)
			}));
			const packages = await packageManager.reconcilePackages(
				requests,
				this.sharedLibraryOwnerKey,
				(packagePath, nextFiles) => this.onSharedPackageChanged(packagePath, nextFiles)
			);
			for (const [name, resolved] of packages) {
				let modulePyLoaded = 0;
				let moduleMastLoaded = 0;
				const unseenFiles = resolved.snapshot.files.filter((parsed) => !seenModuleFiles.has(parsed.source));
				for (const parsed of unseenFiles) {
					seenModuleFiles.add(parsed.source);
					if (parsed.pyFile) modulePyLoaded++;
					if (parsed.mastFile) moduleMastLoaded++;
				}
				this.attachSharedLibraryPackage(resolved.identity, resolved.snapshot, unseenFiles);
				totalPyLoaded += modulePyLoaded;
				totalMastLoaded += moduleMastLoaded;
				this.logLoadTiming('modules:module', 0, `${name} | source=${resolved.identity}, py=${modulePyLoaded}, mast=${moduleMastLoaded}`);
			}
			this.logLoadTiming('modules:totals', Date.now() - modulesStart, `py=${totalPyLoaded}, mast=${totalMastLoaded}`);
		} catch(e) {
			debug(`Error loading packages for ${this.missionURI}; missionLibFolder=${this.missionLibFolder}; requested=${this.storyJson.mastlib.concat(this.storyJson.sbslib).join(', ')}`);
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

	private getWorkspaceFolderPaths(): string[] {
		return knownWorkspaceFolderUris.flatMap((uri) => {
			try {
				const folderPath = URI.parse(uri).fsPath;
				return folderPath ? [folderPath] : [];
			} catch (e) {
				debug(`Unable to parse workspace folder URI ${uri}`);
				debug(e);
				return [];
			}
		});
	}

	/**
	 * Takes file name and contents and handles them. Checks if it's a .py or .mast file, creates the relevant object, ignores everything else.
	 * Also ignores __init__ files of both the mast and py varieties
	 * @param data Contents of a file, as a {@link string string}
	 * @param file name of a file, as a {@link string string}
	 * @returns 
	 */
	private attachSharedLibraryParse(key: string, parsed: ParsedLibraryFile, file: string, packagePath?: string, rebuildSharedAggregates: boolean = true) {
		this.retainSharedLibraryParse(key, parsed);
		this._routeLabelsBySharedSource.set(key, parsed.routeLabels);
		this._styleDefinitionsBySharedSource.set(key, parsed.styleDefinitions);
		if (rebuildSharedAggregates) {
			this.rebuildSharedPackageRouteAndStyleAggregates();
		}
		if (packagePath) {
			const packageKey = packageManager.normalizeSource(packagePath);
			let sourceKeys = this._sharedLibraryPackageSourceKeys.get(packageKey);
			if (!sourceKeys) {
				sourceKeys = new Set<string>();
				this._sharedLibraryPackageSourceKeys.set(packageKey, sourceKeys);
			}
			sourceKeys.add(key);
		}

		if (parsed.pyFile) {
			const missionView = createMissionPyFileView(parsed.pyFile);
			if (file.includes("sbs_utils")) {
				this.addSbsPyFile(missionView);
			} else {
				this.addMissionPyFile(missionView);
			}
		} else if (parsed.mastFile) {
			const normalizedMastUri = fixFileName(parsed.mastFile.uri);
			if (!this.missionMastModules.some((existing) => fixFileName(existing.uri) === normalizedMastUri)) {
				this.missionMastModules.push(parsed.mastFile);
				this.syncMastExtractedItems(parsed.mastFile);
			}
		}
	}

	private attachSharedLibraryPackage(packagePath: string, snapshot: PackageSnapshot, files: ParsedLibraryFile[] = snapshot.files) {
		this._sharedPackageSnapshots.set(packageManager.normalizeSource(packagePath), snapshot);
		for (const parsed of files) {
			this.attachSharedLibraryParse(parsed.key, parsed, parsed.file, packagePath, false);
		}
		this.rebuildSharedPackageRouteAndStyleAggregates();
		debug(`[cache:${this.missionName}] attached package ${packagePath}: files=${files.length}, labels=${snapshot.labels.length}, signals=${snapshot.signals.length}`);
		debug(`[cache:${this.missionName}] package aggregates: labels=${[...this._sharedPackageSnapshots.values()].reduce((count, item) => count + item.labels.length, 0)}, signals=${[...this._sharedPackageSnapshots.values()].reduce((count, item) => count + item.signals.length, 0)}`);
	}

	private rebuildSharedPackageRouteAndStyleAggregates() {
		this.routeLabels = [...this._routeLabelsBySharedSource.values()].flat();
		this.styleDefinitions = [...this._styleDefinitionsBySharedSource.values()].flat();
	}

	handleZipData(data: string, file: string = "", source: string = file, packagePath?: string) {
		const parseStart = Date.now();
		let handledAs = 'ignored';		// debug("Beginning to load zip data for: " + file);
		if (file.endsWith("__init__.mast") || file.endsWith("__init__.py") || file.endsWith(".pyc") || /(^|[\\/])tests?([\\/]|$)/i.test(file)) {
			// Do nothing
			handledAs = 'init-skip';
		} else if (file.endsWith(".py") || file.endsWith(".mast")) {
			handledAs = file.endsWith('.py') ? 'python' : 'mast';
			const parsed = packageManager.getParsedFile(data, file, source);
			const key = parsed.key;
			this.attachSharedLibraryParse(key, parsed, file, packagePath);
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

	private getSharedPackageFileUris(): Set<string> {
		const uris = new Set<string>();
		for (const snapshot of this._sharedPackageSnapshots.values()) {
			for (const file of snapshot.files) uris.add(fixFileName(file.file));
		}
		return uris;
	}

	private getWordsWithPackageAggregates(
		contributions: Map<string, Word[]>,
		selectPackageWords: (snapshot: PackageSnapshot) => Word[]
	): Word[] {
		const packageUris = this.getSharedPackageFileUris();
		const words = [...contributions.entries()]
			.filter(([uri]) => !packageUris.has(uri))
			.flatMap(([, items]) => items);
		for (const snapshot of this._sharedPackageSnapshots.values()) {
			words.push(...selectPackageWords(snapshot));
		}
		return words;
	}

	private resetMissionPackageLayout(): void {
		this.missionPackageLayout = {
			sbslib: new Set<string>(),
			mastlib: new Set<string>(),
			zip: new Set<string>()
		};
	}

	private applyDefaultMastlibLayoutForMissingManifest(): void {
		this.resetMissionPackageLayout();
		for (const entry of this.getTopLevelMissionEntries()) {
			this.missionPackageLayout.mastlib.add(entry);
		}
	}

	private getTopLevelMissionEntries(): string[] {
		try {
			return fs.readdirSync(this.missionURI, { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name);
		} catch (error) {
			debug(`Unable to list mission folders in ${this.missionURI}: ${error}`);
			return [];
		}
	}

	private parseManifestArray(value: unknown): string[] {
		if (!Array.isArray(value)) {
			return [];
		}
		return value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean);
	}

	private parseMissionLibManifest(contents: string): MissionLibManifest | undefined {
		const parsed: unknown = JSON.parse(contents);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return undefined;
		}
		return parsed as MissionLibManifest;
	}

	private async promptForMissionLibVersion(): Promise<string> {
		const versions = ['v1.3.0'];
		const selected = await requestClientQuickPick(
			'Select a version for the new __lib__.json file.',
			versions,
			'Choose a version'
		);
		return selected || versions[0];
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

	private loadMissionPackageLayout(): void {
		const layoutStart = Date.now();
		if (!fs.existsSync(this.missionLibManifestPath)) {
			this.applyDefaultMastlibLayoutForMissingManifest();
			// Fire-and-forget: don't block load() while waiting for user dialog response.
			// If the user creates __lib__.json, the file watcher will trigger a reload.
			this.promptToCreateMissingMissionLibManifest().catch((e) => debug(e));
			debug('Default mastlib layout applied due to missing manifest');
			// this.logLoadTiming('loadMissionPackageLayout:manifest', Date.now() - layoutStart, 'manifest missing; default mastlib layout');
			return;
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
			debug('Finished loading mission package layout with Finally block');
			this.logLoadTiming(
				'loadMissionPackageLayout:manifest',
				Date.now() - layoutStart,
				`sbslib=${this.missionPackageLayout.sbslib.size}, mastlib=${this.missionPackageLayout.mastlib.size}, zip=${this.missionPackageLayout.zip.size}`
			);
		}
		debug('Exiting loadMissionPackageLayout');
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
		// Shared package files are materialized with this prefix so editors can
		// distinguish them from writable files; it is not part of the Python module.
		normalized = normalized.replace(/(^|\/)READONLY_([^/]*)$/, '$1$2');
		return normalized;
	}

	private getSbsUtilsModuleName(filePath: string): string | undefined {
		const normalized = fixFileName(filePath);
		const packageMarker = '/sbs_utils/';
		const markerIndex = normalized.toLowerCase().lastIndexOf(packageMarker);
		if (markerIndex < 0 || !normalized.toLowerCase().endsWith('.py')) {
			return undefined;
		}
		let modulePath = normalized.substring(markerIndex + packageMarker.length, normalized.length - 3);
		modulePath = modulePath.replace(/(^|\/)READONLY_([^/]*)$/, '$1$2');
		if (modulePath === '__init__') {
			return 'sbs_utils';
		}
		if (modulePath.endsWith('/__init__')) {
			modulePath = modulePath.substring(0, modulePath.length - '/__init__'.length);
		}
		return `sbs_utils.${modulePath.replace(/\//g, '.')}`;
	}

	private buildRelativePythonImportFromModules(importingModule: string, sourceModule: string): string | undefined {
		const importerPackage = importingModule.split('.').slice(0, -1);
		const sourceParts = sourceModule.split('.');
		let commonParts = 0;
		while (commonParts < importerPackage.length &&
			commonParts < sourceParts.length &&
			importerPackage[commonParts] === sourceParts[commonParts]) {
			commonParts++;
		}
		if (commonParts === 0) {
			return undefined;
		}
		const relativeLevel = importerPackage.length - commonParts + 1;
		return '.'.repeat(relativeLevel) + sourceParts.slice(commonParts).join('.');
	}

	private getCosmosModuleRoot(filePath: string): string | undefined {
		const normalized = fixFileName(filePath);
		const match = /^(.*\/cosmosModules\/[^/]+)(?:\/|$)/i.exec(normalized);
		return match?.[1];
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
		// The archive-backed source may be under cosmosModules while the open file
		// is the editable checkout. Compare their logical sbs_utils module names so
		// siblings still produce imports like `from .inventory import ...`.
		const sourceSbsModule = this.getSbsUtilsModuleName(sourceFile);
		const importingSbsModule = this.getSbsUtilsModuleName(importingFile);
		if (sourceSbsModule && importingSbsModule) {
			return this.buildRelativePythonImportFromModules(importingSbsModule, sourceSbsModule);
		}

		// Package files loaded from an archive share a stable extracted root, not
		// the mission's filesystem root. Within that package, use Python-relative
		// imports (e.g. `.inventory`) just as the original package source does.
		const sourcePackageRoot = this.getCosmosModuleRoot(sourceFile);
		const importerPackageRoot = this.getCosmosModuleRoot(importingFile);
		if (sourcePackageRoot && sourcePackageRoot === importerPackageRoot) {
			return this.buildRelativePythonModulePath(importingFile, sourceFile);
		}

		const sourceIsMissionFile = this.getMissionRelativePath(sourceFile) !== undefined;
		const importerIsMissionFile = this.getMissionRelativePath(importingFile) !== undefined;
		const sourceIsSbslibFile = this.isSbslibFile(sourceFile);
		if (sourceIsSbslibFile) {
			// Keep relative imports inside the same shared-library package only. A
			// mission file importing sbs_utils must use its normal absolute package
			// path; computing a path from the mission root to the library source would
			// produce an invalid dotted path containing the drive and directory names.
			const sourcePackage = this.getTopLevelMissionFolder(sourceFile);
			const importerPackage = this.getTopLevelMissionFolder(importingFile);
			if (sourcePackage && sourcePackage === importerPackage) {
				return this.buildRelativePythonModulePath(importingFile, sourceFile);
			}
			return undefined;
		}
		// Mission-local modules are imported relative to one another, matching the
		// package style used by files such as `lifeform.py` (`from .links import ...`).
		if (sourceIsMissionFile && importerIsMissionFile) {
			return this.buildRelativePythonModulePath(importingFile, sourceFile);
		}
		return undefined;
	}

	private syncMastExtractedItems(file: MastFile) {
		this.syncExtractedItemsForUri(file.uri, file.signals, file.blob_keys, file.links, file.roles, file.inventory_keys, file.shared_variable_keys);
	}

	private syncPyExtractedItems(file: PyFile, includeBlobKeys: boolean) {
		this.syncExtractedItemsForUri(file.uri, file.signals, includeBlobKeys ? file.blob_keys : [], file.links, file.roles, file.inventory_keys, file.shared_variable_keys);
	}

	private syncExtractedItemsForUri(
		uri: string,
		signals: SignalInfo[],
		blobKeys: Word[],
		links: Word[],
		roles: Word[],
		inventoryKeys: Word[],
		sharedVariableKeys: Word[]
	) {
		const normalizedUri = fixFileName(uri);
		this.replaceSignalContribution(normalizedUri, signals);
		this.replaceWordContribution(this.blobKeysByFile, 'blobKeysCache', normalizedUri, blobKeys);
		this.replaceWordContribution(this.linksByFile, 'linksCache', normalizedUri, links);
		this.replaceWordContribution(this.rolesByFile, 'rolesCache', normalizedUri, roles);
		this.replaceWordContribution(this.inventoryKeysByFile, 'inventoryKeysCache', normalizedUri, inventoryKeys);
		this.replaceWordContribution(this.sharedVariableKeysByFile, 'sharedVariableKeysCache', normalizedUri, sharedVariableKeys);
	}

	private removeExtractedItemsForUri(uri: string) {
		const normalizedUri = fixFileName(uri);
		this.replaceSignalContribution(normalizedUri, []);
		this.replaceWordContribution(this.blobKeysByFile, 'blobKeysCache', normalizedUri, []);
		this.replaceWordContribution(this.linksByFile, 'linksCache', normalizedUri, []);
		this.replaceWordContribution(this.rolesByFile, 'rolesCache', normalizedUri, []);
		this.replaceWordContribution(this.inventoryKeysByFile, 'inventoryKeysCache', normalizedUri, []);
		this.replaceWordContribution(this.sharedVariableKeysByFile, 'sharedVariableKeysCache', normalizedUri, []);
	}

	private replaceWordContribution(
		contributions: Map<string, Word[]>,
		cacheKey: 'blobKeysCache' | 'linksCache' | 'rolesCache' | 'inventoryKeysCache' | 'sharedVariableKeysCache',
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

		// Build callable aliases exported through MastGlobals.globals.
		// Example: MastGlobals.globals["mast_name"] = python_function
		// creates a callable named mast_name that resolves to python_function.
		for (const g of this.mastClassGlobals) {
			if (!g || g.length < 2) {
				continue;
			}
			const aliasName = (g[0] || '').trim();
			const targetName = (g[1] || '').trim();
			if (aliasName === '' || targetName === '' || aliasName === targetName) {
				continue;
			}

			const existingAlias = methodIndex.get(aliasName);
			if (existingAlias && existingAlias.length > 0) {
				continue;
			}

			const target = methodIndex.get(targetName)?.[0];
			if (!target) {
				continue;
			}

			const alias = target.copy();
			alias.name = aliasName;
			if (!alias.documentation || alias.documentation.trim() === '') {
				alias.documentation = `Global alias for ${targetName}`;
			} else {
				alias.documentation = `${alias.documentation}\n\nGlobal alias for ${targetName}`;
			}
			methods.push(alias);
			this.addMethodToIndex(methodIndex, alias);
		}

		const allClasses: ClassObject[] = [];
		for (const py of this.pyFileCache) {
			allClasses.push(...py.classes);
		}
		for (const py of this.missionPyModules) {
			allClasses.push(...py.classes);
		}

		for (const c of allClasses) {
			for (const method of c.getVisibleMethods(allClasses)) {
				this.addMethodToIndex(classMethodIndex, method);
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
		const normalizedIncoming = fixFileName(p.uri);
		for (const f of this.missionPyModules) {
			if (fixFileName(f.uri) === normalizedIncoming) {
				return;
			}
		}

		if (p.globalFiles.length > 0) {
			appendUniquePairs(this.sbsGlobals, p.globalFiles);
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
			appendUniquePairs(this.mastClassGlobals, p.globals);
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
			appendUniquePairs(this.sbsGlobals, p.globalFiles);
			// Update all existing py files if they are globals
			for (const g of p.globalFiles) {
				for (const f of this.pyFileCache) {
					this.tryApplyFileAsGlobal(f, g);
				}
			}
		}
		if (p.globals.length > 0) {
			appendUniquePairs(this.mastClassGlobals, p.globals);
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
		const baseName = path.basename(f.uri, '.py').replace(/^READONLY_/, '');
		if (baseName === g[0]) {
			f.isGlobal = true;
			f.globalAlias = g[0];
			f.applyImportedGlobalAlias(false);
		}
	}

	private matchesImportedPythonModule(file: PyFile, importedModule: string): boolean {
		const moduleFile = file.uri
			.replace(/\\/g, '/')
			.replace(/(^|\/)READONLY_/g, '$1')
			.replace(/\.py$/i, '')
			.replace(/\//g, '.');
		const normalizedImport = importedModule.replace(/[\\/]/g, '.');
		return file.uri.toLowerCase().endsWith('.py') &&
			(moduleFile === normalizedImport || moduleFile.endsWith(`.${normalizedImport}`));
	}

	tryApplyFileAsGlobal(f:PyFile, g:string[]) {
		const importedModule = (g[0] || '').trim();
		if (importedModule === '') {
			return;
		}

		const baseName = path.basename(f.uri, '.py');
		if (importedModule === 'sbs') {
			if (baseName !== 'sbs') {
				return;
			}
			f.isGlobal = true;
			f.globalAlias = 'sbs';
			f.applyImportedGlobalAlias(false);
			return;
		}

		if (this.matchesImportedPythonModule(f, importedModule)) {
			f.isGlobal = true;
			f.globalAlias = g[1] || "";
			const moduleBase = importedModule.split('.').pop() || '';
			const alias = f.globalAlias || moduleBase;
			const createPrefixedFunctions = alias !== 'names' && alias !== 'sbs';
			f.applyImportedGlobalAlias(createPrefixedFunctions);
		}
	}

	private async onSharedPackageChanged(packagePath: string, nextFiles: PackageSnapshot): Promise<void> {
		await this.awaitLoaded();
		if (!this.refreshSharedLibraryPackage(packagePath, nextFiles)) {
			await this.load();
		}
	}

	private refreshSharedLibraryPackage(packagePath: string, nextFiles: PackageSnapshot): boolean {
		const packageKey = packageManager.normalizeSource(packagePath);
		const oldKeys = this._sharedLibraryPackageSourceKeys.get(packageKey) ?? new Set<string>();
		const oldBySource = new Map<string, ParsedLibraryFile>();
		for (const key of oldKeys) {
			const parsed = this._sharedLibraryFilesByKey.get(key);
			if (parsed) oldBySource.set(parsed.source, parsed);
		}

		const nextBySource = new Map(nextFiles.files.map((entry) => [entry.source, entry]));
		const changedSources = new Set<string>();
		for (const [source, old] of oldBySource) {
			if (nextBySource.get(source)?.key !== old.key) changedSources.add(source);
		}
		for (const [source, next] of nextBySource) {
			if (oldBySource.get(source)?.key !== next.key) changedSources.add(source);
		}

		// Python exports can affect aliases and globals across multiple files in a mission.
		for (const source of changedSources) {
			if (oldBySource.get(source)?.pyFile || nextBySource.get(source)?.pyFile) return false;
		}

		if (changedSources.size === 0) {
			this._sharedPackageSnapshots.set(packageKey, nextFiles);
			return true;
		}

		for (const source of changedSources) {
			const old = oldBySource.get(source);
			if (old) {
				const oldUri = old.mastFile?.uri;
				if (oldUri) {
					const normalizedUri = fixFileName(oldUri);
					this.missionMastModules = this.missionMastModules.filter((file) => fixFileName(file.uri) !== normalizedUri);
					this.removeExtractedItemsForUri(oldUri);
				}
				this._sharedLibraryParseKeys.delete(old.key);
				packageManager.releaseParsedFile(old.key, this.sharedLibraryOwnerKey);
				this._sharedLibraryFilesByKey.delete(old.key);
				this._routeLabelsBySharedSource.delete(old.key);
				this._styleDefinitionsBySharedSource.delete(old.key);
			}

			const next = nextBySource.get(source);
			if (next) this.attachSharedLibraryParse(next.key, next, next.file, packagePath, false);
		}

		this._sharedLibraryPackageSourceKeys.set(packageKey, new Set(nextFiles.files.map((entry) => entry.key)));
		this._sharedPackageSnapshots.set(packageKey, nextFiles);
		return true;
	}

	/**
	 * Triggers an update to any files that do or don't exist anymore
	 * Files that no longer exist should be removed by the filesystem watcher
	 * The only real use for this now is when loading the initial cache info.
	 */
	checkForCacheUpdates() {
		const updateStart = Date.now();
		this.missionFilesLoaded = false;
		if (!fs.existsSync(this.missionURI)) {
			this.missionFilesLoaded = true;
			return;
		}
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
			// this.logLoadTiming('checkForCacheUpdates', Date.now() - updateStart, 'found existing files; no sync needed');
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
		const methods = this.classMethodIndex?.get(name) || [];
		return [...new Map(methods.map((method) => [method.name + ':' + method.className, method])).values()];
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

		// For plain calls `name(...)`, do not return unrelated class methods.
		return undefined;
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
		let uri = "";
		if (doc) uri = fixFileName(doc.uri);
		let ci: CompletionItem[] = [];

		// Keep current-file variables available, and expose only global-scope
		// variables from other files. Variables defined under ==main== are
		// parsed as global-scope and therefore show up everywhere.
		const pushVariable = (v: Variable, prioritize: boolean = false) => {
			const item: CompletionItem = {
				label: v.name,
				kind: CompletionItemKind.Variable,
				labelDetails: { description: "var" },
				sortText: `${prioritize ? '__' : '___'}${v.name}`
			};
			ci.push(item);
		};

		for (const m of this.mastFileCache) {
			if (m.uri === uri) {
				for (const v of m.variables) {
					pushVariable(v, true);
				}
				continue;
			}
			for (const v of m.variables) {
				if (v.isGlobalScope) {
					pushVariable(v);
				}
			}
		}
		for (const m of this.missionMastModules) {
			for (const v of m.variables) {
				if (v.isGlobalScope) {
					pushVariable(v);
				}
			}
		}

		return [...new Map(ci.map((v) => [v.label, v])).values()];
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
	 * Get all mission-global variables, optionally filtered by name.
	 */
	getGlobalVariables(name?: string): Variable[] {
		const globals: Variable[] = [];
		for (const mastFile of this.mastFileCache.concat(this.missionMastModules)) {
			for (const variable of mastFile.variables || []) {
				if (!variable.isGlobalScope) {
					continue;
				}
				if (name && variable.name !== name) {
					continue;
				}
				globals.push(variable);
			}
		}
		return globals;
	}

	/**
	 * Get source locations for all mission-global variables, optionally filtered by name.
	 */
	getGlobalVariableLocations(name?: string): Location[] {
		const locations: Location[] = [];
		for (const mastFile of this.mastFileCache.concat(this.missionMastModules)) {
			for (const variable of mastFile.variables || []) {
				if (!variable.isGlobalScope) {
					continue;
				}
				if (name && variable.name !== name) {
					continue;
				}
				locations.push({
					uri: fileFromUri(mastFile.uri),
					range: variable.range
				});
			}
		}
		return locations;
	}

	/**
	 * Get all signals used in the mission
	 * @returns an array of {@link string string}s representing the signals used elsewhere in the mission
	 */
	getSignals(): SignalInfo[] {
		return this.getSignalsWithPackageAggregates();
	}

	private getSignalsWithPackageAggregates(): SignalInfo[] {
		const signals = new Map<string, SignalInfo>();
		const appendSignal = (signal: SignalInfo) => {
			const existing = signals.get(signal.name);
			if (!existing) {
				signals.set(signal.name, {
					...signal,
					emit: [...signal.emit],
					triggered: [...signal.triggered]
				});
				return;
			}

			if (!existing.description && signal.description) {
				existing.description = signal.description;
			}
			this.appendUniqueLocations(existing.emit, signal.emit);
			this.appendUniqueLocations(existing.triggered, signal.triggered);
		};

		for (const signal of this.signalsCache) {
			appendSignal(signal);
		}
		for (const snapshot of this._sharedPackageSnapshots.values()) {
			for (const signal of snapshot.signals) {
				appendSignal(signal);
			}
		}
		return [...signals.values()];
	}

	getBlobKeys(): Word[] {
		return this.getWordsWithPackageAggregates(this.blobKeysByFile, (snapshot) => snapshot.blobKeys);
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
		return this.getWordsWithPackageAggregates(this.linksByFile, (snapshot) => snapshot.links);
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
		for (const snapshot of this._sharedPackageSnapshots.values()) li = li.concat(snapshot.labels);
		const packageUris = this.getSharedPackageFileUris();
		for (const file of this.missionMastModules) {
			if (!packageUris.has(fixFileName(file.uri))) li = li.concat(file.labelNames);
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

		for (const snapshot of this._sharedPackageSnapshots.values()) {
			const found = findIn(snapshot.labels);
			if (found) {
				return found;
			}
		}
		const packageUris = this.getSharedPackageFileUris();
		for (const file of this.missionMastModules) {
			if (packageUris.has(fixFileName(file.uri))) continue;
			const found = findIn(file.labelNames);
			if (found) return found;
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
		const addPythonFileFunctions = (file: PyFile) => {
			const addedNames = new Set<string>();
			for (const func of file.defaultFunctions) {
				ci.push(func.buildCompletionItem());
				addedNames.add(func.name);
			}
			// MAST aliases are derived from import_python_module declarations. Build
			// any missing prefixed entries from source declarations as a safeguard for
			// shared-package views whose alias mutation has not been applied yet.
			for (const [modulePath, declaredAlias] of this.sbsGlobals) {
				if (!this.matchesImportedPythonModule(file, modulePath)) continue;
				const prefix = declaredAlias || modulePath.split('.').pop() || '';
				if (!prefix || prefix === 'names' || prefix === 'sbs') continue;
				for (const sourceFunction of file.pythonFunctions) {
					const aliasName = `${prefix}_${sourceFunction.name}`;
					if (addedNames.has(aliasName)) continue;
					const aliasFunction = sourceFunction.copy();
					aliasFunction.name = aliasName;
					ci.push(aliasFunction.buildCompletionItem());
					addedNames.add(aliasName);
				}
			}
		};
		// Don't need to do this, but will be slightly faster than iterating over missionClasses and then returning the defaults
		if (_class === "") {
			//debug(ci.length);
			// ci = ci.concat(this.missionDefaultCompletions);
			// for (const f of this.missionDefaultFunctions) {
			// 	ci.push(f.buildCompletionItem());
			// }
			for (const p of this.missionPyModules) {
				addPythonFileFunctions(p);
			}
			for (const c of this.getClasses()) {
				ci.push(c.buildCompletionItem());
			}
			for (const p of this.pyFileCache) {
				addPythonFileFunctions(p);
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
	 * Get completions for Python code using declarations as they are named in their
	 * source modules. MAST-facing aliases are intentionally kept out of this list.
	 */
	getPythonCompletions(): CompletionItem[] {
		const items: CompletionItem[] = [];
		for (const file of [...this.missionPyModules, ...this.pyFileCache]) {
			for (const func of file.pythonFunctions) {
				items.push(func.buildCompletionItem());
			}
			for (const classObject of file.pythonClasses) {
				items.push(classObject.buildCompletionItem());
			}
		}
		return items;
	}

	/** Return source-declared classes, excluding synthetic MAST module wrappers. */
	getPythonClasses(): ClassObject[] {
		return [...this.missionPyModules, ...this.pyFileCache]
			.flatMap((file) => file.pythonClasses);
	}

	/**
	 * Gets a single method signature for the specified function.
	 * @param name Name of the method or function
	 * @returns Associated {@link SignatureInformation}
	 */
	getSignatureOfMethod(name: string, isClassMethod: boolean=false): SignatureInformation | undefined {
		if (isClassMethod) {
			for (const c of this.getClasses()) {
				for (const f of c.getVisibleMethods(this.getClasses())) {
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
				for (const m of c.getVisibleMethods(this.getClasses())) {
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
		return this.getWordsWithPackageAggregates(this.rolesByFile, (snapshot) => snapshot.roles)
			.concat(getArtemisGlobals().shipData.roles);
	}

	/**
	 * 
	 * @param folder The folder the current file is in, or just the file uri
	 * @returns an array of strings representing all the inventory keys in scope
	 */
	getInventoryKeys(folder: string): Word[] {
		// folder = fixFileName(folder);
		return this.getWordsWithPackageAggregates(this.inventoryKeysByFile, (snapshot) => snapshot.inventoryKeys);
	}

	/**
	 * @param folder The folder the current file is in, or just the file uri
	 * @returns shared keys from get/set_shared_variable and get/set_shared_string calls in scope
	 */
	getSharedVariableKeys(folder: string): Word[] {
		return this.getWordsWithPackageAggregates(this.sharedVariableKeysByFile, (snapshot) => snapshot.sharedVariableKeys);
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

	isLoading(): boolean {
		return this._isLoading;
	}

	async awaitLoaded() {
		// Await the promise that is resolved when load() completes.
		const waitStart = Date.now();
		await this._loadedPromise;
		const elapsed = Date.now() - waitStart;
		if (elapsed > 50) {5
			this.logLoadTiming('awaitLoaded', elapsed);
		}
	}

}

// Map of missionURI -> MissionCache for O(1) lookups
let caches: Map<string, MissionCache> = new Map();

function normalizeCacheKey(input: string): string {
	const normalized = fixFileName(input || '').replace(/\/+$|\/+$/g, '');
	return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

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
			if (reloadCache) void fallback.load().catch((e) => debug(e));
			fallback.lastAccessed = Date.now();
			return fallback;
		}
		debug('getCache called with empty name and no caches available.');
	}

	if (name.startsWith("file")) {
		name = URI.parse(name).fsPath;
	}
	const mf = getMissionFolder(name);
	const missionKey = normalizeCacheKey(mf);
	if (mf === '') {
		const fallback = caches.values().next().value as MissionCache | undefined;
		if (fallback) {
			if (reloadCache) void fallback.load().catch((e) => debug(e));
			fallback.lastAccessed = Date.now();
			return fallback;
		}
	}

	// First try direct lookup by mission folder
	const existing = caches.get(missionKey);
	if (existing) {
		if (reloadCache) void existing.load().catch((e) => debug(e));
		existing.lastAccessed = Date.now();
		return existing;
	}

	// Fall back: try match by mission name (legacy behavior)
	for (const cache of caches.values()) {
		if (cache.missionName === name) {
			if (reloadCache) void cache.load().catch((e) => debug(e));
			cache.lastAccessed = Date.now();
			return cache;
		}
	}

	// Create a new cache
	const ret = new MissionCache(name);
	caches.set(normalizeCacheKey(ret.missionURI), ret);
	if (!isMochaProcess) {
		void ret.load().catch((e) => debug(e)).then(() => {debug("Cache loaded for " + ret.missionURI)});
	}
	ret.lastAccessed = Date.now();
	return ret;
}

export function getLoadedCaches(): MissionCache[] {
	return [...caches.values()];
}



/** URIs of every open editor tab reported by the client (includes non-mast/python files). */
let openTabUris: string[] = [];

export function setOpenTabUris(uris: string[]) {
	openTabUris = uris;
}

/** Mission folder keys (normalized) for every currently open document or tab. */
function getOpenMissionCacheKeys(): Set<string> {
	const keys = new Set<string>();
	for (const uri of openTabUris) {
		try {
			const mf = getMissionFolder(uri);
			if (mf) keys.add(normalizeCacheKey(mf));
		} catch (e) {
			debug(e);
		}
	}
	for (const doc of documents.all()) {
		try {
			const mf = getMissionFolder(doc.uri);
			if (mf) keys.add(normalizeCacheKey(mf));
		} catch (e) {
			debug(e);
		}
	}
	return keys;
}

/** Mission key of the most recently focused (active editor) document, used in single-cache mode. */
let lastFocusedMissionKey: string | undefined;

/**
 * Called whenever the client reports the active editor has changed. Ensures the focused
 * mission's cache is loaded, and, when mastLanguageServer.allowMultipleCaches is disabled,
 * closes every other cache so only the focused mission is retained.
 */
export function focusMissionCache(uri: string) {
	const cache = getCache(uri);
	lastFocusedMissionKey = normalizeCacheKey(cache.missionURI);
	if (!isAllowMultipleCaches()) {
		evictUnusedCaches();
	}
}

/**
 * Release caches that are no longer needed:
 * - In single-cache mode (allowMultipleCaches=false), only the most recently focused mission's cache is kept.
 * - Otherwise, a cache is kept as long as at least one of its files is open in the editor.
 */
export function evictUnusedCaches() {
	if (!isAllowMultipleCaches()) {
		for (const [key, c] of caches.entries()) {
			if (key !== lastFocusedMissionKey) {
				try { c.endWatchers(); } catch (e) { debug(e); }
				c.releaseSharedLibraryParses();
				caches.delete(key);
			}
		}
		return;
	}

	const openMissionKeys = getOpenMissionCacheKeys();
	for (const [key, c] of caches.entries()) {
		if (!openMissionKeys.has(key)) {
			// stop watchers and free resources
			try { c.endWatchers(); } catch (e) { debug(e); }
			c.releaseSharedLibraryParses();
			caches.delete(key);
		}
	}
}

/**
 * Periodic safety-net sweep in case an eviction-triggering event (e.g. onDidClose) is missed.
 * evictUnusedCaches() is also called directly whenever a document closes, so this mostly
 * only matters for documents closed without a clean LSP close notification.
 */
function cacheGC() {
	const gcTimer = setInterval(evictUnusedCaches, 1000 * 60 * 5); // run every 5 minutes

	// Do not keep Node alive just for background cache cleanup.
	if (typeof gcTimer.unref === 'function') {
		gcTimer.unref();
	}
}

// start GC loop
cacheGC();

