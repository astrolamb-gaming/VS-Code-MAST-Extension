"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateShipWebview = generateShipWebview;
exports.getWebviewContent = getWebviewContent;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const os = require("os");
const extension_1 = require("./extension");
let panel = undefined;
function generateShipWebview(context, datFolder) {
    (0, extension_1.debug)(datFolder);
    if (panel) {
        panel.reveal();
    }
    else {
        panel = vscode.window.createWebviewPanel('faces', 'Face Generator', vscode.ViewColumn.Two, {
            // Allows js scripts to run in the webview
            enableScripts: true,
            // Generates more overhead, but enables simpler persistence for more complicated webviews
            // Long term, use this instead https://code.visualstudio.com/api/extension-guides/webview#serialization
            // Shouldn't be too hard to implement
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, 'media'),
                vscode.Uri.joinPath(vscode.Uri.file(os.tmpdir()), "cosmosImages"),
                vscode.Uri.joinPath(vscode.Uri.file(datFolder))
            ]
        });
        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(message => {
            (0, extension_1.debug)(message);
            switch (message.command) {
                case 'face':
                    (0, extension_1.debug)(message.text);
                    vscode.window.showErrorMessage(message.text);
                    return;
            }
        }, undefined, context.subscriptions);
        const updateWebview = () => {
            panel.title = "Face Generator";
            panel.webview.html = getWebviewContent("Info to apply").replace("BUTTON", datFolder);
        };
        updateWebview();
        panel.webview.postMessage({ "test": "this" });
        // const interval = setInterval(updateWebview, 1000);
        panel.onDidDispose(() => {
            // When the panel is closed, cancel any future updates to the webview content
            // clearInterval(interval);
        }, null, context.subscriptions);
        context.subscriptions.push(panel);
    }
    panel.webview.postMessage({ "message": "saying_hi" });
}
function getWebviewContent(content) {
    let file = path.join(__dirname.replace("out", "src"), "media", "faces.html");
    let html = fs.readFileSync(file, "utf-8");
    // debug(html);
    return html;
}
//# sourceMappingURL=webview.js.map