"use strict";
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const path = require("path");
const vscode_1 = require("vscode");
const vscode = require("vscode");
const fs = require("fs");
const node_1 = require("vscode-languageclient/node");
const console_1 = require("console");
let client;
function activate(context) {
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
        documentSelector: [{ scheme: 'file', language: 'mast' }],
        synchronize: {
            // Notify the server about file changes to '.clientrc files contained in the workspace
            fileEvents: vscode_1.workspace.createFileSystemWatcher('**/.mast')
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
    const storyJsonListener = client.onNotification('custom/storyJson', (message) => {
        (0, console_1.debug)("Story Json Notification recieved");
        (0, console_1.debug)(message);
        // const storyJson = JSON.parse(message);
        // debug(storyJson);
        // // Next we'll want to show the notification for the user...
        showJsonNotif(message);
    });
    // const notifListener = client.onNotification('custom/mastNotif', (message:string)=>{
    // 	debug("Notificaiton recieved");
    // 	debug(message);
    // 	let sj: StoryJson = {
    // 		errorType: 'Warning',
    // 		jsonUri: '',
    // 		currentVersion: '',
    // 		newestVersion: ''
    // 	}
    // 	showJsonNotif(sj);
    // });
    //context.subscriptions.push(notifListener);
    context.subscriptions.push(storyJsonListener);
    // Start the client. This will also launch the server
    client.start();
}
async function showJsonNotif(storyJson) {
    const useLatest = "Use latest local version";
    const keep = "Keep current version";
    const download = "Download latest";
    (0, console_1.debug)(storyJson);
    (0, console_1.debug)("149");
    let selection = "";
    let response = 1;
    if (storyJson.errorType === 0) {
        (0, console_1.debug)("Error message");
        selection = await vscode.window.showErrorMessage(storyJson.newestVersion, useLatest, keep, download);
        (0, console_1.debug)(selection);
    }
    else if (storyJson.errorType === 1) {
        (0, console_1.debug)("Warning message");
        selection = await vscode.window.showWarningMessage(storyJson.newestVersion, useLatest, keep, download);
        (0, console_1.debug)(selection);
    }
    if (selection === undefined) {
        // Equivalent to "keep"
        return;
    }
    if (selection === useLatest) {
        // Update the story.json with latest version number
        response = 0;
    }
    else if (selection === keep) {
        // do nothing
        // Response = 1 by default
    }
    else if (selection === download) {
        // Download the latest version from github
        response = 2;
    }
    client.sendNotification("custom/storyJsonResponse", response);
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
        (0, console_1.debug)("Indents: " + indents);
        (0, console_1.debug)(td.lineAt(i).text);
        let pattern = /.*/g;
        let m;
        let c = 0;
        while (m = pattern.exec(td.lineAt(i).text)) {
            (0, console_1.debug)(m[0]);
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
//# sourceMappingURL=extension.js.map