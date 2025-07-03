"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateShipWebview = generateShipWebview;
exports.getWebviewContent = getWebviewContent;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const console_1 = require("console");
const cats = {
    'Coding Cat': 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
    'Compiling Cat': 'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif'
};
function generateShipWebview(context, datFolder) {
    (0, console_1.debug)(datFolder);
    const panel = vscode.window.createWebviewPanel('faces', 'Face Generator', vscode.ViewColumn.Beside, {});
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
}
function getWebviewContent(content) {
    let file = path.join(__dirname.replace("out", "src"), "media", "ships.html");
    let html = fs.readFileSync(file, "utf-8");
    (0, console_1.debug)(html);
    return html;
}
//# sourceMappingURL=webview.js.map