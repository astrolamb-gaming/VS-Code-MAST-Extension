import { CompletionItem } from 'vscode-languageserver';
import { getGlobals } from '../globals';
import { getFilesInDir } from '../fileFunctions';
import path = require('path');
import { debug } from 'console';

export function getMusicFiles(missionDir:string): CompletionItem[] {
	let ret: CompletionItem[] = [];
	const globals = getGlobals();
	const files = getFilesInDir(path.join(globals.artemisDir,"data","audio"),true);
	for (const file of files) {
		const relDir = path.relative(missionDir,file);
		debug(relDir);
	}

	return ret;
}