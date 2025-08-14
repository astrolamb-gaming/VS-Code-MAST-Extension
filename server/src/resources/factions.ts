import { debug } from 'console';
import path = require('path');
import fs = require('fs');
import sharp = require('sharp');
import { getFilesInDir } from '../fileFunctions';
import { parseIconSet } from './iconSets';

export interface Faction {
	short: string;
	fileName: string;
}

export function buildFaction(shortName:string,fileName:string) {
	sharp(fileName).png().tile({size:512})


	const kralien = path.resolve("G:/Artemis Installs/Cosmos-1-0-4/data/graphics/Krailen_Set.png");
	let outPath = "G:/Test/Krailen_Set"
	parseIconSet(kralien,512,true);
	return [];
}