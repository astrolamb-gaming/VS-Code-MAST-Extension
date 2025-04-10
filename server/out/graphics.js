"use strict";
findArtFiles();
CompletionItem[];
{
    let ret = [];
    const files = getFilesInDir(path.join(this.artemisDir, "data", "graphics"));
    // let relPath = path.join(path.relative("./",getGlobals().artemisDir),"data","graphics","ships");
    // if (relPath !== "") {
    // 	// fs.opendir(relPath,(err,dir)=>{
    // 	// 	let res: fs.Dirent | null;
    // 	// 	while (res = dir.readSync()) {
    // 	// 		debug(res);
    // 	// 	}
    // 	// })
    // }
    // Build Temp folder
    const tempPath = path.join(os.tmpdir(), "cosmosImages");
    if (!fs.existsSync(tempPath)) {
        //fs.mkdtemp(path.join(os.tmpdir(), 'foo-'), (err, folder) => {
        fs.mkdirSync(tempPath);
    }
    for (const file of files) {
        //fs.mkdtemp(path.join(os.tmpdir(), 'foo-'), (err, folder) => {
        if (file.endsWith(".png")) {
            const fileBase = file.replace(".png", "");
            const docs = {
                kind: "markdown",
                value: ""
            };
            let val = "";
            // let relFile = path.join(relPath,path.basename(file)).replace(/\\/g,"/");
            let relFile = path.relative("./", file);
            debug(relFile);
            relFile = relFile.replace(/\\/g, "/");
            let absFile = file.replace(":", "%3A").replace(/\\/g, "/");
            // This works, but can't scale the images
            val = "![" + path.basename(file) + "](file:///" + absFile + ")";
            // Also works, but doesn't scale
            val = "![" + path.basename(file) + "](/" + absFile + ")";
            // Doesn't work
            // val = "![" + path.basename(file) + "](" + relFile.replace(/\\/g,"/") + ")"
            // Doesn't work
            // val = "<img src='file:///" + absFile + "'/>"
            // Still doesn't work
            // val = "<img src='/" + absFile + "'/><img src='/" + absFile + "'/>"
            // Doesn't work
            // val = "<img src='" + relFile.replace(/\\/g,"/") + "'/>"
            val = '<img src="' + relFile + '" height=256 width=256/>';
            // Still nope
            // val = '[<img src="' + absFile + '" width="250"/>](' + absFile + ')';
            docs.value = val;
            debug(val);
            const c = {
                label: path.basename(file).replace(".png", ""),
                kind: CompletionItemKind.File,
                documentation: docs,
                insertText: path.basename(file)
            };
            ret.push(c);
        }
    }
    return ret;
}
//# sourceMappingURL=graphics.js.map