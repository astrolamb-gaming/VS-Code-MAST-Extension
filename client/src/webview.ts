import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { debug } from './extension';
import { WebviewPanel } from 'vscode';

let panel: WebviewPanel | undefined = undefined;

export function generateShipWebview(context: vscode.ExtensionContext, datFolder: string) {
	debug(datFolder);
	if (panel) {
		panel.reveal();
	} else {
		panel = vscode.window.createWebviewPanel(
			'faces',
			'Face Generator',
			vscode.ViewColumn.Two,
			{
				// Allows js scripts to run in the webview
				enableScripts: true,

				// Generates more overhead, but enables simpler persistence for more complicated webviews
				// Long term, use this instead https://code.visualstudio.com/api/extension-guides/webview#serialization
				// Shouldn't be too hard to implement
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(context.extensionUri, 'media'),
					vscode.Uri.joinPath(vscode.Uri.file(os.tmpdir()),"cosmosImages"),
					vscode.Uri.joinPath(vscode.Uri.file(datFolder))
				]
			}
		);

		// Handle messages from the webview
		panel.webview.onDidReceiveMessage(
			message => {
				debug(message);
				switch (message.command) {
					case 'face':
						debug(message.text);
						vscode.window.showErrorMessage(message.text);
						return;
				}
			},
			undefined,
			context.subscriptions
		);

		const updateWebview = () => {

			panel.title = "Face Generator";
			panel.webview.html = getWebviewContent("Info to apply").replace("BUTTON", datFolder);
		};

		updateWebview();
		panel.webview.postMessage({"test":"this"})
		// const interval = setInterval(updateWebview, 1000);

		panel.onDidDispose(
			() => {
				// When the panel is closed, cancel any future updates to the webview content
				// clearInterval(interval);
			},
			null,
			context.subscriptions
		);
		context.subscriptions.push(panel);
	}
	panel.webview.postMessage({"message": "saying_hi"});

}

export function getWebviewContent(content:string): string {
	let file =  path.join(__dirname.replace("out","src"), "media", "faces.html");
	let html = fs.readFileSync(file, "utf-8");
	// debug(html);
	return html;
}