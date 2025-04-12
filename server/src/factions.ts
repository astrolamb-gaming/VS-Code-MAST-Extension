import { debug } from 'console';
import path = require('path');
import fs = require('fs');
import sharp = require('sharp');
import { getFilesInDir } from './fileFunctions';

export interface Faction {
	short: string;
	fileName: string;
}

export function buildFaction(shortName:string,fileName:string) {
	sharp(fileName).png().tile({size:512})


	const kralien = path.resolve("G:/Artemis Installs/Cosmos-1-0-4/data/graphics/Krailen_Set.png");
	let outPath = "G:/Test/Krailen_Set"
	sharp(kralien).png().tile({size:512}).toFile(outPath).then((value)=>{
		// sharp(outPath)
		outPath += "_files"
		outPath = path.join(outPath,"12")
		const files = getFilesInDir(outPath,false);
		debug(outPath)
		const sizes: number[] = []
		for (const f of files) {
			const size = fs.statSync(f).size;
			debug(f);
			debug(size);
		}
		
	});
	

	return [];
}