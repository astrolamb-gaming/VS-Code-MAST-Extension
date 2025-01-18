/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
//// <reference path="../src/sbs.pyi" />
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	DocumentDiagnosticReportKind,
	type DocumentDiagnosticReport,
	integer,
	TextDocumentEdit,
	TextEdit,
	Position,
	CodeAction,
	CodeActionKind,
	Command,
	CompletionItemTag,
	SignatureHelp,
	SignatureInformation,
	SignatureHelpParams,
	ServerRequestHandler,
	ParameterInformation,
	Hover
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { findDiagnostic } from './errorChecking';
import { checkLabels, getMainLabelAtPos, LabelInfo } from './labels';
import { onCompletion, prepCompletions } from './autocompletion';
import { debug as db} from 'console';
import { onHover } from './hover';
import { onSignatureHelp, prepSignatures } from './signatureHelp';
import { ClassTypings, parseWholeFile, PyFile } from './data';
import { loadRouteLabels } from './routeLabels';
import { parse, RX } from './rx';
import { getComments } from './comments';
import fs = require("fs");
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
export let hasDiagnosticRelatedInformationCapability = false;
//const completionStrings : string[] = [];

let debugStrs : string = "";//Debug: ${workspaceFolder}\n";

let pyTypings : CompletionItem[] = [];
let workspacePyTypings : CompletionItem[] = [];
export function getPyTypings(): CompletionItem[] { return pyTypings; }
let classTypings : ClassTypings[] = [];
let workspaceClassTypings : ClassTypings[] = [];
export function getClassTypings(): ClassTypings[] { return classTypings; }
export let labelNames : LabelInfo[] = [];
let typingsDone: boolean = false;
let currentDocument: TextDocument;

let functionData : SignatureInformation[] = [];
export function appendFunctionData(si: SignatureInformation) {functionData.push(si);}
export function getFunctionData(): SignatureInformation[] { return functionData; }





let files: string[] = [
	"sbs/__init__",
	"sbs_utils/agent",
	"sbs_utils/consoledispatcher",
	"sbs_utils/damagedispatcher",
	"sbs_utils/extra_dispatcher",
	"sbs_utils/faces",
	"sbs_utils/fs",
	"sbs_utils/futures",
	"sbs_utils/griddispatcher",
	"sbs_utils/gridobject",
	"sbs_utils/gui",
	"sbs_utils/handlerhooks",
	"sbs_utils/helpers",
	"sbs_utils/layout",
	"sbs_utils/lifetimedispatchers",
	"sbs_utils/objects",
	"sbs_utils/scatter",
	"sbs_utils/spaceobject",
	"sbs_utils/tickdispatcher",
	"sbs_utils/vec",
	"sbs_utils/mast/label",
	"sbs_utils/mast/mast",
	"sbs_utils/mast/mast_sbs_procedural",
	"sbs_utils/mast/mastmission",
	"sbs_utils/mast/mastobjects",
	"sbs_utils/mast/mastscheduler",
	"sbs_utils/mast/maststory",
	"sbs_utils/mast/maststorypage",
	"sbs_utils/mast/maststoryscheduler",
	"sbs_utils/mast/parsers",
	"sbs_utils/mast/pollresults",
	"sbs_utils/pages/avatar",
	"sbs_utils/pages/shippicker",
	"sbs_utils/pages/start",
	"sbs_utils/pages/layout/layout",
	"sbs_utils/pages/layout/text_area",
	"sbs_utils/pages/widgets/control",
	"sbs_utils/pages/widgets/layout_listbox",
	"sbs_utils/pages/widgets/listbox",
	"sbs_utils/pages/widgets/shippicker",
	"sbs_utils/procedural/behavior",
	"sbs_utils/procedural/comms",
	"sbs_utils/procedural/cosmos",
	"sbs_utils/procedural/execution",
	"sbs_utils/procedural/grid",
	"sbs_utils/procedural/gui",
	"sbs_utils/procedural/internal_damage",
	"sbs_utils/procedural/inventory",
	"sbs_utils/procedural/links",
	"sbs_utils/procedural/maps",
	"sbs_utils/procedural/query",
	"sbs_utils/procedural/roles",
	"sbs_utils/procedural/routes",
	"sbs_utils/procedural/science",
	"sbs_utils/procedural/screen_shot",
	"sbs_utils/procedural/ship_data",
	"sbs_utils/procedural/signal",
	"sbs_utils/procedural/space_objects",
	"sbs_utils/procedural/spawn",
	"sbs_utils/procedural/style",
	"sbs_utils/procedural/timers"
];

const supportedRoutes: string[][] = [];
export function getSupportedRoutes(): string[][] { return supportedRoutes; }



