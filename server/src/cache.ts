import * as fs from 'fs';
import * as path from 'path';
import { CompletionItem, SignatureInformation } from 'vscode-languageserver';
import { ClassTypings, FileCache, IClassObject, MastFile, PyFile } from './data';
import { LabelInfo } from './labels';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { debug } from 'console';
import { prepCompletions } from './autocompletion';
import { prepSignatures } from './signatureHelp';
import { parse, RX } from './rx';
import { loadRouteLabels } from './routeLabels';
import { getFilesInDir, getMissionFolder, getParentFolder, readZipArchive } from './fileFunctions';
import { updateLabelNames } from './server';
import { URI } from 'vscode-uri';



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

	// string is the full file path and name
	// FileCache is the information associated with the file
	pyFileInfo: PyFile[] = [];
	mastFileInfo: MastFile[] = [];

	

	constructor(workspaceUri: string) {
		debug(workspaceUri);
		this.missionURI = getMissionFolder(workspaceUri);
		debug(this.missionURI);
		this.missionName = path.basename(this.missionURI);
		this.storyJson = new StoryJson(path.join(this.missionURI,"story.json"));
		this.storyJson.readFile().then(()=>{this.modulesLoaded()});
	
		let files: string[] = getFilesInDir(this.missionURI);
		for (const file of files) {
			if (path.extname(file) === "mast") {
				debug(file);
				if (path.basename(file).includes("__init__")) {
					debug("INIT file found");
				} else {
					// Parse MAST File
					const m: MastFile = new MastFile(file);
					this.mastFileInfo.push(m);
				}
				
				
			}
			if (path.extname(file) === "py") {
				debug(file);
				// Parse Python File
				const p: PyFile = new PyFile(file);
				this.pyFileInfo.push(p);
			}
		}

	}

	modulesLoaded() {
		const uri = this.missionURI;
		debug(uri);
		if (uri.includes("sbs_utils")) {
			debug("sbs nope");
		}
		const missionLibFolder = path.join(getParentFolder(uri), "__lib__");
		debug(missionLibFolder);
		const lib = this.storyJson.mastlib.concat(this.storyJson.sbslib);
		for (const zip of lib) {
			const zipPath = path.join(missionLibFolder,zip);
			readZipArchive(zipPath).then((data)=>{
				debug("Zip archive read for " + zipPath);
				this.handleZipData(data);
			}).catch(err =>{
				debug("Error unzipping. \n" + err);
			});
		}
		loadSbs().then((p)=>{
			this.missionPyModules.push(p);
			this.missionClasses = this.missionClasses.concat(p.classes);
			this.missionDefaultCompletions = this.missionDefaultCompletions.concat(p.defaultFunctionCompletionItems);
			for (const s of p.defaultFunctions) {
				this.missionDefaultSignatures.push(s.signatureInformation);
			}
		});
	}

	handleZipData(zip: Map<string, string>) {
		//debug(zip);
		zip.forEach((data, file)=>{
			if (file.endsWith(".py")) {
				const p = new PyFile(file, data);
				this.missionPyModules.push(p);
				this.missionClasses = this.missionClasses.concat(p.classes);
				this.missionDefaultCompletions = this.missionDefaultCompletions.concat(p.defaultFunctionCompletionItems);
				//this.missionDefaultSignatures = this.missionDefaultSignatures.concat(p.defaultFunctions)
				for (const s of p.defaultFunctions) {
					this.missionDefaultSignatures.push(s.signatureInformation);
				}
			}
			if (file.endsWith(".mast")) {
				const m = new MastFile(file, data);
				this.missionMastModules.push(m);
			}
		});
		
		
		debug(this.missionDefaultCompletions);
		debug(this.missionClasses);
	}

	
	/**
	 * @param fileUri The uri of the file. 
	 * @returns List of {@link LabelInfo LabelInfo} applicable to the current scope
	 */
	getLabels(fileUri: string): LabelInfo[] {
		let li: LabelInfo[] = [];
		for (const f of this.mastFileInfo) {
			// Check if the mast files are in scope
			// TODO: Check init.mast for if any files should not be included
			debug(fileUri);
			if (f.parentFolder === getParentFolder(fileUri)) {
				li = li.concat(f.labelNames);
			}
		}
		return li;
	}

	/**
	 * @param _class String name of the class that we're dealing with. Optional. Default value is an empty string, and the default functions will be returned.
	 * @returns List of {@link CompletionItem CompletionItem} related to the class, or the default function completions
	 */
	getCompletions(_class: string = "") {
		let ci:CompletionItem[] = [];
		// Don't need to do this, but will be slightly faster than iterating over missionClasses and then returning the defaults
		if (_class === "") {
			ci = this.missionDefaultCompletions;
			for (const c of this.missionClasses) {
				ci.push(c.completionItem);
			}
			// TODO: Add variables in scope
			return ci;
		}
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

async function loadSbs(): Promise<PyFile> {
	let gh: string = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/mock/sbs.py";
	const data = await fetch(gh);
	const text = await data.text();
	return new PyFile(gh, text);
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
	debug("Trying to get cache with name: " + name);
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