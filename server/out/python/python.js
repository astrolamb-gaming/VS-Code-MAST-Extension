"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = void 0;
exports.initializePython = initializePython;
exports.getSpecificGlobals = getSpecificGlobals;
exports.getGlobalFunctions = getGlobalFunctions;
exports.compileMission = compileMission;
exports.getTokenInfo = getTokenInfo;
const python_shell_1 = require("python-shell");
const fileFunctions_1 = require("../fileFunctions");
const console_1 = require("console");
const path = require("path");
const cache_1 = require("../cache");
const globals_1 = require("../globals");
const server_1 = require("../server");
let pyPath = "";
let scriptPath = "";
let regularOptions;
function initializePython(uri) {
    return;
    const cache = (0, cache_1.getCache)(uri);
    let pyGlobals = [];
    (0, console_1.debug)("Starting initializePython()");
    try {
        // compileMission(uri)
        getGlobalFunctions(cache.storyJson).then((data) => {
            try {
                pyGlobals = JSON.parse(data[0]);
            }
            catch (e) {
                pyGlobals = data;
            }
            (0, console_1.debug)(pyGlobals);
            let g = cache.getMethods();
            let keys = [...new Map(g.map(v => [v.name, v.name])).values()];
            (0, console_1.debug)(keys);
            let notFound = [];
            for (const g of pyGlobals) {
                if (keys.includes(g.name)) {
                    continue;
                }
                else {
                    notFound.push(g);
                }
            }
            (0, console_1.debug)(notFound);
        });
        // getTokenInfo("math");
        /*
        let globalFuncs = getGlobalFunctions(cache.storyJson.sbslib).then((funcs)=>{
            const classes = Object.fromEntries(cache.missionClasses.map(obj => [obj.name, obj]));
            // const functions = Object.fromEntries(cache.missionDefaultFunctions.map(obj => [obj.name, obj]));
            // debug(funcs);
            for (const f of funcs) {
                // debug(f);
                try {
                    // const json = JSON.parse(f);
                    // debug(json);
                    // debug(json['name']);
                    // let found = false;
                    // const c = classes[json['name']];
                    // if (c === undefined) debug(json['name'] + " is undefined");
                    // // if (found) continue;
                    // const df = functions[json['name']];
                    // if (df === undefined) debug(json['name'] + " is undefined");
                    // if (found) {
                    // 	debug(json['name'] + " is found!");
                    // } else {
                    // 	debug("Checking for... " + json['name']);
                    // 	// getTokenInfo(json['name'])
                    // }
                } catch (ex) {
                    debug(f);
                    debug(ex);
                }
            }
        });
        */
    }
    catch (e) {
        (0, console_1.debug)(e);
    }
}
async function getSpecificGlobals(cache, globals) {
    let ret = [];
    // const cache = getCache(mission);
    globals = JSON.stringify(globals);
    // if (scriptPath === "") {
    // 	scriptPath = __dirname.replace("out","src");
    // 	// scriptPath = __dirname
    // }
    // if (pyPath === "") {
    // 	let adir = getGlobals().artemisDir;
    // 	let f = findSubfolderByName(adir,"PyRuntime");
    // 	if (f !== null) {
    // 		pyPath = path.resolve(f);
    // 	} else {
    // 		return [];
    // 	}
    // 	//debug(pyPath);
    // }
    // let sbs = path.join(scriptPath, "sbs.zip");
    let g = (0, globals_1.getGlobals)();
    if (g === undefined) {
        g = await (0, globals_1.initializeGlobals)();
    }
    let libFolder = path.join(g.artemisDir, "data", "missions");
    if (cache.storyJson.sbslib.length === 0)
        return ret;
    const sbs_utils = path.join(libFolder, "__lib__", cache.storyJson.sbslib[0]);
    // const o: Options = {
    // 	pythonPath: path.join(pyPath,"python.exe"),
    // 	scriptPath: scriptPath,
    // 	args: [sbs_utils, sbs, globals]
    // }
    const o = buildOptions(cache.storyJson, [globals]);
    if (o === null)
        return [];
    (0, console_1.debug)("Running py shell");
    try {
        let messages = await python_shell_1.PythonShell.run('mastGlobalInfo.py', o); //.then((messages: any)=>{
        for (let m of messages) {
            try {
                // debug(m)
                m = JSON.parse(m);
                // debug(m)
            }
            catch (e) {
                // debug(e)
            }
            ret.push(m);
        }
        console.log('finished getting mastGlobalInfo');
        //}).catch((e)=>{debug(e);});
        // ret[0] = JSON.parse(ret[0])
    }
    catch (e) {
        (0, console_1.debug)(e);
        (0, server_1.sendWarning)("Python shell error. You may need to rebuild sbs_utils.");
    }
    return ret;
}
async function getGlobalFunctions(sj) {
    let ret = [];
    // if (pyPath === "") {
    // 	let adir = getGlobals().artemisDir;
    // 	let f = findSubfolderByName(adir,"PyRuntime");
    // 	if (f !== null) {
    // 		pyPath = path.resolve(f);
    // 	} else {
    // 		return [];
    // 	}
    // 	//debug(pyPath);
    // }
    // if (scriptPath === "") {
    // 	scriptPath = __dirname.replace("out","src");
    // 	// scriptPath = __dirname
    // }
    // try {
    // 	let sbsPath = path.join(scriptPath, "sbs.zip");
    // 	let libFolder = path.join(getGlobals().artemisDir,"data","missions");
    // 	const sbsLibPath = path.join(libFolder,"__lib__",sbs_utils[0]);
    // 	const o: Options = {
    // 		pythonPath: path.join(pyPath,"python.exe"),
    // 		scriptPath: scriptPath,
    // 		args: [sbsLibPath,sbsPath]
    // 	}
    // 	regularOptions = o;
    const o = buildOptions(sj, []);
    if (o === null)
        return [];
    (0, console_1.debug)("Starting python shell");
    await python_shell_1.PythonShell.run('mastGlobals.py', o).then((messages) => {
        for (let m of messages) {
            // try {
            // 	debug(JSON.parse(m));
            // } catch (e) {}
            // debug(m);
            ret.push(m);
        }
        console.log('finished');
    }).catch((e) => { (0, console_1.debug)(e); });
    // } catch (e) {
    // 	debug(e);
    // }
    return ret;
}
async function compileMission(mastFile, content, sj) {
    mastFile = (0, fileFunctions_1.fixFileName)(mastFile);
    let errors = [];
    // const o =  buildOptions(sj, [mastFile, content]);
    let g = await (0, globals_1.initializeGlobals)();
    const artDir = g.artemisDir;
    const o = buildOptions(sj, [artDir, mastFile]);
    if (o === null)
        return [];
    //errors = await runScript(basicOptions);
    errors = await bigFile(o, content);
    return errors;
}
/**
 * Build the {@link Options Options} object for PyShell.
 * @param sbs_utils The sbs_utils file to reference. E.g. `artemis-sbs.sbs_utils.v1.1.0.sbslib`.
 * @returns An {@link Options Options} object. The object's `args` parameter contains the uri for sbs_utils and sbs. Others can be added.
 */
