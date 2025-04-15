"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = void 0;
exports.getGlobalFunctions = getGlobalFunctions;
exports.compileMission = compileMission;
const python_shell_1 = require("python-shell");
const fileFunctions_1 = require("./fileFunctions");
const console_1 = require("console");
const path = require("path");
const globals_1 = require("./globals");
let pyPath = "";
let scriptPath = "";
let regularOptions;
async function getGlobalFunctions(sbs_utils) {
    let ret = [];
    if (pyPath === "") {
        let adir = (0, globals_1.getGlobals)().artemisDir;
        let f = (0, fileFunctions_1.findSubfolderByName)(adir, "PyRuntime");
        if (f !== null) {
            pyPath = path.resolve(f);
        }
        else {
            return [];
        }
        //debug(pyPath);
    }
    if (scriptPath === "") {
        scriptPath = __dirname.replace("out", "src");
    }
    try {
        let sbsPath = path.join(scriptPath, "sbs.zip");
        let libFolder = path.join((0, globals_1.getGlobals)().artemisDir, "data", "missions");
        //const sbsLibPath = "D:\\Cosmos Dev\\Cosmos-1-0-1\\data\\missions\\sbs_utils"//
        const sbsLibPath = path.join(libFolder, "__lib__", sbs_utils[0]);
        const o = {
            pythonPath: path.join(pyPath, "python.exe"),
            scriptPath: scriptPath,
            args: [sbsLibPath, sbsPath]
        };
        regularOptions = o;
        (0, console_1.debug)("Starting python shell");
        await python_shell_1.PythonShell.run('mastGlobals.py', o).then((messages) => {
            for (let m of messages) {
                //debug(m);
                ret.push(m);
            }
            console.log('finished');
        }).catch((e) => { (0, console_1.debug)(e); });
    }
    catch (e) {
        (0, console_1.debug)(e);
    }
    return ret;
}
async function compileMission(mastFile, content, sbs_utils) {
    // debug(sbs_utils)
    // if (sbs_utils[0] !== 'artemis-sbs.sbs_utils.v1.0.1.sbslib') {
    // 	return [];
    // }
    mastFile = (0, fileFunctions_1.fixFileName)(mastFile);
    let errors = [];
    let missionPath = (0, fileFunctions_1.getMissionFolder)(mastFile);
    if (pyPath === "") {
        let adir = (0, globals_1.getGlobals)().artemisDir;
        let f = (0, fileFunctions_1.findSubfolderByName)(adir, "PyRuntime");
        if (f !== null) {
            pyPath = path.resolve(f);
        }
        else {
            return [];
        }
        //debug(pyPath);
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
    mastFile = path.basename(mastFile);
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
    regularOptions = o;
    //debug(o);
    //errors = await runScript(basicOptions);
    errors = await bigFile(o, content);
    errors = [];
    return errors;
}
let shell;
async function getTokenInfo(token) {
    if (shell === undefined || shell === null) {
        shell = new python_shell_1.PythonShell('mastCompile.py', regularOptions);
    }
    shell.send(token);
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
exports.sleep = sleep;
async function bigFile(options, content) {
    let errors = [];
    let compiled = false;
    let myscript = new python_shell_1.PythonShell('mastCompile.py', options);
    var results = [];
    myscript.send(content);
    myscript.on('message', (message) => {
        //debug(message);
        if (message !== "[]") { // if there's errors, parse them
            let mj = message.replace(/[\[\]]/g, "");
            let errs = mj.split("', '");
            errors = errors.concat(errs);
            // debug(errors);
        }
    });
    // end the input stream and allow the process to exit
    await myscript.end(function (err) {
        compiled = true;
        (0, console_1.debug)(errors);
        if (err)
            throw err;
        // console.log('The exit code was: ' + code);
        // console.log('The exit signal was: ' + signal);
        // console.log('finished');
    });
    while (!compiled) {
        await (0, exports.sleep)(100);
    }
    return errors;
}
//# sourceMappingURL=python.js.map