/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import { workspace, ExtensionContext , window, OutputChannel, LogOutputChannel, Progress, ThemeColor } from 'vscode';
import * as vscode from 'vscode';
import fs = require("fs");

import {
	integer,
	LanguageClient,
	LanguageClientOptions,
	ProgressType,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';
import { generateFaceWebview, generateShipWebview } from './webview';

let mainProgress: Progress<{
    message?: string;
    increment?: number;
}>;

let myStatusBarItem: vscode.StatusBarItem;
let statusBarItemText = "";
let statusBarItemCount = 0;
let timer: NodeJS.Timeout;

let client: LanguageClient;
let outputChannel: LogOutputChannel;
outputChannel = window.createOutputChannel("MAST Client Output",{log:true});
debug("Output channel created");

// #region <--------------------- child_process checking... ---------------------->
// I Don't remember why this is here, and doesn't seem to do anything important anymore?????
// (function() {
// 	debug("Startings")
//     var childProcess = require("child_process");
//     var oldSpawn = childProcess.spawn;
//     function mySpawn() {
// 		if (!arguments[0].includes("git.exe")) {
// 			console.log('spawn called');
// 			console.log(arguments);
// 		}
//         var result = oldSpawn.apply(this, arguments);
//         return result;
//     }
//     childProcess.spawn = mySpawn;
// })();
// #endregion

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));


export function activate(context: ExtensionContext) {
	debug("Activating extension.");
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);

	

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
		documentSelector: [{ scheme: 'file', language: 'mast' },{scheme:'file',language:'json'}],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: [workspace.createFileSystemWatcher('**/.mast'),workspace.createFileSystemWatcher('**/.json')]
		}
	};

	vscode.workspace.onDidChangeTextDocument((event) => {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor || event.document !== activeEditor.document) return;

		const cursorPos = activeEditor.selection.active;
		const textBeforeCursor = event.document.getText(
		new vscode.Range(cursorPos.with(undefined, 0), cursorPos)
		);

		// Detect if the cursor is inside quotes after an attribute (e.g., Name="|")
		const isInsideQuotes = textBeforeCursor.endsWith("//");///<[^\>]+\s+\w+=["'][^"']*$/.test(textBeforeCursor);

		if (isInsideQuotes) {
			// Programmatically trigger suggestions
			vscode.commands.executeCommand('editor.action.triggerSuggest');
		}
	});

// #region <--------------- Folding Provider Region - Not Used.... ---------------------->
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
// #endregion


	// Create the language client and start the client.
	client = new LanguageClient(
		'MAST-Language-Server',
		'MAST Language Server',
		serverOptions,
		clientOptions
	);

