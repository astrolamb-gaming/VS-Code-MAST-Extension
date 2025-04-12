"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFaction = buildFaction;
const console_1 = require("console");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const fileFunctions_1 = require("./fileFunctions");
function buildFaction(shortName, fileName) {
    sharp(fileName).png().tile({ size: 512 });
    const kralien = path.resolve("G:/Artemis Installs/Cosmos-1-0-4/data/graphics/Krailen_Set.png");
    let outPath = "G:/Test/Krailen_Set";
    sharp(kralien).png().tile({ size: 512 }).toFile(outPath).then((value) => {
        // sharp(outPath)
        outPath += "_files";
        outPath = path.join(outPath, "12");
        const files = (0, fileFunctions_1.getFilesInDir)(outPath, false);
        (0, console_1.debug)(outPath);
        const sizes = [];
        for (const f of files) {
            const size = fs.statSync(f).size;
            (0, console_1.debug)(f);
            (0, console_1.debug)(size);
        }
    });
    return [];
}
//# sourceMappingURL=factions.js.map