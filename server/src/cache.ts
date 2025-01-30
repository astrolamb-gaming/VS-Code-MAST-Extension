import { CompletionItem, SignatureInformation } from 'vscode-languageserver';
import { ClassTypings, parseWholeFile, PyFile } from './data';
import { LabelInfo } from './labels';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { debug } from 'console';
import { prepCompletions } from './autocompletion';
import { prepSignatures } from './signatureHelp';
import { parse, RX } from './rx';
import { loadRouteLabels } from './routeLabels';



export function loadCache(dir: string) {
	cache = new Cache();
	const defSource = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/sbs_utils/mast/mast.py";
	const defSource2 = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/sbs_utils/mast/maststory.py";
	loadTypings().then(()=>{ debug("Typings Loaded" )});
	loadRouteLabels().then(()=>{ debug("Routes Loaded") });
	getRexEx(defSource).then(()=>{ debug("Regular Expressions gotten")});
	getRexEx(defSource2).then(()=>{ debug("Regular Expressions 2 gotten")
		debug("Label?: ");
		debug(exp.get("Label"));
	});
	
}



export class Cache {
	constructor() {}
	// string is the full file path and name
	// FileCache is the information associated with the file
	fileInfo: Map<string,FileCache> = new Map();

	getLabels(): LabelInfo[] {
		let li: LabelInfo[] = [];
		for (const f of this.fileInfo) {
			li = li.concat((f[1] as MastFileCache).labelNames);
		}
		return li;
	}

	/**
	 * Get the FileCache associated with the filename
	 * @param name 
	 * @returns FileCache
	 */
	get(name:string): FileCache | undefined {
		let ret = this.fileInfo.get(name);
		if (ret === undefined) {
			for (const f of this.fileInfo) {
				if (f[0].endsWith(name)) {
					return f[1];
				}
			}
		}
		return ret;
	}
	set(file:string, info: FileCache) {
		this.fileInfo.set(file,info);
	}



}

export class FileCache {
	variableNames: string[] = [];
}

export class PyFileCache extends FileCache {
	classTypings : ClassTypings[] = [];
	pyTypings : CompletionItem[] = [];
	functionData : SignatureInformation[] = [];
}

export class MastFileCache extends FileCache {
	labelNames : LabelInfo[] = [];
}

const sourceFiles: PyFile[] = []
export function getSourceFiles(): PyFile[] { return sourceFiles; }

async function loadTypings(): Promise<void> {
	try {
		//const { default: fetch } = await import("node-fetch");
		//const fetch = await import('node-fetch');
		//let github : string = "https://github.com/artemis-sbs/sbs_utils/raw/refs/heads/master/mock/sbs.py";
		let gh : string = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/typings/";
		for (const page in files) {
			let url = gh+files[page]+".pyi";
			const data = await fetch(url);
			const textData = await data.text();
			sourceFiles.push(parseWholeFile(textData, files[page]));
		}
		prepCompletions(sourceFiles);
		prepSignatures(sourceFiles);
	} catch (err) {
		debug("\nFailed to load\n"+err as string);
	}
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

let cache: Cache;
export function getCache(): Cache {
	return cache;
}