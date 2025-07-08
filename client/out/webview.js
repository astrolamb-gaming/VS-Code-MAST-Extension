"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateShipWebview = generateShipWebview;
exports.getWebviewContent = getWebviewContent;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const extension_1 = require("./extension");
const cats = {
    'Coding Cat': 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
    'Compiling Cat': 'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif'
};
let panel = undefined;
function generateShipWebview(context, datFolder) {
    (0, extension_1.debug)(datFolder);
    if (panel) {
        panel.reveal();
    }
    else {
        panel = vscode.window.createWebviewPanel('faces', 'Face Generator', vscode.ViewColumn.Beside, {
            // Allows js scripts to run in the webview
            enableScripts: true,
            // Generates more overhead, but enables simpler persistence for more complicated webviews
            // Long term, use this instead https://code.visualstudio.com/api/extension-guides/webview#serialization
            // Shouldn't be too hard to implement
            retainContextWhenHidden: true
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
            panel.webview.html = getWebviewContent("Info to apply");
        };
        updateWebview();
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