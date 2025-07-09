import path = require('path');
import os = require('os');
import fs = require('fs');
import sharp = require('sharp');
import { getFilesInDir } from '../fileFunctions';
import { debug } from 'console';
import { CompletionItem, CompletionItemKind, integer, MarkupContent } from 'vscode-languageserver';
import { IconIndex } from '../globals';

const iconTempPath = path.join(os.tmpdir(),"cosmosImages","iconSets");

export async function parseIconSet(setPath:string, iconSize:integer): Promise<CompletionItem[]> {
	let ret: CompletionItem[] = [];
	let outPath = path.join(iconTempPath,path.basename(setPath).replace(".png",""));
	// if (!fs.existsSync(outPath)){
	// 	fs.mkdirSync(outPath);
	// }
	let resolvedPath = path.resolve(setPath);
	resolvedPath = resolvedPath.replace("\\",path.sep);
	
	debug(setPath);
	debug(resolvedPath);
	outPath = path.resolve(outPath);
	debug(outPath);
	debug(fs.existsSync(resolvedPath));
	debug(fs.existsSync(outPath));
	try {
		await splitImageIntoTiles(resolvedPath, iconSize, iconSize, outPath);
		let files = getFilesInDir(outPath);
		debug(files);
		
		// sharp(resolvedPath).png().tile({size:iconSize}).toFile(outPath).then((value)=>{
		// 	debug(value);
		// 	// // sharp(outPath)
		// 	// outPath += "_files"
		// 	// outPath = path.join(outPath,"12")
		// 	// const files = getFilesInDir(outPath,false);
		// 	// debug(outPath)
		// 	// const sizes: number[] = []
		// 	// for (const f of files) {
		// 	// 	const size = fs.statSync(f).size;
		// 	// 	debug(f);
		// 	// 	debug(size);
		// 	// }
			
		// }).catch(error=>{
		// 	debug(error);
		// });
	} catch (e) {
		debug(e);
	}
	return ret;
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
async function splitImageIntoTiles(imagePath:string, tileWidth:integer, tileHeight:integer, outputDir:string) {
	const metadata = await sharp(imagePath).metadata();
	const { width, height } = metadata;

	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir,{recursive:true});
	}

	let tileIndex = 0;

  	for (let y = 0; y < height; y += tileHeight) {
		for (let x = 0; x < width; x += tileWidth) {
			let tilePath = outputDir + path.sep + tileIndex + ".png"; //path.join(outputDir,`tile_${tileIndex}`);
			await sharp(imagePath)
				.extract({ left: x, top: y, width: tileWidth, height: tileHeight })
				.toFile(tilePath);
			// If the file is empty (no icon actually inside it), then delete it.
			// The number 165 applies to tiles of size 128x128.
			// TODO: Confirm if this number applies to other sizes.
			if (tileHeight !== 128) {
				debug(fs.statSync(tilePath).size);
			}
			if (fs.statSync(tilePath).size === 165) {
				await fs.rmSync(tilePath, {force:true});
			}
			tileIndex++;
		}
  	}
}