const sourceFiles: PyFile[] = []
export function getSourceFiles(): PyFile[] { return sourceFiles; }

async function loadTypings(): Promise<void> {
	try {
		//const { default: fetch } = await import("node-fetch");
		//const fetch = await import('node-fetch');
		//let github : string = "https://github.com/artemis-sbs/sbs_utils/raw/refs/heads/master/mock/sbs.py";
		let gh : string = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/typings/";
		for (const page in files) {
			let url = gh+files[page]+".pyi";
			const data = await fetch(url);
			const textData = await data.text();
			sourceFiles.push(parseWholeFile(textData, files[page]));
		}
		prepCompletions(sourceFiles);
		prepSignatures(sourceFiles);
	} catch (err) {
		debug("\nFailed to load\n"+err as string);
	}

}

const expressions: RX[] = [];
const exp: Map<string, RegExp> = new Map();
const defSource = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/sbs_utils/mast/mast.py";
const defSource2 = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/sbs_utils/mast/maststory.py";
async function getRexEx(src: string) :Promise<void> {
	const data = await fetch(src);
	const txt = await data.text();
	parse(txt, exp);
	
}

connection.onInitialize((params: InitializeParams) => {
	// These are only executed on startup
	loadTypings().then(()=>{ typingsDone = true; });
	loadRouteLabels().then(()=>{ debug("Routes Loaded") });
	getRexEx(defSource).then(()=>{ debug("Regular Expressions gotten")});
	getRexEx(defSource2).then(()=>{ debug("Regular Expressions 2 gotten")
		debug("Label?: ");
		debug(exp.get("Label"));
	});
	//const zip : Promise<void> = extractZip("","./sbs");

	//pyTypings = pyTypings.concat(parseTyping(fs.readFileSync("sbs.pyi","utf-8")));
	//debug(JSON.stringify(pyTypings));
	const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);
	//debugStrs += capabilities.textDocument?.documentLink + "\n";

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			inlineCompletionProvider: true,
			completionProvider: {
				resolveProvider: false, // FOR NOW - MAY USE LATER
				// TODO: The /, >, and especially the space are hopefully temporary workarounds.
				triggerCharacters: [".","/",">"," ","\""]
			},
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false
			},
			codeActionProvider: true,
			executeCommandProvider: {
				commands: [
					// TODO: Here we add the command names - for QuickFix
					//'labels.fix'
				]
			},
			signatureHelpProvider: {
				triggerCharacters: ['(',',']
			},
			hoverProvider: true
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

connection.onInitialized(() => {
	
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});

	}
	
});
connection.onCodeAction((params) => {
	const textDocument = documents.get(params.textDocument.uri);
	if (textDocument === undefined) {
		return undefined;
	}
	const title = 'With User Input';
	return [
		// TODO: Here we add CodeActions (i.e. commands) for QuickFixes
		//CodeAction.create(title, Command.create(title, 'sample.fixMe', textDocument.uri), CodeActionKind.QuickFix)
	];
});
connection.onExecuteCommand(async (params) => {
	//TODO: Here we execute the commands
	if (params.command !== 'labels.fix' || params.arguments === undefined) {
		return;
	}

	// const textDocument = documents.get(params.arguments[0]);
	// if (textDocument === undefined) {
	// 	return;
	// }
	// const newText = typeof params.arguments[1] === 'string' ? params.arguments[1] : 'Eclipse';
	// connection.workspace.applyEdit({
	// 	documentChanges: [
	// 		TextDocumentEdit.create({ uri: textDocument.uri, version: textDocument.version }, [
	// 			TextEdit.insert(Position.create(0, 0), newText)
	// 		])
	// 	]
	// });
});

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings = new Map<string, Thenable<ExampleSettings>>();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = (
			(change.settings.languageServerExample || defaultSettings)
		);
	}
	// Refresh the diagnostics since the `maxNumberOfProblems` could have changed.
	// We could optimize things here and re-fetch the setting first can compare it
	// to the existing setting, but this is out of scope for this example.
	connection.languages.diagnostics.refresh();
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'languageServerExample'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});


connection.languages.diagnostics.on(async (params) => {
	//TODO: get info from other files in same directory
	const document = documents.get(params.textDocument.uri);
	if (document !== undefined) {
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: await validateTextDocument(document)
		} satisfies DocumentDiagnosticReport;
	} else {
		// We don't know the document. We can either try to read it from disk
		// or we don't report problems for it.
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: []
		} satisfies DocumentDiagnosticReport;
	}
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	validateTextDocument(change.document);
});

