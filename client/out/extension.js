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
const node_1 = require("vscode-languageclient/node");
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
    // context.subscriptions.push(vscode.languages.registerCompletionItemProvider(GO_MODE, new GoCompletionItemProvider(), ".", "\""));
    // Create the language client and start the client.
    client = new node_1.LanguageClient('languageServerExample', 'Language Server Example', serverOptions, clientOptions);
    // Start the client. This will also launch the server
    client.start();
}
function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
// class GoCompletionItemProvider implements vscode.CompletionItemProvider {
//     public provideCompletionItems(
//         document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken):
//         Thenable<vscode.CompletionItem[]> {
// 			vscode.execute
//     }
// }
//# sourceMappingURL=extension.js.map