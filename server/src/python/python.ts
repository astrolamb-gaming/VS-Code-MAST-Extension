import { Options, PythonShell } from 'python-shell';
import { findSubfolderByName, fixFileName, getArtemisDirFromChild, getMissionFolder, getParentFolder } from '../fileFunctions';
import { debug } from 'console';
import path = require('path');
import * as fs from 'fs';
import { getCache, MissionCache } from '../cache';
import { integer } from 'vscode-languageserver';
import { getGlobals } from '../globals';

let pyPath = "";
let scriptPath = "";
let regularOptions:Options;

export function initializePython(uri: string) {
	return;
	const cache = getCache(uri);
	let pyGlobals = [];
	debug("Starting initializePython()");
	try {
		// compileMission(uri)
		getGlobalFunctions(cache.storyJson.sbslib).then((data)=>{
			try {
				pyGlobals = JSON.parse(data[0]);
			} catch(e) {
				pyGlobals = data;
			}
			
			debug(pyGlobals);
			let g = cache.getMethods();
			let keys = [...new Map(g.map(v => [v.name, v.name])).values()];
			debug(keys);
			let notFound: string[] = [];
			for (const g of pyGlobals) {
				if (keys.includes(g.name)) {
					continue;
				} else {
					notFound.push(g);
				}
			}
			debug(notFound)

		});
		// getTokenInfo("math");
		/*
		let globalFuncs = getGlobalFunctions(cache.storyJson.sbslib).then((funcs)=>{
			const classes = Object.fromEntries(cache.missionClasses.map(obj => [obj.name, obj]));
			// const functions = Object.fromEntries(cache.missionDefaultFunctions.map(obj => [obj.name, obj]));
			// debug(funcs);
			for (const f of funcs) {
				// debug(f);
				try {
					// const json = JSON.parse(f);
					// debug(json);
					// debug(json['name']);
					// let found = false;
					// const c = classes[json['name']];
					// if (c === undefined) debug(json['name'] + " is undefined");
					// // if (found) continue;
					// const df = functions[json['name']];
					// if (df === undefined) debug(json['name'] + " is undefined");
					// if (found) {
					// 	debug(json['name'] + " is found!");
					// } else {
					// 	debug("Checking for... " + json['name']);
					// 	// getTokenInfo(json['name'])
					// }
				} catch (ex) {
					debug(f);
					debug(ex);
				}
			}
		});
		*/
	} catch (e) {
		debug(e)
	}
}

export async function getSpecificGlobals(cache: MissionCache, globals: any) {
	let ret: string[] = [];
	// const cache = getCache(mission);
	globals = JSON.stringify(globals);
	if (scriptPath === "") {
		scriptPath = __dirname.replace("out","src");
		// scriptPath = __dirname
	}

	if (pyPath === "") {
		let adir = getGlobals().artemisDir;
		let f = findSubfolderByName(adir,"PyRuntime");
		if (f !== null) {
			pyPath = path.resolve(f);
		} else {
			return [];
		}
		//debug(pyPath);
	}

	let sbs = path.join(scriptPath, "sbs.zip");
	let libFolder = path.join(getGlobals().artemisDir,"data","missions");
	const sbs_utils = path.join(libFolder,"__lib__",cache.storyJson.sbslib[0]);
	

	const o: Options = {
		pythonPath: path.join(pyPath,"python.exe"),
		scriptPath: scriptPath,
		args: [sbs_utils, sbs, globals]
	}

	await PythonShell.run('mastGlobalInfo.py', o).then((messages: any)=>{
		for (let m of messages) {
			// try {
			// 	debug(m)
			// 	m = JSON.parse(m);
			// 	debug(m)
			// } catch (e) {debug(e)}
			ret.push(m);
		}
		console.log('finished');
	}).catch((e)=>{debug(e);});
	// ret[0] = JSON.parse(ret[0])
	return ret;
}

export async function getGlobalFunctions(sbs_utils: string[]): Promise<string[]> {
	let ret: string[] = [];
	if (pyPath === "") {
		let adir = getGlobals().artemisDir;
		let f = findSubfolderByName(adir,"PyRuntime");
		if (f !== null) {
			pyPath = path.resolve(f);
		} else {
			return [];
		}
		//debug(pyPath);
	}
	if (scriptPath === "") {
		scriptPath = __dirname.replace("out","src");
		// scriptPath = __dirname
	}
	
	try {
		let sbsPath = path.join(scriptPath, "sbs.zip");
		let libFolder = path.join(getGlobals().artemisDir,"data","missions");
		const sbsLibPath = path.join(libFolder,"__lib__",sbs_utils[0]);
		const o: Options = {
			pythonPath: path.join(pyPath,"python.exe"),
			scriptPath: scriptPath,
			args: [sbsLibPath,sbsPath]
		}
		regularOptions = o;
		debug("Starting python shell")
		await PythonShell.run('mastGlobalInfo.py', o).then((messages: any)=>{
			for (let m of messages) {
				// try {
				// 	debug(JSON.parse(m));
				// } catch (e) {}
				// debug(m);
				ret.push(m);
			}
			console.log('finished');
		}).catch((e)=>{debug(e);});
	} catch (e) {
		debug(e);
	}

	return ret;
}