export interface ErrorInstance {
	/**
	 * A regular expression of the diagnostic
	 */
	pattern: RegExp;
	/**
	 * The diagnostic's severity. Can be omitted. If omitted it is up to the
	 * client to interpret diagnostics as error, warning, info or hint.
	 */
	severity: DiagnosticSeverity;
	/**
	 * A human-readable string describing the source of this
	 * diagnostic, e.g. 'typescript' or 'super lint'. It usually
	 * appears in the user interface.
	 */
	source: string;
	/**
	 * The diagnostic's message. It usually appears in the user interface
	 */
	message: string;
	relatedMessage: string;
}

async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
	// In this simple example we get the settings for every validate run.
	const settings = await getDocumentSettings(textDocument.uri);
	
	getComments(textDocument);

	// The validator creates diagnostics for all uppercase words length 2 and more
	const text = textDocument.getText();
	currentDocument = textDocument;
	const pattern = /\b[A-Z]{2,}\b/g;
	let m: RegExpExecArray | null;

	let problems = 0;
	let diagnostics: Diagnostic[] = [];
	let errorSources: ErrorInstance[] = [];
	let e1: ErrorInstance = {
		pattern: /(^(=|-){2,}([0-9A-Za-z _]+?)(-|=)([0-9A-Za-z _]+?)(=|-){2,})/gm,
		severity: DiagnosticSeverity.Error,
		message: "Label Definition: Cannot use '-' or '=' inside label name.",
		source: "sbs",
		relatedMessage: "Only A-Z, a-z, 0-9, and _ are allowed to be used in a label name."
	};
	errorSources.push(e1);
	e1 = {
		pattern: /^[\w ][^+][^\"][\w\(\) ]+?\/\//g,
		severity: DiagnosticSeverity.Error,
		message: "Route labels can only be at the start of a line, unless used as label that runs when button is pressed.",
		source: "sbs",
		relatedMessage: "See https://artemis-sbs.github.io/sbs_utils/mast/routes/ for more details on routes."
	}
	e1 = {
		pattern: /\b[A-Z]{2,}\b/g,
		severity: DiagnosticSeverity.Information,
		source: "mast",
		message: "CAPS " + debugStrs,
		relatedMessage: "Is all caps intentional?"
	}
	//errorSources.push(e1);

	for (let i = 0; i < errorSources.length; i++) {
		let d1: Diagnostic[] = findDiagnostic(errorSources[i].pattern,textDocument,errorSources[i].severity,errorSources[i].message,errorSources[i].source, errorSources[i].relatedMessage, settings.maxNumberOfProblems,problems);
		diagnostics = diagnostics.concat(d1);
	}
	//let d1: Diagnostic[] = findDiagnostic(pattern, textDocument, DiagnosticSeverity.Error, "Message", "Source", "Testing", settings.maxNumberOfProblems, 0);
	//diagnostics = diagnostics.concat(d1);
	let d1 = checkLabels(textDocument);
	diagnostics = diagnostics.concat(d1);
	return diagnostics;
}



connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received a file change event');
});

/**
 * Triggered when ending a function name with an open parentheses, e.g. "functionName( "
 */
connection.onSignatureHelp((_textDocPos: SignatureHelpParams): SignatureHelp | undefined =>{
	//debug(functionData.length);
	const text = documents.get(_textDocPos.textDocument.uri);
	if (text === undefined) {
		return undefined;
	}
	return onSignatureHelp(_textDocPos,text);
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] | undefined => {
		const text = documents.get(_textDocumentPosition.textDocument.uri);
		if (text === undefined) {
			return [];
		}
		try {
			return onCompletion(_textDocumentPosition,text);
		} catch (e) {
			debug("onCompletion failure\n" + e);
			return undefined;
		}
	}
);

export function updateLabelNames(li: LabelInfo[]) {
	labelNames = li;
}

// This handler resolves additional information for the item selected in
// the completion list.

// connection.onCompletionResolve(
// 	(item: CompletionItem): CompletionItem => {
// 		if (item.data === 1) {
// 			item.detail = 'TypeScript details';
// 			item.documentation = 'TypeScript documentation';
// 		} else if (item.data === 2) {
// 			item.detail = 'JavaScript details';
// 			item.documentation = 'JavaScript documentation';
// 		}
// 		if (item.label === "sbs") {
// 			item.detail = "artemis_sbs details",
// 			item.documentation = "artemis_sbs details"
// 		}
// 		return item;
// 	}
// );

connection.onHover((_textDocumentPosition: TextDocumentPositionParams): Hover | undefined => {
	const text = documents.get(_textDocumentPosition.textDocument.uri);
	if (text === undefined) {
		debug("Undefined");
		return undefined;
	}
	return onHover(_textDocumentPosition,text);
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

export function debug(str:any) {
    if (str === undefined) {
        str = "UNDEFINED";
    }
    str = "\n" + str;
    fs.writeFileSync('outputLog.txt', str, { flag: "a+" });
	db(str);
	console.log(str);
}