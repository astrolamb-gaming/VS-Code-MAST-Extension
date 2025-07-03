import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { debug } from 'console';

const cats = {
  'Coding Cat': 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
  'Compiling Cat': 'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif'
};

export function generateShipWebview(context: vscode.ExtensionContext, datFolder: string) {
	debug(datFolder);
	const panel = vscode.window.createWebviewPanel(
		'faces',
		'Face Generator',
		vscode.ViewColumn.Beside,
		{}
	);

	const updateWebview = () => {

		panel.title = "Face Generator";
		panel.webview.html = getWebviewContent("Info to apply");
	};

	updateWebview();
	// const interval = setInterval(updateWebview, 1000);

	panel.onDidDispose(
		() => {
			// When the panel is closed, cancel any future updates to the webview content
			// clearInterval(interval);
		},
		null,
		context.subscriptions
	);

}

export function getWebviewContent(content:string): string {
	let file =  path.join(__dirname.replace("out","src"), "media", "ships.html");
	let html = fs.readFileSync(file, "utf-8");
	debug(html);
	return html;
}