function buildOptions(sj, additionalArgs) {
    if (pyPath === "") {
        let adir = (0, globals_1.getGlobals)().artemisDir;
        let f = (0, fileFunctions_1.findSubfolderByName)(adir, "PyRuntime");
        if (f !== null) {
            pyPath = path.resolve(f);
        }
        else {
            return null;
        }
    }
    if (scriptPath === "") {
        scriptPath = __dirname.replace("out", "src");
    }
    let libFolder = path.join((0, globals_1.getGlobals)().artemisDir, "data", "missions");
    const sbsLibPath = path.join(libFolder, "__lib__", sj.sbslib[0]);
    // debug(sbsLibPath);
    let sbsPath = path.join(scriptPath, "sbs.zip");
    // const basicOptions: Options = {
    // 	pythonPath: path.join(pyPath,"python.exe"),
    // 	scriptPath: scriptPath,
    // 	args: [sbsLibPath, sbsPath, mastFile, content]
    // }
    const o = {
        pythonPath: path.join(pyPath, "python.exe"),
        scriptPath: scriptPath,
        args: [sbsLibPath, sbsPath]
    };
    // debug(additionalArgs)
    o.args = o.args?.concat(additionalArgs);
    // debug(o)
    return o;
}
let shell;
async function getTokenInfo(sj, token) {
    if (shell === undefined || shell === null) {
        let opt = buildOptions(sj, [token]);
        if (opt === null)
            return;
        if (!opt.args) {
            opt.args = [""];
        }
        opt.args[2] = token;
        (0, console_1.debug)(token);
        (0, console_1.debug)(opt);
        shell = new python_shell_1.PythonShell('mastFunctionInfo.py', opt);
        await python_shell_1.PythonShell.run('mastFunctionInfo.py', opt).then((messages) => {
            for (let m of messages) {
                try {
                    (0, console_1.debug)(JSON.parse(m));
                }
                catch (e) { }
                (0, console_1.debug)(m);
                // ret.push(m);
            }
            console.log('finished');
        }).catch((e) => { (0, console_1.debug)(e); });
        shell.on('message', (parsedChunk) => {
            (0, console_1.debug)(parsedChunk);
            shell.removeAllListeners();
        });
        shell.send(token);
    }
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
    (0, console_1.debug)(options);
    let myscript = new python_shell_1.PythonShell('mastCompile.py', options);
    (0, console_1.debug)("python shell started");
    var results = [];
    // debug(options);
    // debug(content);
    myscript.send(content);
    // let lines = content.split("\n");
    // for (const l of lines) {
    // 	myscript.send(l);
    // }
    myscript.on('message', (message) => {
        //debug(message);
        if (message !== "[]") { // if there's errors, parse them
            if (message.startsWith("Debug: ")) {
                (0, console_1.debug)("Python Debugger:");
                (0, console_1.debug)("    " + message.replace("Debug: ", ""));
            }
            else if (message.startsWith("Exception: ")) {
                (0, console_1.debug)("Python Exception:");
                (0, console_1.debug)("    " + message.replace("Exception: ", ""));
            }
            else {
                let mj = message.replace(/[\[\]]/g, "");
                let errs = mj.split("', '");
                errors = errors.concat(errs);
                // debug(errors);
            }
        }
    });
    // end the input stream and allow the process to exit
    await myscript.end(function (err) {
        compiled = true;
        // debug(errors);
        if (err)
            throw err;
        // console.log('The exit code was: ' + code);
        // console.log('The exit signal was: ' + signal);
        // console.log('finished');
    });
    while (!compiled) {
        await (0, exports.sleep)(100);
    }
    // debug(errors);
    (0, console_1.debug)("Returning from bigFile() python.ts");
    return errors;
}
//# sourceMappingURL=python.js.map