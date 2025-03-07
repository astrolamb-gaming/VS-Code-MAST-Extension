/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import { workspace, ExtensionContext , window as Window, window, OutputChannel} from 'vscode';
import * as vscode from 'vscode';
import fs = require("fs");

import {
	integer,
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;
let outputChannel: OutputChannel;

export function activate(context: ExtensionContext) {
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);

	outputChannel = window.createOutputChannel("MAST Client Output");

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
		}
	};

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [{ scheme: 'file', language: 'mast' }],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.mast')
		},
		middleware: {
			executeCommand: async (command, args, next) => {
				const selected = await Window.showQuickPick(['Visual Studio', 'Visual Studio Code']);
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
	client = new LanguageClient(
		'MAST-Language-Server',
		'MAST Language Server',
		serverOptions,
		clientOptions
	);

	const storyJsonListener = client.onNotification('custom/storyJson', (message)=>{
		debug("Story Json Notification recieved")
		debug(message);
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
interface StoryJson {
	errorType: integer,
	jsonUri: string, 
	currentVersion: string, 
	newestVersion: string
}
async function showJsonNotif(storyJson: StoryJson) {
	const useLatest: string = "Use latest";
	const keep: string = "Keep current";
	const download: string = "Download newest";
	debug(JSON.stringify(storyJson));
	debug("149")
	let selection:string = "";
	let response = 1;
	if (storyJson.errorType === 0) {
		debug("Error message")
		selection = await vscode.window.showErrorMessage("story.json contains references to files that do not exist", useLatest, keep, download);
		debug(selection);
	} else if (storyJson.errorType === 1) {
		debug("Warning message");
		selection = await vscode.window.showWarningMessage("story.json can be updated with more recent file versions", useLatest, keep, download);
		debug(selection);
	}
	if (selection === undefined) {
		// Equivalent to "keep"
		return;
	}
	if (selection === useLatest) {
		// Update the story.json with latest version number
		response = 0;
	} else if (selection === keep) {
		// do nothing
		// Response = 1 by default
	} else if (selection === download) {
		// Download the latest version from github
		response = 2;
	}
	client.sendNotification("custom/storyJsonResponse",response);
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}

function getIndentations(td: vscode.TextDocument) {
	for (let i = 0; i < td.lineCount; i++) {
		let indents = td.lineAt(i).firstNonWhitespaceCharacterIndex;
		debug("Indents: "+indents);
		debug(td.lineAt(i).text);
		let pattern = /.*/g;
		let m: RegExpExecArray;
		let c = 0;
		while (m = pattern.exec(td.lineAt(i).text)) {
			debug(m[0]);
			c = c + 1;
			if (c > 10) { break; }
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

function mydebug(str:any) {
    if (str === undefined) {
        str = "UNDEFINED";
    }
    str = "\n" + str;
    fs.writeFileSync('outputLog.txt', str, { flag: "a+" });
	console.debug(str);
	console.log(str);
}

function debug(str:any) {
	outputChannel.appendLine(str);
}