// #region <--------------------- Ship and Face Webview Region ------------------------>
	const ships = client.onNotification('custom/ships', (payload)=>{
		debug('Received ships notification payload; artemisDir: ' + payload?.artemisDir + ', ships: ' + (payload?.ships?.length || 0));
		generateShipWebview(context, payload);
	});

	const faces = client.onNotification('custom/faces', (payload)=>{
		debug('Received faces notification payload; artemisDir: ' + payload?.artemisDir + ', faces: ' + (payload?.faces?.length || 0));
		generateFaceWebview(context, payload);
	});

	const openShipPicker = client.onNotification('custom/openShipPicker', async (payload)=>{
		debug('Received ship picker request for arg: ' + payload?.argumentName);
		const choice = await window.showInformationMessage(
			`Open Ship Viewer to select a value for "${payload?.argumentName || 'ship'}"?`,
			'Open Ship Viewer',
			'Dismiss'
		);
		if (choice === 'Open Ship Viewer') {
			client.sendNotification('custom/openShipViewer', {
				mode: 'insert',
				argumentName: payload?.argumentName || '',
				sourceUri: payload?.sourceUri || ''
			});
		}
	});

	const openFacePicker = client.onNotification('custom/openFacePicker', async (payload)=>{
		debug('Received face picker request for arg: ' + payload?.argumentName);
		const choice = await window.showInformationMessage(
			`Open Face Builder to select a value for "${payload?.argumentName || 'face'}"?`,
			'Open Face Builder',
			'Dismiss'
		);
		if (choice === 'Open Face Builder') {
			client.sendNotification('custom/openFaceBuilder', {
				sourceUri: payload?.sourceUri || vscode.window.activeTextEditor?.document.uri.toString() || ''
			});
		}
	});

	context.subscriptions.push(vscode.commands.registerCommand('mast.openShipViewer', () => {
		debug('mast.openShipViewer command triggered');
		if (!client) {
			window.showWarningMessage('MAST client is not ready yet.');
			return;
		}
		debug('Sending custom/openShipViewer notification to server');
		client.sendNotification('custom/openShipViewer', {});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('mast.openFaceBuilder', () => {
		debug('mast.openFaceBuilder command triggered');
		if (!client) {
			window.showWarningMessage('MAST client is not ready yet.');
			return;
		}
		debug('Sending custom/openFaceBuilder notification to server');
		client.sendNotification('custom/openFaceBuilder', {
			sourceUri: vscode.window.activeTextEditor?.document.uri.toString() || ''
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('mast.runSbsLib', async () => {
		debug('mast.runSbsLib command triggered');

		const activeDocUri = vscode.window.activeTextEditor?.document.uri;
		let folder = activeDocUri ? vscode.workspace.getWorkspaceFolder(activeDocUri) : undefined;
		if (!folder) {
			folder = vscode.workspace.workspaceFolders?.[0];
		}

		if (!folder) {
			window.showWarningMessage('No workspace folder is open. Open a mission folder to run sbs lib.');
			return;
		}

		const missionFolderPath = folder.uri.fsPath;
		const missionsFolderPath = path.dirname(missionFolderPath);
		if (path.basename(missionsFolderPath).toLowerCase() !== 'missions') {
			window.showWarningMessage(`Expected mission folder parent to be "missions", but found "${path.basename(missionsFolderPath)}".`);
			return;
		}

		const missionFolderName = folder.name;
		const missionFolderArg = JSON.stringify(missionFolderName);
		const command = `sbs lib `+ missionFolderName;

		const terminal = vscode.window.createTerminal({
			name: 'MAST: Build sbslib/mastlib',
			cwd: missionsFolderPath
		});
		terminal.show(true);
		terminal.sendText(command, true);

		window.showInformationMessage(`Running: ${command}`);
	}));

	// context.subscriptions.push(
	// 	vscode.commands.registerCommand('faces.start', () => {
	// 		generateShipWebview(context, )
	// 	})
	// );
	context.subscriptions.push(ships);
	context.subscriptions.push(faces);
	context.subscriptions.push(openShipPicker);
	context.subscriptions.push(openFacePicker);

// #endregion

// #region <----------------- Progress Bar Region -------------------->
	// create a new status bar item that we can now manage
	myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 200);
	// myStatusBarItem.command = myCommandId;
	context.subscriptions.push(myStatusBarItem);


	//window.showQuickPick([{label:"One"},{label:"Two"}]);
	//let ib = window.createInputBox();
	// ib.prompt = "Choose modules"
	// ib.show();

	const prog1 = client.onProgress(new ProgressType<number>,"Loadding data...",(increment)=>{
		debug(increment);
	});
	context.subscriptions.push(prog1);

	let statusBarStatus = true;
	const prog = client.onNotification('custom/progressNotif',(show)=>{
		updateStatusBarItem(show);
	});
	context.subscriptions.push(prog);
	// updateStatusBarItem(true);

	let warning = client.onNotification('custom/warning', (message)=>{
		window.showWarningMessage(message);
	})
	context.subscriptions.push(warning);

// #endregion

	const storyJsonListener = client.onNotification('custom/storyJson', (message)=>{
		debug("Story Json Notification recieved")
		//window.showQuickPick([{label:"One"},{label:"Two"}]);
		debug(message);
		// const storyJson = JSON.parse(message);
		// debug(storyJson);
		// // Next we'll want to show the notification for the user...
		//showJsonNotif(message);
	});

	// This just sends a debug message to the client.
	const mastNotif = client.onNotification('custom/mastNotif', (message)=>{debug(message);})
	context.subscriptions.push(mastNotif);

	// This opens the specified file in the editor.
	const showJson = client.onNotification('custom/showFile', (file, open=false)=>{
		file = vscode.Uri.file(file);
		if (open) vscode.workspace.openTextDocument(file);
		window.showTextDocument(file);
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

function updateStatusBarItem(show:boolean): void {
	// if (!timer) return;
	// if (!timer.hasRef()) return;
	// statusBarItemText = text;
	if (show) {
		myStatusBarItem.text = "$(loading~spin) Loading MAST Data";
		myStatusBarItem.backgroundColor = new ThemeColor('statusBarItem.warningBackground')
		myStatusBarItem.show();
	} else {
		myStatusBarItem.hide();
		// timer.unref();
	}
}


interface StoryJson {
	errorType: integer,
	jsonUri: string, 
	currentVersion: string, 
	newestVersion: string
}


export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}

export function debug(str:any) {
	outputChannel.appendLine(str);
	if (client) {
		client.sendNotification("custom/debug", str);
	} else {
		outputChannel.appendLine("client not initialized")
	}
}