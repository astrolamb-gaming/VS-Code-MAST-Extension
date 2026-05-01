const path = require('path');

// The compiled cache module imports `../server/out/server.js`, which tries to
// create an LSP connection on load. Stub it so this script can run standalone.
const serverOutPath = path.resolve(__dirname, '../server/out/server.js');
require.cache[serverOutPath] = {
    id: serverOutPath,
    filename: serverOutPath,
    loaded: true,
    exports: {
        connection: {
            sendNotification() { },
            window: { showWarningMessage() { } }
        },
        documents: {
            all() { return []; },
            get() { return undefined; }
        },
        labelNames: [],
        hasDiagnosticRelatedInformationCapability: false,
        getDocumentSettings() { return {}; },
        myDebug() { },
        notifyClient() { },
        sendWarning() { },
        sendToClient() { },
        showProgressBar() { }
    }
};

// Stub cache to avoid filesystem-dependent mission loading in standalone runs.
const cacheOutPath = path.resolve(__dirname, '../server/out/cache.js');
require.cache[cacheOutPath] = {
    id: cacheOutPath,
    filename: cacheOutPath,
    loaded: true,
    exports: {
        getCache() {
            return {
                getLabels() { return []; },
                getLabelsAtPos() { return []; },
                getMethod() { return null; },
                getPossibleMethods() { return []; },
                getStyleDefinitions() { return []; }
            };
        },
        testingPython: false
    }
};

const { TextDocument } = require('vscode-languageserver-textdocument');
const mastTokens = require('../server/out/tokens/mastStringExtractor');
const labels = require('../server/out/tokens/labels');

function runTest(text, name) {
    const doc = TextDocument.create('file:///' + name + '.mast', 'mast', 1, text);
    const tokens = mastTokens.tokenizeMastFile(doc);
    const diags = labels.checkForUndefinedVariablesInScope(doc, tokens);
    console.log('===', name, '===');
    if (diags && diags.length > 0) {
        for (const d of diags) {
            console.log(d.message);
        }
    } else {
        console.log('No diagnostics');
    }
}

const sample1 = '== test ==\nhi = hi + 1\n';
const sample2 = '== test ==\nmetadata: ```\nbuttons:\n```\n    if buttons is None:\n        print("Buttons is None")\n        yield fail\n    print(buttons)\n';

runTest(sample1, 'same-line-hi');
runTest(sample2, 'buttons-guard');
