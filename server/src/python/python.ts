import { Options, PythonShell } from 'python-shell';
import { findSubfolderByName, fixFileName, getArtemisDirFromChild, getMissionFolder, getParentFolder } from '../fileFunctions';
import { debug } from 'console';
import path = require('path');
import * as fs from 'fs';
import { getCache, MissionCache } from '../cache';
import { integer } from 'vscode-languageserver';
import { getGlobals, initializeGlobals } from '../globals';
import { StoryJson } from '../data/storyJson';
import { notifyClient, sendWarning } from '../server';

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
		getGlobalFunctions(cache.storyJson).then((data)=>{
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
	// if (scriptPath === "") {
	// 	scriptPath = __dirname.replace("out","src");
	// 	// scriptPath = __dirname
	// }

	// if (pyPath === "") {
	// 	let adir = getGlobals().artemisDir;
	// 	let f = findSubfolderByName(adir,"PyRuntime");
	// 	if (f !== null) {
	// 		pyPath = path.resolve(f);
	// 	} else {
	// 		return [];
	// 	}
	// 	//debug(pyPath);
	// }

	// let sbs = path.join(scriptPath, "sbs.zip");
	let g = getGlobals();
	if (g === undefined) {
		g = await initializeGlobals();
	}
	let libFolder = path.join(g.artemisDir,"data","missions");
	if (cache.storyJson.sbslib.length === 0) return ret;
	const sbs_utils = path.join(libFolder,"__lib__",cache.storyJson.sbslib[0]);
	

	// const o: Options = {
	// 	pythonPath: path.join(pyPath,"python.exe"),
	// 	scriptPath: scriptPath,
	// 	args: [sbs_utils, sbs, globals]
	// }
	const o = buildOptions(cache.storyJson, [globals]);
	if (o === null) return [];
	debug("Running py shell");
	try {
	let messages = await PythonShell.run('mastGlobalInfo.py', o);//.then((messages: any)=>{
		for (let m of messages) {
			try {
				// debug(m)
				m = JSON.parse(m);
				// debug(m)
			} catch (e) {
				// debug(e)
			}
			ret.push(m);
		}
		console.log('finished getting mastGlobalInfo');
	//}).catch((e)=>{debug(e);});
	// ret[0] = JSON.parse(ret[0])
	} catch (e) {
		debug(e);
		sendWarning("Python shell error. You may need to rebuild sbs_utils.")
	}
	return ret;
}

export async function getGlobalFunctions(sj:StoryJson): Promise<string[]> {
	let ret: string[] = [];
	// if (pyPath === "") {
	// 	let adir = getGlobals().artemisDir;
	// 	let f = findSubfolderByName(adir,"PyRuntime");
	// 	if (f !== null) {
	// 		pyPath = path.resolve(f);
	// 	} else {
	// 		return [];
	// 	}
	// 	//debug(pyPath);
	// }
	// if (scriptPath === "") {
	// 	scriptPath = __dirname.replace("out","src");
	// 	// scriptPath = __dirname
	// }
	
	// try {
	// 	let sbsPath = path.join(scriptPath, "sbs.zip");
	// 	let libFolder = path.join(getGlobals().artemisDir,"data","missions");
	// 	const sbsLibPath = path.join(libFolder,"__lib__",sbs_utils[0]);
	// 	const o: Options = {
	// 		pythonPath: path.join(pyPath,"python.exe"),
	// 		scriptPath: scriptPath,
	// 		args: [sbsLibPath,sbsPath]
	// 	}
	// 	regularOptions = o;
		const o = buildOptions(sj, []);
		if (o === null) return[];
		debug("Starting python shell")
		await PythonShell.run('mastGlobals.py', o).then((messages: any)=>{
			for (let m of messages) {
				// try {
				// 	debug(JSON.parse(m));
				// } catch (e) {}
				// debug(m);
				ret.push(m);
			}
			console.log('finished');
		}).catch((e)=>{debug(e);});
	// } catch (e) {
	// 	debug(e);
	// }

	return ret;
}

export async function compileMission(mastFile: string, content: string, sj:StoryJson): Promise<string[]> {
	mastFile = fixFileName(mastFile);
	let errors: string[] = [];
	// const o =  buildOptions(sj, [mastFile, content]);
	let g = await initializeGlobals();
	const artDir = g.artemisDir;
	const o = buildOptions(sj, [artDir, mastFile]);
	if (o === null) return [];
	//errors = await runScript(basicOptions);
	errors = await bigFile(o, content);
	return errors;
}

/**
 * Build the {@link Options Options} object for PyShell.
 * @param sbs_utils The sbs_utils file to reference. E.g. `artemis-sbs.sbs_utils.v1.1.0.sbslib`.
 * @returns An {@link Options Options} object. The object's `args` parameter contains the uri for sbs_utils and sbs. Others can be added.
 */
function buildOptions(sj:StoryJson, additionalArgs: any[]): Options | null {
	if (pyPath === "") {
		let adir = getGlobals().artemisDir;
		let f = findSubfolderByName(adir,"PyRuntime");
		if (f !== null) {
			pyPath = path.resolve(f);
		} else {
			return null;
		}
	}

	if (scriptPath === "") {
		scriptPath = __dirname.replace("out","src");
	}

	let libFolder = path.join(getGlobals().artemisDir,"data","missions");
	const sbsLibPath = path.join(libFolder,"__lib__",sj.sbslib[0]);
	// debug(sbsLibPath);

	let sbsPath = path.join(scriptPath, "sbs.zip");
	
	// const basicOptions: Options = {
	// 	pythonPath: path.join(pyPath,"python.exe"),
	// 	scriptPath: scriptPath,
	// 	args: [sbsLibPath, sbsPath, mastFile, content]
	// }

	const o: Options = {
		pythonPath: path.join(pyPath,"python.exe"),
		scriptPath: scriptPath,
		args: [sbsLibPath, sbsPath]
	}
	// debug(additionalArgs)
	o.args = o.args?.concat(additionalArgs);
	// debug(o)
	return o;
}

let shell: PythonShell;
export async function getTokenInfo(sj: StoryJson, token: string) {
	if (shell === undefined || shell === null) {
		let opt = buildOptions(sj,[token]);
		if (opt === null) return;
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

	debug(options)
	let myscript = new PythonShell('mastCompile.py', options);
	debug("python shell started")
	var results: string[] = [];

	// debug(options);
	// debug(content);
	myscript.send(content);
	// let lines = content.split("\n");
	// for (const l of lines) {
	// 	myscript.send(l);
	// }

	myscript.on('message', (message:string) => {

		//debug(message);
		if (message !== "[]") { // if there's errors, parse them
			if (message.startsWith("Debug: ")) {
				debug("Python Debugger:")
				debug("    " + message.replace("Debug: ", ""));
			}
			else if (message.startsWith("Exception: ")) {
				debug("Python Exception:");
				debug("    " + message.replace("Exception: ",""));
			} else {
				let mj = message.replace(/[\[\]]/g, "");
				let errs = mj.split("', '");
				errors = errors.concat(errs);
				// debug(errors);
			}
		}
	});

	// end the input stream and allow the process to exit
	await myscript.end(function (err:Error) {
		compiled = true
		// debug(errors);
		if (err) throw err;
		// console.log('The exit code was: ' + code);
		// console.log('The exit signal was: ' + signal);
		// console.log('finished');
	});

	while (!compiled) {
		await sleep(100);
	}
	// debug(errors);
	debug("Returning from bigFile() python.ts")
	return errors
}