export async function compileMission(mastFile: string, content: string, sbs_utils: string[]): Promise<string[]> {
	// debug(sbs_utils)
	// if (sbs_utils[0] !== 'artemis-sbs.sbs_utils.v1.0.1.sbslib') {
	// 	return [];
	// }
	mastFile = fixFileName(mastFile);
	let errors: string[] = [];
	let missionPath: string = getMissionFolder(mastFile);
	if (pyPath === "") {
		let adir = getGlobals().artemisDir;
		let f = findSubfolderByName(adir,"PyRuntime");
		if (f !== null) {
			pyPath = path.resolve(f);
		} else {
			return [];
		}
		//debug(pyPath);
	}

	if (scriptPath === "") {
		scriptPath = __dirname.replace("out","src");
		// scriptPath = __dirname
	}

	const libFolder = getParentFolder(missionPath);

	// Get the possible sbslib files to use - this is sbs_utils
	let sbs_utils_file = sbs_utils[0];
	// This is not a release version - I want my code to be as backwards-compatible as possible
	// At least I should be able to support errors for the current released version
	//sbs_utils_file = "artemis-sbs.sbs_utils.v1.0.2.sbslib";

	const sbsLibPath = path.join(libFolder,"__lib__",sbs_utils_file);

	// Get sbs, if necessary
	let sbsPath = path.join(scriptPath, "sbs.zip");
	//sbsPath = path.join(libFolder, "mock");
	mastFile = path.basename(mastFile);
	const basicOptions: Options = {
		pythonPath: path.join(pyPath,"python.exe"),
		scriptPath: scriptPath,
		args: [sbsLibPath, sbsPath, mastFile, content]
	}

	const o: Options = {
		pythonPath: path.join(pyPath,"python.exe"),
		scriptPath: scriptPath,
		args: [sbsLibPath, sbsPath, mastFile]
	}
	regularOptions = o;
	//debug(o);
	
	//errors = await runScript(basicOptions);
	errors = await bigFile(o, content);
	// errors = [];
	return errors;
}

let shell: PythonShell;
export async function getTokenInfo(token: string) {
	if (shell === undefined || shell === null) {
		let opt = regularOptions;
		if (!opt.args) {
			opt.args = [""];
		}
		opt.args[2] = token;
		debug(token)
		debug(opt)
		shell = new PythonShell('mastFunctionInfo.py', opt);
	

		await PythonShell.run('mastFunctionInfo.py', opt).then((messages: any)=>{
			for (let m of messages) {
				try {
					debug(JSON.parse(m));
				} catch (e) {}
				debug(m);
				// ret.push(m);
			}
			console.log('finished');
		}).catch((e)=>{debug(e);});
		
		shell.on('message',(parsedChunk)=>{
			debug(parsedChunk);
			shell.removeAllListeners();
		})
		shell.send(token);
	}
}

async function runScript(o: Options): Promise<string[]> {
	let errors: string[] = [];
	// This is probably the simplest option


	try {
		await PythonShell.run('mastCompile.py', o).then((messages: any)=>{
			for (let m of messages) {
				let mj = m.replace(/[\[\]]/g, "");
				let errs = mj.split("', '");
				errors = errors.concat(errs);
			}
			console.log('finished');
		});
	} catch (e) {
		debug(e);
	}

	return errors;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function bigFile(options: Options, content: string): Promise<string[]> {
	let errors: string[] = [];
	let compiled = false;

	let myscript = new PythonShell('mastCompile.py', options);
	
	var results: string[] = [];

	myscript.send(content);

	myscript.on('message', (message:string) => {

		//debug(message);
		if (message !== "[]") { // if there's errors, parse them
			let mj = message.replace(/[\[\]]/g, "");
			let errs = mj.split("', '");
			errors = errors.concat(errs);
			// debug(errors);
		}
	});

	// end the input stream and allow the process to exit
	await myscript.end(function (err:Error) {
		compiled = true
		debug(errors);
		if (err) throw err;
		// console.log('The exit code was: ' + code);
		// console.log('The exit signal was: ' + signal);
		// console.log('finished');
	});

	while (!compiled) {
		await sleep(100);
	}
	debug(errors);
	debug("Returning from python.ts")
	return errors
}
