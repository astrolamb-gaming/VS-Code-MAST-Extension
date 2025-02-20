import { Options, PythonShell } from 'python-shell';
import { findSubfolderByName, fixFileName, getArtemisDirFromChild, getMissionFolder, getParentFolder } from './fileFunctions';
import { debug } from 'console';
import path = require('path');
import * as fs from 'fs';
import { getCache, getGlobals } from './cache';

let pyPath = "";
let scriptPath = "";

export async function compileMission(mastFile: string, content: string, sbs_utils: string[]): Promise<string[]> {
	//debug(sbs_utils)
	if (sbs_utils[0] !== 'artemis-sbs.sbs_utils.v1.0.1.sbslib') {
		return [];
	}
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
	//debug(o);
	
	//errors = await runScript(basicOptions);
	errors = await bigFile(o, content);
	return errors;
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function bigFile(options: Options, content: string): Promise<string[]> {
	let errors: string[] = [];
	let compiled = false;

	let myscript = new PythonShell('mastCompile.py', options);
	
	var results: string[] = [];

	myscript.send(content);

	myscript.on('message', (message) => {

		//debug(message);
		if (message !== "[]") { // if there's errors, parse them
			let mj = message.replace(/[\[\]]/g, "");
			let errs = mj.split("', '");
			errors = errors.concat(errs);
			debug(errors);
		}
	});

	// end the input stream and allow the process to exit
	await myscript.end(function (err,code,signal) {
		compiled = true
		if (err) throw err;
		// console.log('The exit code was: ' + code);
		// console.log('The exit signal was: ' + signal);
		// console.log('finished');
	});

	while (!compiled) {
		await sleep(100);
	}


	return errors
}