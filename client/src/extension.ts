/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import { execFile } from 'child_process';
import * as os from 'os';
import * as https from 'https';
import { workspace, ExtensionContext , window, OutputChannel, LogOutputChannel, Progress, ThemeColor } from 'vscode';
import * as vscode from 'vscode';
import fs = require("fs");
import AdmZip = require('adm-zip');

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
let statusBarShownAt = 0;
let pendingStatusBarHide: NodeJS.Timeout | undefined;
const MIN_LOADING_STATUS_MS = 1500;
let loadingStatusVisible = false;
let compilingStatusVisible = false;

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

const MAST_STARTER_REPO = 'https://github.com/artemis-sbs/mast_starter';
const MAST_STARTER_ZIP = 'https://codeload.github.com/artemis-sbs/mast_starter/zip/refs/heads/main';


export function activate(context: ExtensionContext) {
	debug("Activating extension.");
	const compileDiagnostics = vscode.languages.createDiagnosticCollection('mast-compile');
	context.subscriptions.push(compileDiagnostics);
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
		documentSelector: [{ scheme: 'file', language: 'mast' },{scheme:'file',language:'json'},{scheme:'file',language:'py'},{scheme:'file',language:'python'}],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: [workspace.createFileSystemWatcher('**/.mast'),workspace.createFileSystemWatcher('**/.json')]
		}
	};

	vscode.workspace.onDidChangeTextDocument((event) => {
		if (event.document.languageId === 'mast') {
			compileDiagnostics.delete(event.document.uri);
		}

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

	context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((document) => {
		if (document.languageId === 'mast') {
			compileDiagnostics.delete(document.uri);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('mast.smartEnter', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== 'mast') {
			await vscode.commands.executeCommand('default:type', { text: '\n' });
			return;
		}

		if (editor.selections.length !== 1 || !editor.selection.isEmpty) {
			await vscode.commands.executeCommand('default:type', { text: '\n' });
			return;
		}

		const doc = editor.document;
		const cursor = editor.selection.active;
		const lineText = doc.lineAt(cursor.line).text;
		const beforeCursor = lineText.substring(0, cursor.character);
		const afterCursor = lineText.substring(cursor.character);
		const regionMatch = beforeCursor.match(/^(\s*)#\s*region\b.*$/);
		const shouldInsertEndRegion = !!regionMatch && afterCursor.trim() === '';
		const regionIndent = regionMatch ? regionMatch[1] : '';

		await vscode.commands.executeCommand('default:type', { text: '\n' });

		if (!shouldInsertEndRegion) {
			return;
		}

		const updatedEditor = vscode.window.activeTextEditor;
		if (!updatedEditor || updatedEditor.document.uri.toString() !== doc.uri.toString()) {
			return;
		}

		const updatedDoc = updatedEditor.document;
		const insertLine = updatedEditor.selection.active.line + 1;
		if (insertLine < updatedDoc.lineCount) {
			const nextLineText = updatedDoc.lineAt(insertLine).text;
			if (/^\s*#\s*endregion\b/.test(nextLineText)) {
				return;
			}
		}

		await updatedEditor.edit((editBuilder) => {
			editBuilder.insert(new vscode.Position(insertLine, 0), `${regionIndent}#endregion\n`);
		});
	}));

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

	context.subscriptions.push(vscode.commands.registerCommand('mast.NewMissionScaffold', async () => {
		debug('mast.NewMissionScaffold command triggered');

		const missionName = await window.showInputBox({
			title: 'Create New Mission',
			prompt: 'Enter a name for the new mission folder',
			placeHolder: 'my_new_mission',
			ignoreFocusOut: true,
			validateInput: (value: string) => {
				const trimmed = value.trim();
				if (!trimmed) {
					return 'Mission name is required.';
				}
				if (/[/\\:*?"<>|]/.test(trimmed)) {
					return 'Mission name contains invalid path characters.';
				}
				if (trimmed === '.' || trimmed === '..') {
					return 'Mission name cannot be "." or "..".';
				}
				return null;
			}
		});

		if (!missionName) {
			debug('Mission scaffold creation cancelled: no mission name supplied.');
			return;
		}

		const missionNameTrimmed = missionName.trim();
		const openBehaviorSelection = await window.showQuickPick(
			[
				{ label: 'Add to Current Workspace', description: 'Adds the mission folder to the current workspace', behavior: 'add-current' },
				{ label: 'Open in New Workspace', description: 'Replaces the current workspace with the new mission folder', behavior: 'open-current-window' },
				{ label: 'Open in New Window', description: 'Opens the new mission folder in a new VS Code window', behavior: 'open-new-window' },
				{ label: 'Create but Don\'t Open', description: 'Creates the mission folder only', behavior: 'create-only' }
			],
			{
				title: 'Mission Open Behavior',
				placeHolder: 'Choose what to do after creating the mission',
				ignoreFocusOut: true
			}
		);

		if (!openBehaviorSelection) {
			debug('Mission scaffold creation cancelled: no mission open behavior selected.');
			return;
		}

		const openBehavior = openBehaviorSelection.behavior;
		const missionsDir = resolveMissionsDirectoryFromOpenMast();
		if (!missionsDir) {
			window.showWarningMessage('Could not find a parent "missions" folder from any open .mast file. Open a .mast file within a mission under "missions" and try again.');
			debug('Mission scaffold creation cancelled: no missions directory resolved from open .mast files.');
			return;
		}

		const missionDir = path.join(missionsDir, missionNameTrimmed);

		if (fs.existsSync(missionDir)) {
			window.showErrorMessage(`Mission folder already exists: ${missionDir}`);
			return;
		}

		try {
			await window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Creating mission scaffold "${missionNameTrimmed}"...`,
				cancellable: false
			}, async () => {
				await cloneMissionTemplate(missionDir);
			});

			if (openBehavior === 'add-current') {
				const alreadyInWorkspace = vscode.workspace.workspaceFolders?.some(
					(folder) => folder.uri.fsPath === missionDir
				) ?? false;
				if (!alreadyInWorkspace) {
					vscode.workspace.updateWorkspaceFolders(
						vscode.workspace.workspaceFolders?.length ?? 0,
						0,
						{ uri: vscode.Uri.file(missionDir), name: missionNameTrimmed }
					);
				}
			}
			if (openBehavior === 'open-current-window') {
				await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(missionDir), false);
			}
			if (openBehavior === 'open-new-window') {
				await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(missionDir), true);
			}

			window.showInformationMessage(`Created mission scaffold: ${missionNameTrimmed}`);
		} catch (error: any) {
			const message = error?.message ?? String(error);
			debug(`Failed to create mission scaffold: ${message}`);
			window.showErrorMessage(`Failed to create mission scaffold: ${message}`);
		}
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

	const compileStatus = client.onNotification('custom/compileStatus', (payload: { active?: boolean } | undefined) => {
		updateCompileStatusBarItem(!!payload?.active);
	});
	context.subscriptions.push(compileStatus);
	// updateStatusBarItem(true);

	let warning = client.onNotification('custom/warning', (message)=>{
		window.showWarningMessage(message);
	})
	context.subscriptions.push(warning);

	const quickPickListener = client.onNotification('custom/openQuickPick', async (payload: { requestId?: string; title?: string; placeHolder?: string; options?: string[] } | undefined) => {
		if (!payload?.requestId || !Array.isArray(payload.options) || payload.options.length === 0) {
			return;
		}

		const selected = await window.showQuickPick(
			payload.options.map((option) => ({ label: option })),
			{
				title: payload.title || 'Select an option',
				placeHolder: payload.placeHolder,
				ignoreFocusOut: true
			}
		);

		client.sendNotification('custom/quickPickResponse', {
			requestId: payload.requestId,
			selection: selected?.label
		});
	});
	context.subscriptions.push(quickPickListener);

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

	let compileOutputChannel: vscode.OutputChannel | undefined;
	const compileMissionProgress = client.onNotification('custom/compileMissionProgress', (payload: { message?: string; reset?: boolean } | undefined) => {
		if (!compileOutputChannel) {
			compileOutputChannel = window.createOutputChannel('MAST: Compile Results');
		}
		if (payload?.reset) {
			compileOutputChannel.clear();
		}
		compileOutputChannel.show(true);
		if (payload?.message) {
			compileOutputChannel.appendLine(payload.message);
		}
	});
	context.subscriptions.push(compileMissionProgress);

	const compileMissionResult = client.onNotification('custom/compileMissionResult', (payload: { errors: { uri: string; message: string; line: number; character: number; endLine: number; endCharacter: number; severity?: number; source: string }[]; files?: { uri: string; errorCount: number }[]; message: string }) => {
		if (!compileOutputChannel) {
			compileOutputChannel = window.createOutputChannel('MAST: Compile Results');
		}
		compileOutputChannel.show(true);
		compileOutputChannel.appendLine('');
		compileOutputChannel.appendLine(payload.message);
		if (payload.files && payload.files.length > 0) {
			compileOutputChannel.appendLine('');
			compileOutputChannel.appendLine('Per-file results:');
			for (const fileResult of payload.files) {
				compileOutputChannel.appendLine(`- ${vscode.Uri.parse(fileResult.uri).fsPath}: ${fileResult.errorCount} error(s)`);
			}
		}

		const groupedDiagnostics = new Map<string, vscode.Diagnostic[]>();
		if (payload.errors.length > 0) {
			compileOutputChannel.appendLine('');
			for (const e of payload.errors) {
				compileOutputChannel.appendLine(`[${e.source}] Line ${e.line}, Col ${e.character}: ${e.message}`);
				const uri = vscode.Uri.parse(e.uri);
				const range = new vscode.Range(
					Math.max(0, e.line - 1),
					Math.max(0, e.character - 1),
					Math.max(0, e.endLine - 1),
					Math.max(0, e.endCharacter - 1)
				);
				const diagnostic = new vscode.Diagnostic(
					range,
					e.message,
					(e.severity as vscode.DiagnosticSeverity | undefined) ?? vscode.DiagnosticSeverity.Error
				);
				diagnostic.source = e.source;
				const existing = groupedDiagnostics.get(uri.toString()) || [];
				existing.push(diagnostic);
				groupedDiagnostics.set(uri.toString(), existing);
			}
		}

		const activeDocUri = vscode.window.activeTextEditor?.document.uri;
		if (activeDocUri) {
			compileDiagnostics.delete(activeDocUri);
		}
		for (const [uriString, diagnostics] of groupedDiagnostics) {
			compileDiagnostics.set(vscode.Uri.parse(uriString), diagnostics);
		}
	});
	context.subscriptions.push(compileMissionResult);

	context.subscriptions.push(vscode.commands.registerCommand('mast.compileMission', async () => {
		debug('mast.compileMission command triggered');
		if (!client) {
			window.showWarningMessage('MAST client is not ready yet.');
			return;
		}
		const activeDoc = vscode.window.activeTextEditor?.document;
		if (!activeDoc || activeDoc.languageId !== 'mast') {
			window.showWarningMessage('Open a .mast file and set focus to it before compiling.');
			return;
		}
		client.sendNotification('custom/compileMission', { sourceUri: activeDoc.uri.toString() });
	}));

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
	if (show) {
		if (pendingStatusBarHide) {
			clearTimeout(pendingStatusBarHide);
			pendingStatusBarHide = undefined;
		}
		if (!loadingStatusVisible || statusBarShownAt === 0) {
			statusBarShownAt = Date.now();
		}
		loadingStatusVisible = true;
		renderStatusBarItem();
		debug('Status bar loading indicator shown');
	} else {
		const elapsed = statusBarShownAt > 0 ? Date.now() - statusBarShownAt : MIN_LOADING_STATUS_MS;
		const hide = () => {
			loadingStatusVisible = false;
			statusBarShownAt = 0;
			pendingStatusBarHide = undefined;
			renderStatusBarItem();
			debug('Status bar loading indicator hidden');
		};
		if (elapsed >= MIN_LOADING_STATUS_MS) {
			hide();
		} else {
			const delay = MIN_LOADING_STATUS_MS - elapsed;
			pendingStatusBarHide = setTimeout(hide, delay);
			debug(`Delaying loading indicator hide by ${delay}ms`);
		}
		// timer.unref();
	}
}

function updateCompileStatusBarItem(show: boolean): void {
	if (show && pendingStatusBarHide) {
		clearTimeout(pendingStatusBarHide);
		pendingStatusBarHide = undefined;
	}
	compilingStatusVisible = show;
	renderStatusBarItem();
	debug(show ? 'Status bar compile indicator shown' : 'Status bar compile indicator hidden');
}

function renderStatusBarItem(): void {
	if (compilingStatusVisible) {
		myStatusBarItem.text = '$(sync~spin) Compiling...';
		myStatusBarItem.backgroundColor = new ThemeColor('statusBarItem.warningBackground');
		myStatusBarItem.show();
		return;
	}

	if (loadingStatusVisible) {
		myStatusBarItem.text = '$(loading~spin) Loading MAST Data';
		myStatusBarItem.backgroundColor = new ThemeColor('statusBarItem.warningBackground');
		myStatusBarItem.show();
		return;
	}

	myStatusBarItem.hide();
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

function resolveMissionsDirectoryFromOpenMast(): string | undefined {
	const mastPaths = new Set<string>();
	const activeDocument = vscode.window.activeTextEditor?.document;
	if (activeDocument && activeDocument.languageId === 'mast' && !activeDocument.isUntitled) {
		mastPaths.add(activeDocument.uri.fsPath);
	}

	for (const document of vscode.workspace.textDocuments) {
		if (document.languageId === 'mast' && !document.isUntitled) {
			mastPaths.add(document.uri.fsPath);
		}
	}

	for (const mastPath of mastPaths) {
		const missionsDir = findParentMissionsDirectory(path.dirname(mastPath));
		if (missionsDir) {
			return missionsDir;
		}
	}

	return undefined;
}

function findParentMissionsDirectory(startDir: string): string | undefined {
	let currentDir = startDir;
	while (true) {
		if (path.basename(currentDir).toLowerCase() === 'missions') {
			return currentDir;
		}

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			return undefined;
		}
		currentDir = parentDir;
	}
}

async function cloneMissionTemplate(missionDir: string): Promise<void> {
	const missionParent = path.dirname(missionDir);
	await fs.promises.mkdir(missionParent, { recursive: true });

	try {
		await cloneMissionTemplateWithGit(missionDir, missionParent);
	} catch (error: any) {
		if (error?.code === 'ENOENT') {
			debug('git executable not found, falling back to ZIP download for mission scaffold.');
			await cloneMissionTemplateFromZip(missionDir);
			return;
		}
		throw new Error(error?.message ?? String(error));
	}

	const gitDir = path.join(missionDir, '.git');
	if (fs.existsSync(gitDir)) {
		await fs.promises.rm(gitDir, { recursive: true, force: true });
	}
}

async function cloneMissionTemplateWithGit(missionDir: string, missionParent: string): Promise<void> {
	const gitExecutable = getGitExecutablePath();

	await new Promise<void>((resolve, reject) => {
		execFile(
			gitExecutable,
			['clone', '--depth', '1', MAST_STARTER_REPO, missionDir],
			{ cwd: missionParent },
			(error, _stdout, stderr) => {
				if (error) {
					if (stderr && stderr.trim().length > 0) {
						error.message = stderr.trim();
					}
					reject(error);
					return;
				}
				resolve();
			}
		);
	});

}

function getGitExecutablePath(): string {
	const configured = vscode.workspace.getConfiguration('git').get<string>('path');
	if (configured && configured.trim().length > 0) {
		return configured.trim();
	}
	return 'git';
}

async function cloneMissionTemplateFromZip(missionDir: string): Promise<void> {
	const missionParent = path.dirname(missionDir);
	await fs.promises.mkdir(missionParent, { recursive: true });

	const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mast-starter-'));
	const zipPath = path.join(tempRoot, 'mast_starter.zip');
	const extractPath = path.join(tempRoot, 'extract');

	try {
		await downloadFile(MAST_STARTER_ZIP, zipPath);
		await fs.promises.mkdir(extractPath, { recursive: true });
		const zip = new AdmZip(zipPath);
		zip.extractAllTo(extractPath, true);

		const rootEntries = await fs.promises.readdir(extractPath, { withFileTypes: true });
		const templateRoot = rootEntries.find((entry) => entry.isDirectory());
		if (!templateRoot) {
			throw new Error('Downloaded mission template archive was empty.');
		}

		const extractedTemplateDir = path.join(extractPath, templateRoot.name);
		await fs.promises.cp(extractedTemplateDir, missionDir, { recursive: true, errorOnExist: true });
	} finally {
		await fs.promises.rm(tempRoot, { recursive: true, force: true });
	}
}

async function downloadFile(url: string, destinationPath: string): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const request = https.get(url, (response) => {
			if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
				response.resume();
				downloadFile(response.headers.location, destinationPath).then(resolve).catch(reject);
				return;
			}

			if (response.statusCode !== 200) {
				response.resume();
				reject(new Error(`Failed to download mission template archive (HTTP ${response.statusCode ?? 'unknown'}).`));
				return;
			}

			const fileStream = fs.createWriteStream(destinationPath);
			response.pipe(fileStream);
			fileStream.on('finish', () => {
				fileStream.close();
				resolve();
			});
			fileStream.on('error', (error) => {
				reject(error);
			});
		});

		request.on('error', (error) => {
			reject(error);
		});
	});
}