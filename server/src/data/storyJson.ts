import { debug } from 'console';
import path = require('path');
import { integer } from 'vscode-languageserver';
import { getMissionFolder } from '../fileFunctions';
import { getGlobals } from '../globals';
import { connection, notifyClient, sendToClient, showProgressBar } from '../server';
import fs = require('fs');

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
		showProgressBar(true);
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
		let version = 0;
		let latestFile = "";
		for (const file of getGlobals().libModules) {
			if (file.includes(name)) {
				const v = this.getVersionPriority(file);
				if (v > version) {
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
		if (path.dirname(this.uri).endsWith("sbs_utils")) return;
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

		const err = path.basename(getMissionFolder(this.uri)) + ": story.json contains references to files that do not exist";
		const warn = path.basename(getMissionFolder(this.uri)) + ": Newer versions are available for story.json references";
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