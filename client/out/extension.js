"use strict";
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = void 0;
exports.activate = activate;
exports.deactivate = deactivate;
const path = require("path");
const vscode_1 = require("vscode");
const vscode = require("vscode");
const fs = require("fs");
const node_1 = require("vscode-languageclient/node");
let mainProgress;
let myStatusBarItem;
let statusBarItemText = "";
let statusBarItemCount = 0;
let timer;
let client;
let outputChannel;
outputChannel = vscode_1.window.createOutputChannel("MAST Client Output", { log: true });
debug("Output channel created");
(function () {
    debug("Startings");
    var childProcess = require("child_process");
    var oldSpawn = childProcess.spawn;
    function mySpawn() {
        if (!arguments[0].includes("git.exe")) {
            console.log('spawn called');
            console.log(arguments);
        }
        var result = oldSpawn.apply(this, arguments);
        return result;
    }
    childProcess.spawn = mySpawn;
})();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
exports.sleep = sleep;
function activate(context) {
    debug("Activating extension.");
    // The server is implemented in node
    const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions = {
        run: { module: serverModule, transport: node_1.TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: node_1.TransportKind.ipc,
        }
    };
    // Options to control the language client
    const clientOptions = {
        // Register the server for plain text documents
        documentSelector: [{ scheme: 'file', language: 'mast' }, { scheme: 'file', language: 'json' }],
        synchronize: {
            // Notify the server about file changes to '.clientrc files contained in the workspace
            fileEvents: [vscode_1.workspace.createFileSystemWatcher('**/.mast'), vscode_1.workspace.createFileSystemWatcher('**/.json')]
        },
        middleware: {
            executeCommand: async (command, args, next) => {
                const selected = await vscode_1.window.showQuickPick(['Visual Studio', 'Visual Studio Code']);
                if (selected === undefined) {
                    return next(command, args);
                }
                args = args.slice(0);
                args.push(selected);
                return next(command, args);
            }
        }
    };
    // const disposable = vscode.languages.registerFoldingRangeProvider('mast', {
    //     provideFoldingRanges(document, context, token) {
    //         //console.log('folding range invoked'); // comes here on every character edit
    //         let sectionStart = 0, FR = [], re = /^\s*?={2,}/;  // regex to detect start of region
    // 		// TODO: Recursive regex: https://github.com/slevithan/regex-recursion/  ?
    // 		getIndentations(document);
    // 		// TODO: Comment folding regex:
    // 		// Actually might want to use comments.ts for this
    // 		const startBlockComment = /^\s*?\/\*/g;
    // 		const endBlockComment = /^.*?\*\//g;
    // 		let foldSections: RegExp[] = [
    // 			/^\s*?if/g,
    // 			/^\s*?for/g,
    // 			/^\s*?elif/g,
    // 			/^\s*?else/g,
    // 			/^\s*?case/g,
    // 			/^\s*?-{2,}/g,
    // 			/^\s*?on[ \t]+(change[ \t]+)?/g,
    // 		];
    // 		foldSections.push(re);
    // 		re = /^\s*?(if|for|elif|else|case|match|-{2,}|={2,})|\/{2,}/g;
    //         for (let i = 0; i < document.lineCount; i++) {
    //             if (re.test(document.lineAt(i).text)) {
    //                 if (sectionStart > 0) {
    //                     FR.push(new vscode.FoldingRange(sectionStart, i - 1, vscode.FoldingRangeKind.Region));
    //                 }
    //                 sectionStart = i;
    //             }
    //         }
    //         if (sectionStart > 0) { FR.push(new vscode.FoldingRange(sectionStart, document.lineCount - 1, vscode.FoldingRangeKind.Region)); }
    //         return FR;
    //     }
    // });
    // context.subscriptions.push(vscode.languages.registerCompletionItemProvider(GO_MODE, new GoCompletionItemProvider(), ".", "\""));
    // Create the language client and start the client.
    client = new node_1.LanguageClient('MAST-Language-Server', 'MAST Language Server', serverOptions, clientOptions);
    // create a new status bar item that we can now manage
    myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 200);
    // myStatusBarItem.command = myCommandId;
    context.subscriptions.push(myStatusBarItem);
    //window.showQuickPick([{label:"One"},{label:"Two"}]);
    //let ib = window.createInputBox();
    // ib.prompt = "Choose modules"
    // ib.show();
    const prog1 = client.onProgress(new node_1.ProgressType, "Loadding data...", (increment) => {
        debug(increment);
    });
    context.subscriptions.push(prog1);
    let statusBarStatus = true;
    const prog = client.onNotification('custom/progressNotif', (show) => {
        // debug("Progressing....  " + increment);
        // window.withProgress({
        // 	location: vscode.ProgressLocation.Notification,
        // 	title: "Loading data...",
        // 	cancellable: true
        // },(progress, token) => {
        // 	mainProgress = progress;
        // 	token.onCancellationRequested(() => {
        // 		console.log("User canceled the long running operation");
        // 	});
        // 	progress.report({message: "Loading data...", increment: increment})
        // 	const p = new Promise<void>(resolve => {
        // 		setTimeout(() => {
        // 			resolve();
        // 		}, 5000);
        // 	});
        // 	return p;
        // })
        updateStatusBarItem(show);
    });
    context.subscriptions.push(prog);
    // updateStatusBarItem(true);
    const storyJsonListener = client.onNotification('custom/storyJson', (message) => {
        debug("Story Json Notification recieved");
        //window.showQuickPick([{label:"One"},{label:"Two"}]);
        debug(message);
        // const storyJson = JSON.parse(message);
        // debug(storyJson);
        // // Next we'll want to show the notification for the user...
        //showJsonNotif(message);
    });
    // This just sends a debug message to the client.
    const mastNotif = client.onNotification('custom/mastNotif', (message) => { debug(message); });
    context.subscriptions.push(mastNotif);
    // This opens the specified file in the editor.
    const showJson = client.onNotification('custom/showFile', (file, open = false) => {
        file = vscode.Uri.file(file);
        if (open)
            vscode.workspace.openTextDocument(file);
        vscode_1.window.showTextDocument(file);
    });
    context.subscriptions.push(showJson);
    context.subscriptions.push(storyJsonListener);
    // Start the client. This will also launch the server
    client.start();
    // timer = setInterval(() => {
    // 	if (statusBarItemCount = 4) {
    // 		statusBarItemCount = 0;
    // 		statusBarItemText = statusBarItemText.replace("....","");
    // 	} else {
    // 		statusBarItemText += ".";
    // 		statusBarItemCount += 1;
    // 	}
    // 	updateStatusBarItem(statusBarItemText);
    // }, 100);
    // updateStatusBarItem("Loading MAST Extension");
}
function updateStatusBarItem(show) {
    // if (!timer) return;
    // if (!timer.hasRef()) return;
    // statusBarItemText = text;
    if (show) {
        myStatusBarItem.text = "$(loading~spin) Loading MAST Data";
        myStatusBarItem.backgroundColor = new vscode_1.ThemeColor('statusBarItem.warningBackground');
        myStatusBarItem.show();
    }
    else {
        myStatusBarItem.hide();
        // timer.unref();
    }
}
function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
function getIndentations(td) {
    for (let i = 0; i < td.lineCount; i++) {
        let indents = td.lineAt(i).firstNonWhitespaceCharacterIndex;
        debug("Indents: " + indents);
        debug(td.lineAt(i).text);
        let pattern = /.*/g;
        let m;
        let c = 0;
        while (m = pattern.exec(td.lineAt(i).text)) {
            debug(m[0]);
            c = c + 1;
            if (c > 10) {
                break;
            }
        }
    }
}
// class GoCompletionItemProvider implements vscode.CompletionItemProvider {
//     public provideCompletionItems(
//         document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken):
//         Thenable<vscode.CompletionItem[]> {
// 			vscode.execute
//     }
// }
function mydebug(str) {
    if (str === undefined) {
        str = "UNDEFINED";
    }
    str = "\n" + str;
    fs.writeFileSync('outputLog.txt', str, { flag: "a+" });
    console.debug(str);
    console.log(str);
}
function debug(str) {
    outputChannel.appendLine(str);
}
//# sourceMappingURL=extension.js.map