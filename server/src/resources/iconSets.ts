import path = require('path');
import os = require('os');
import fs = require('fs');
import sharp = require('sharp');
import { getFilesInDir } from '../fileFunctions';
import { debug } from 'console';
import { integer } from 'vscode-languageserver';
import { IconIndex } from '../artemisGlobals';

const iconTempPath = path.join(os.tmpdir(),"cosmosImages","iconSets");

export async function parseIconSet(setPath:string, iconSize:integer, isFace:boolean) {
	let outPath = path.join(iconTempPath,path.basename(setPath).replace(".png",""));
	let resolvedPath = path.resolve(setPath);
	try {
		await splitImageIntoTiles(resolvedPath, iconSize, iconSize, outPath, !isFace);
	} catch (e) {
		debug(e);
	}
}

export function getGridIcons(): IconIndex[] {
	let items: IconIndex[] = [];
	let gridFolder = path.join(iconTempPath,"grid-icon-sheet");
	let files = getFilesInDir(gridFolder);
	for (const f of files) {
		const ii: IconIndex = {
			index: path.basename(f).replace(".png",""),
			filePath: f
		}
		items.push(ii);
	}
	return items;
}

// Function to split an image into tiles
async function splitImageIntoTiles(imagePath:string, tileWidth:integer, tileHeight:integer, outputDir:string, useIndex=true) {
	const metadata = await sharp(imagePath).metadata();
	if (!metadata) return;
	const { width, height } = metadata;

	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir,{recursive:true});
	}

	let tileIndex = 0;

  	for (let y = 0; y < height; y += tileHeight) {
		for (let x = 0; x < width; x += tileWidth) {
			let tilePath = outputDir + path.sep; //path.join(outputDir,`tile_${tileIndex}`);
			if (useIndex) {
				tilePath = tilePath + tileIndex + ".png";
			} else {
				tilePath = tilePath + x + "_" + y + ".png";
			}
			await sharp(imagePath)
				.extract({ left: x, top: y, width: tileWidth, height: tileHeight })
				.toFile(tilePath);
			// If the file is empty (no icon actually inside it), then delete it.
			// The number 165 applies to tiles of size 128x128.
			// TODO: Confirm if this number applies to other sizes.
			// if (tileHeight !== 128) {
			// 	debug(fs.statSync(tilePath).size);
			// }
			if (fs.statSync(tilePath).size === 165) {
				await fs.rmSync(tilePath, {force:true});
			}
			tileIndex++;
		}
  	}
}

