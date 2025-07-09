"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseIconSet = parseIconSet;
exports.getGridIcons = getGridIcons;
const path = require("path");
const os = require("os");
const fs = require("fs");
const sharp = require("sharp");
const fileFunctions_1 = require("../fileFunctions");
const console_1 = require("console");
const iconTempPath = path.join(os.tmpdir(), "cosmosImages", "iconSets");
async function parseIconSet(setPath, iconSize) {
    let ret = [];
    let outPath = path.join(iconTempPath, path.basename(setPath).replace(".png", ""));
    // if (!fs.existsSync(outPath)){
    // 	fs.mkdirSync(outPath);
    // }
    let resolvedPath = path.resolve(setPath);
    resolvedPath = resolvedPath.replace("\\", path.sep);
    (0, console_1.debug)(setPath);
    (0, console_1.debug)(resolvedPath);
    outPath = path.resolve(outPath);
    (0, console_1.debug)(outPath);
    (0, console_1.debug)(fs.existsSync(resolvedPath));
    (0, console_1.debug)(fs.existsSync(outPath));
    try {
        await splitImageIntoTiles(resolvedPath, iconSize, iconSize, outPath);
        let files = (0, fileFunctions_1.getFilesInDir)(outPath);
        (0, console_1.debug)(files);
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
    }
    catch (e) {
        (0, console_1.debug)(e);
    }
    return ret;
}
function getGridIcons() {
    let items = [];
    let gridFolder = path.join(iconTempPath, "grid-icon-sheet");
    let files = (0, fileFunctions_1.getFilesInDir)(gridFolder);
    for (const f of files) {
        const ii = {
            index: path.basename(f).replace(".png", ""),
            filePath: f
        };
        items.push(ii);
    }
    return items;
}
// Function to split an image into tiles
async function splitImageIntoTiles(imagePath, tileWidth, tileHeight, outputDir) {
    const metadata = await sharp(imagePath).metadata();
    const { width, height } = metadata;
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
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
                (0, console_1.debug)(fs.statSync(tilePath).size);
            }
            if (fs.statSync(tilePath).size === 165) {
                await fs.rmSync(tilePath, { force: true });
            }
            tileIndex++;
        }
    }
}
//# sourceMappingURL=iconSets.js.map