import { Options, PythonShell } from 'python-shell';
import { findSubfolderByName, fixFileName, getMissionFolder, getParentFolder } from './fileFunctions';
import { debug } from 'console';
import path = require('path');
import * as fs from 'fs';

let pyPath = "";
let scriptPath = "";

export async function compileMission(mastFile: string, content: string, sbs_utils: string[]): Promise<string[]> {
	mastFile = fixFileName(mastFile);
	let errors: string[] = [];
	let missionPath: string = getMissionFolder(mastFile);
	if (pyPath === "") {
		let f = findSubfolderByName("../../../../","PyRuntime");
		if (f !== null) {
			pyPath = path.resolve(f);
		}
		debug(pyPath);
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
	
	// debug(missionPath);
	// debug(sbsLibPath);
	//debug(parentPath)

	const o: Options = {
		pythonPath: path.join(pyPath,"python.exe"),
		scriptPath: scriptPath,
		args: [sbsLibPath, sbsPath, mastFile, content]
	}
	
	errors = await runScript(o);
	// for (const e of errors) {
	// 	if (e.includes("No module named \"sbs\"")) {
	// 		o.args = [sbsLibPath, sbsPath, mastFile, content];
	// 		errors = await runScript(o);
			
	// 		break;
	// 	}
	// }
	

	return errors;
}

async function runScript(o: Options): Promise<string[]> {
	const errors: string[] = [];
	// This is probably the simplest option
	try {
		await PythonShell.run('mastCompile.py', o).then(messages=>{
			for (let m of messages) {
				//debug(m);
				//errors.push(m);
				m = m.replace(/\'/g, "\"");
				try {
					m = JSON.parse(m);
					errors.push(m);
					debug(m);
				} catch (e) {
					//debug(e);
					errors.push(m);
					debug(m);
				}
			}
			console.log('finished');
		});
	} catch (e) {
		debug(e);
	}

	return errors;
}