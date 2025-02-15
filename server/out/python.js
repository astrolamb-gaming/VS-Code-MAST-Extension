"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileMission = compileMission;
const python_shell_1 = require("python-shell");
const fileFunctions_1 = require("./fileFunctions");
const console_1 = require("console");
const path = require("path");
let pyPath = "";
let scriptPath = "";
async function compileMission(mastFile, content, sbs_utils) {
    mastFile = (0, fileFunctions_1.fixFileName)(mastFile);
    let errors = [];
    let missionPath = (0, fileFunctions_1.getMissionFolder)(mastFile);
    if (pyPath === "") {
        let f = (0, fileFunctions_1.findSubfolderByName)("../../../../", "PyRuntime");
        if (f !== null) {
            pyPath = path.resolve(f);
        }
        (0, console_1.debug)(pyPath);
    }
    if (scriptPath === "") {
        scriptPath = __dirname.replace("out", "src");
    }
    const libFolder = (0, fileFunctions_1.getParentFolder)(missionPath);
    // Get the possible sbslib files to use - this is sbs_utils
    let sbs_utils_file = sbs_utils[0];
    // This is not a release version - I want my code to be as backwards-compatible as possible
    // At least I should be able to support errors for the current released version
    //sbs_utils_file = "artemis-sbs.sbs_utils.v1.0.2.sbslib";
    const sbsLibPath = path.join(libFolder, "__lib__", sbs_utils_file);
    // Get sbs, if necessary
    let sbsPath = path.join(scriptPath, "sbs.zip");
    //sbsPath = path.join(libFolder, "mock");
    // debug(missionPath);
    // debug(sbsLibPath);
    //debug(parentPath)
    const o = {
        pythonPath: path.join(pyPath, "python.exe"),
        scriptPath: scriptPath,
        args: [sbsLibPath, sbsPath, mastFile, content]
    };
    errors = await runScript(o);
    // for (const e of errors) {
    // 	if (e.includes("No module named \"sbs\"")) {
    // 		o.args = [sbsLibPath, sbsPath, mastFile, content];
    // 		errors = await runScript(o);
    // 		break;
    // 	}
    // }
    return errors;
}
async function runScript(o) {
    const errors = [];
    // This is probably the simplest option
    try {
        await python_shell_1.PythonShell.run('mastCompile.py', o).then(messages => {
            for (let m of messages) {
                //debug(m);
                //errors.push(m);
                m = m.replace(/\'/g, "\"");
                try {
                    m = JSON.parse(m);
                    errors.push(m);
                    (0, console_1.debug)(m);
                }
                catch (e) {
                    //debug(e);
                    errors.push(m);
                    (0, console_1.debug)(m);
                }
            }
            console.log('finished');
        });
    }
    catch (e) {
        (0, console_1.debug)(e);
    }
    return errors;
}
//# sourceMappingURL=python.js.map