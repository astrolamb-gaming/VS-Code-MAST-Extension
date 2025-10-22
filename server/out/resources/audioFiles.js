"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMusicFiles = getMusicFiles;
const artemisGlobals_1 = require("../artemisGlobals");
const fileFunctions_1 = require("../fileFunctions");
const path = require("path");
const console_1 = require("console");
function getMusicFiles(missionDir) {
    let ret = [];
    const globals = (0, artemisGlobals_1.getArtemisGlobals)();
    const files = (0, fileFunctions_1.getFilesInDir)(path.join(globals.artemisDir, "data", "audio"), true);
    for (const file of files) {
        const relDir = path.relative(missionDir, file);
        (0, console_1.debug)(relDir);
    }
    return ret;
}
//# sourceMappingURL=audioFiles.js.map