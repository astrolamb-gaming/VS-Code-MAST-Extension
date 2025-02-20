"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileMission = compileMission;
const python_shell_1 = require("python-shell");
const fileFunctions_1 = require("./fileFunctions");
const console_1 = require("console");
const path = require("path");
const cache_1 = require("./cache");
let pyPath = "";
let scriptPath = "";
async function compileMission(mastFile, content, sbs_utils) {
    (0, console_1.debug)(sbs_utils);
    if (sbs_utils[0] !== 'artemis-sbs.sbs_utils.v1.0.1.sbslib') {
        return [];
    }
    mastFile = (0, fileFunctions_1.fixFileName)(mastFile);
    let errors = [];
    let missionPath = (0, fileFunctions_1.getMissionFolder)(mastFile);
    if (pyPath === "") {
        let adir = (0, cache_1.getGlobals)().artemisDir;
        let f = (0, fileFunctions_1.findSubfolderByName)(adir, "PyRuntime");
        if (f !== null) {
            pyPath = path.resolve(f);
        }
        else {
            return [];
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
    const basicOptions = {
        pythonPath: path.join(pyPath, "python.exe"),
        scriptPath: scriptPath,
        args: [sbsLibPath, sbsPath, mastFile, content]
    };
    const o = {
        pythonPath: path.join(pyPath, "python.exe"),
        scriptPath: scriptPath,
        args: [sbsLibPath, sbsPath, mastFile]
    };
    (0, console_1.debug)(o);
    //errors = await runScript(basicOptions);
    errors = await bigFile(o, sbsLibPath, sbsPath, mastFile, content);
    return errors;
}
async function runScript(o) {
    let errors = [];
    // This is probably the simplest option
    try {
        await python_shell_1.PythonShell.run('mastCompile.py', o).then((messages) => {
            for (let m of messages) {
                let mj = m.replace(/[\[\]]/g, "");
                let errs = mj.split("', '");
                errors = errors.concat(errs);
            }
            console.log('finished');
        });
    }
    catch (e) {
        (0, console_1.debug)(e);
    }
    return errors;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function bigFile(options, sbsLibPath, sbsPath, mastFile, content) {
    let errors = [];
    let compiled = false;
    let myscript = new python_shell_1.PythonShell('mastCompile.py', options);
    var results = [];
    myscript.send(content);
    myscript.on('message', (message) => {
        (0, console_1.debug)(message);
        let mj = message.replace(/[\[\]]/g, "");
        let errs = mj.split("', '");
        errors = errors.concat(errs);
        (0, console_1.debug)(errors);
    });
    // end the input stream and allow the process to exit
    await myscript.end(function (err, code, signal) {
        compiled = true;
        if (err)
            throw err;
        console.log('The exit code was: ' + code);
        console.log('The exit signal was: ' + signal);
        console.log('finished');
    });
    while (!compiled) {
        await sleep(100);
    }
    return errors;
}
//# sourceMappingURL=python.js.map