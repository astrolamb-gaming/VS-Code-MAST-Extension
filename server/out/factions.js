"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFaction = buildFaction;
const path = require("path");
const sharp = require("sharp");
const iconSets_1 = require("./resources/iconSets");
function buildFaction(shortName, fileName) {
    sharp(fileName).png().tile({ size: 512 });
    const kralien = path.resolve("G:/Artemis Installs/Cosmos-1-0-4/data/graphics/Krailen_Set.png");
    let outPath = "G:/Test/Krailen_Set";
    (0, iconSets_1.parseIconSet)(kralien, 512);
    return [];
}
//# sourceMappingURL=factions.js.map