import * as vscode from 'vscode';
import * as path from 'path';
import { debug } from './extension';
import { WebviewPanel } from 'vscode';
import * as fs from 'fs';

let shipPanel: WebviewPanel | undefined = undefined;
let facePanel: WebviewPanel | undefined = undefined;

interface ShipViewerShip {
	key: string;
	name: string;
	side: string;
	artFileRoot: string;
	roles: string[];
}

interface ShipViewerPayload {
	artemisDir: string;
	ships: ShipViewerShip[];
	mode?: string;
	argumentName?: string;
	sourceUri?: string;
}

interface ShipViewerEntry {
	key: string;
	name: string;
	side: string;
	roles: string[];
	artFileRoot: string;
	modelUri?: string;
	modelFormat?: string;
	mtlUri?: string;
	previewUri?: string;
}

interface FaceViewerFace {
	raceId: string;
	fileName: string;
}

interface FaceViewerPayload {
	artemisDir: string;
	faces: FaceViewerFace[];
	sourceUri?: string;
}

interface FaceViewerEntry {
	raceId: string;
	fileName: string;
	imageUri: string;
}

const MODEL_EXTENSIONS = ['.obj'];
const PREVIEW_SUFFIXES = ['.png', '256.png', '1024.png'];

function getNonce(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let i = 0; i < 32; i++) {
		nonce += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return nonce;
}

function findFirstExisting(basePathNoExt: string, suffixes: string[]): { path: string; suffix: string } | undefined {
	for (const suffix of suffixes) {
		const p = basePathNoExt + suffix;
		if (fs.existsSync(p)) {
			return { path: p, suffix };
		}
	}
	return undefined;
}

function findExistingPath(candidates: string[]): string | undefined {
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}
	return undefined;
}

function buildShipEntries(payload: ShipViewerPayload, panel: WebviewPanel): ShipViewerEntry[] {
	debug('buildShipEntries called, artemisDir: ' + payload.artemisDir);
	debug('Number of ships in payload: ' + (payload.ships?.length || 0));
	const shipsDir = path.join(payload.artemisDir, 'data', 'graphics', 'ships');
	const entries: ShipViewerEntry[] = [];

	for (const ship of payload.ships || []) {
		const art = (ship.artFileRoot || '').trim();
		const entry: ShipViewerEntry = {
			key: ship.key || '',
			name: ship.name || '',
			side: ship.side || '',
			roles: ship.roles || [],
			artFileRoot: art
		};

		if (art.length > 0) {
			const modelHit = findFirstExisting(path.join(shipsDir, art), MODEL_EXTENSIONS);
			if (modelHit) {
				entry.modelFormat = modelHit.suffix.replace('.', '').toLowerCase();
				entry.modelUri = panel.webview.asWebviewUri(vscode.Uri.file(modelHit.path)).toString();
				if (entry.modelFormat === 'obj') {
					const mtlPath = path.join(shipsDir, art + '.mtl');
					if (fs.existsSync(mtlPath)) {
						entry.mtlUri = panel.webview.asWebviewUri(vscode.Uri.file(mtlPath)).toString();
					}
				}
			}

			const previewHit = findFirstExisting(path.join(shipsDir, art), PREVIEW_SUFFIXES);
			if (previewHit) {
				entry.previewUri = panel.webview.asWebviewUri(vscode.Uri.file(previewHit.path)).toString();
			}
		}

		entries.push(entry);
	}

	entries.sort((a, b) => a.key.localeCompare(b.key));
	debug('buildShipEntries returning ' + entries.length + ' entries');
	return entries;
}

function buildFaceEntries(payload: FaceViewerPayload, panel: WebviewPanel): FaceViewerEntry[] {
	const graphicsDir = path.join(payload.artemisDir, 'data', 'graphics');
	const facesDir = path.join(graphicsDir, 'faces');
	const entries: FaceViewerEntry[] = [];

	for (const face of payload.faces || []) {
		const raceId = (face.raceId || '').trim();
		const fileName = (face.fileName || '').trim();
		if (!raceId || !fileName) {
			continue;
		}

		const normalizedName = fileName.replace(/\\/g, '/');
		const hasExtension = /\.[a-z0-9]+$/i.test(normalizedName);
		const candidates = [
			path.join(facesDir, hasExtension ? normalizedName : normalizedName + '.png'),
			path.join(graphicsDir, hasExtension ? normalizedName : normalizedName + '.png'),
			path.join(payload.artemisDir, hasExtension ? normalizedName : normalizedName + '.png'),
			path.join(facesDir, normalizedName),
			path.join(graphicsDir, normalizedName),
			path.join(payload.artemisDir, normalizedName)
		];
		const imagePath = findExistingPath(candidates);
		if (!imagePath) {
			continue;
		}

		entries.push({
			raceId,
			fileName,
			imageUri: panel.webview.asWebviewUri(vscode.Uri.file(imagePath)).toString()
		});
	}

	entries.sort((a, b) => a.raceId.localeCompare(b.raceId));
	return entries;
}

function buildShipViewerHtml(context: vscode.ExtensionContext, webview: vscode.Webview, entries: ShipViewerEntry[], payload: ShipViewerPayload): string {
	const nonce = getNonce();
	const mediaPath = path.join(context.extensionPath, 'client', 'src', 'media', 'ships.html');
	let template = fs.readFileSync(mediaPath, 'utf8');

	const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'client', 'src', 'media');
	const shipsCssUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'ships.css')).toString();
	const shipsJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'ships.js')).toString();

	const entriesJson = JSON.stringify(entries).replace(/</g, '\\u003c');
	const viewerConfigJson = JSON.stringify({
		mode: payload.mode || 'browse',
		argumentName: payload.argumentName || '',
		sourceUri: payload.sourceUri || ''
	}).replace(/</g, '\\u003c');
	const importMapJson = JSON.stringify({
		imports: {
			three: 'https://unpkg.com/three@0.161.0/build/three.module.js',
			'three/addons/': 'https://unpkg.com/three@0.161.0/examples/jsm/'
		}
	});

	template = template.split('__CSP_SOURCE__').join(webview.cspSource);
	template = template.split('__NONCE__').join(nonce);
	template = template.split('__SHIPS_CSS_URI__').join(shipsCssUri);
	template = template.split('__SHIPS_JS_URI__').join(shipsJsUri);
	template = template.split('__SHIP_ENTRIES_JSON__').join(entriesJson);
	template = template.split('__SHIP_VIEWER_CONFIG_JSON__').join(viewerConfigJson);
	template = template.split('__IMPORT_MAP__').join(importMapJson);

	return template;
}

function buildFaceViewerHtml(context: vscode.ExtensionContext, webview: vscode.Webview, entries: FaceViewerEntry[], payload: FaceViewerPayload): string {
	const nonce = getNonce();
	const mediaPath = path.join(context.extensionPath, 'client', 'src', 'media', 'faces.html');
	let template = fs.readFileSync(mediaPath, 'utf8');
	const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'client', 'src', 'media');
	const facesCssUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'faces.css')).toString();
	const facesJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'faces.js')).toString();
	const entriesJson = JSON.stringify(entries).replace(/</g, '\\u003c');
	const viewerConfigJson = JSON.stringify({
		sourceUri: payload.sourceUri || ''
	}).replace(/</g, '\\u003c');

	template = template.split('__CSP_SOURCE__').join(webview.cspSource);
	template = template.split('__NONCE__').join(nonce);
	template = template.split('__FACES_CSS_URI__').join(facesCssUri);
	template = template.split('__FACES_JS_URI__').join(facesJsUri);
	template = template.split('__FACE_ENTRIES_JSON__').join(entriesJson);
	template = template.split('__FACE_VIEWER_CONFIG_JSON__').join(viewerConfigJson);

	return template;
}

async function resolveTargetEditor(targetUri: string): Promise<vscode.TextEditor | undefined> {
	let editor = vscode.window.activeTextEditor;
	if (!targetUri) {
		return editor;
	}

	try {
		const parsedUri = vscode.Uri.parse(targetUri);
		const existingEditor = vscode.window.visibleTextEditors.find(
			e => e.document.uri.toString() === parsedUri.toString()
		);
		if (existingEditor) {
			return vscode.window.showTextDocument(existingEditor.document, {
				viewColumn: existingEditor.viewColumn,
				preview: false,
				preserveFocus: false
			});
		}

		const doc = await vscode.workspace.openTextDocument(parsedUri);
		editor = await vscode.window.showTextDocument(doc, {
			viewColumn: vscode.ViewColumn.One,
			preview: false,
			preserveFocus: false
		});
	} catch (e) {
		debug('Failed to focus target document: ' + e);
	}

	return editor;
}

function isEscaped(text: string, index: number): boolean {
	let slashCount = 0;
	for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
		slashCount++;
	}
	return slashCount % 2 === 1;
}

function countUnescapedQuote(text: string, quote: '"' | "'"): number {
	let count = 0;
	for (let i = 0; i < text.length; i++) {
		if (text[i] === quote && !isEscaped(text, i)) {
			count++;
		}
	}
	return count;
}

function shouldStripOuterQuotes(editor: vscode.TextEditor, selection: vscode.Selection, text: string): boolean {
	if (text.length < 2) {
		return false;
	}

	const first = text[0];
	const last = text[text.length - 1];
	if ((first !== '"' && first !== "'") || first !== last) {
		return false;
	}

	const quote = first as '"' | "'";
	const position = selection.start;
	const lineText = editor.document.lineAt(position.line).text;
	const before = lineText.slice(0, position.character);
	const after = lineText.slice(position.character);

	const unescapedBeforeCount = countUnescapedQuote(before, quote);
	const unescapedAfterCount = countUnescapedQuote(after, quote);

	// Insert is inside an existing quoted string of the same quote style.
	return unescapedBeforeCount % 2 === 1 && unescapedAfterCount > 0;
}

function normalizeInsertionText(editor: vscode.TextEditor, selection: vscode.Selection, text: string): string {
	if (shouldStripOuterQuotes(editor, selection, text)) {
		return text.slice(1, -1);
	}
	return text;
}

async function insertTextIntoEditor(targetUri: string, text: string): Promise<boolean> {
	if (!text) {
		return false;
	}

	const editor = await resolveTargetEditor(targetUri);
	if (!editor) {
		return false;
	}

	await editor.edit((editBuilder) => {
		for (const selection of editor.selections) {
			const insertionText = normalizeInsertionText(editor, selection, text);
			if (selection.isEmpty) {
				editBuilder.insert(selection.active, insertionText);
			} else {
				editBuilder.replace(selection, insertionText);
			}
		}
	});

	return true;
}

export function generateShipWebview(context: vscode.ExtensionContext, payload: ShipViewerPayload) {
	debug('generateShipWebview called with payload: ' + JSON.stringify(payload ? { artemisDir: payload.artemisDir, shipCount: payload.ships?.length } : 'null'));
	debug('artemisDir: ' + payload?.artemisDir);
	debug('Number of ships: ' + (payload?.ships?.length || 0));
	const shipsDir = path.join(payload.artemisDir, 'data', 'graphics', 'ships');
	const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'client', 'src', 'media');
	debug('Ships directory: ' + shipsDir);
	const localRoots: vscode.Uri[] = [mediaRoot];
	if (payload?.artemisDir) {
		localRoots.push(vscode.Uri.file(payload.artemisDir));
	}
	if (fs.existsSync(shipsDir)) {
		debug('Ships directory exists');
		localRoots.push(vscode.Uri.file(shipsDir));
	} else {
		debug('Ships directory does NOT exist: ' + shipsDir);
	}

	if (shipPanel) {
		debug('Panel already exists, revealing');
		shipPanel.reveal();
	} else {
		debug('Creating new webview panel');
		shipPanel = vscode.window.createWebviewPanel(
			'shipViewer',
			'Ship 3D Viewer',
			vscode.ViewColumn.Two,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: localRoots
			}
		);

		shipPanel.onDidDispose(
			() => {
				debug('Panel disposed');
				shipPanel = undefined;
			},
			null,
			context.subscriptions
		);

		shipPanel.webview.onDidReceiveMessage(async (message) => {
			if (!message || message.command !== 'insertShipKey') {
				return;
			}

			const key = typeof message.key === 'string' ? message.key : '';
			if (!key) {
				vscode.window.showWarningMessage('No ship key provided by ship picker.');
				return;
			}

			const targetUri = typeof message.targetUri === 'string' ? message.targetUri : '';
			const inserted = await insertTextIntoEditor(targetUri, key);
			if (!inserted) {
				vscode.window.showWarningMessage('No active editor to insert ship key into.');
				return;
			}

			vscode.window.showInformationMessage('Inserted ship key: ' + key);
			shipPanel?.dispose();
		});

		context.subscriptions.push(shipPanel);
	}

	if (!shipPanel) {
		return;
	}

	shipPanel.title = 'Ship 3D Viewer';
	debug('Building ship entries...');
	const entries = buildShipEntries(payload, shipPanel);
	debug('Built ' + entries.length + ' ship entries');
	debug('Building webview HTML...');
	shipPanel.webview.html = buildShipViewerHtml(context, shipPanel.webview, entries, payload);
	debug('Webview HTML set, webview should now display');
}

export function generateFaceWebview(context: vscode.ExtensionContext, payload: FaceViewerPayload) {
	const graphicsDir = path.join(payload.artemisDir, 'data', 'graphics');
	const facesDir = path.join(graphicsDir, 'faces');
	const targetColumn = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
	const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'client', 'src', 'media');
	const localRoots: vscode.Uri[] = [mediaRoot];
	if (payload?.artemisDir) {
		localRoots.push(vscode.Uri.file(payload.artemisDir));
	}
	if (fs.existsSync(graphicsDir)) {
		localRoots.push(vscode.Uri.file(graphicsDir));
	}
	if (fs.existsSync(facesDir)) {
		localRoots.push(vscode.Uri.file(facesDir));
	}

	if (facePanel) {
		facePanel.reveal(targetColumn);
	} else {
		facePanel = vscode.window.createWebviewPanel(
			'faceBuilder',
			'Face String Builder',
			targetColumn,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: localRoots
			}
		);

		facePanel.onDidDispose(
			() => {
				facePanel = undefined;
			},
			null,
			context.subscriptions
		);

		facePanel.webview.onDidReceiveMessage(async (message) => {
			if (!message) {
				return;
			}

			if (message.command === 'insertFaceString') {
				const value = typeof message.value === 'string' ? message.value : '';
				if (!value) {
					vscode.window.showWarningMessage('No face string provided by face builder.');
					return;
				}

				const targetUri = typeof message.targetUri === 'string' ? message.targetUri : '';
				const inserted = await insertTextIntoEditor(targetUri, value);
				if (!inserted) {
					vscode.window.showWarningMessage('No active editor to insert face string into.');
					return;
				}

				vscode.window.showInformationMessage('Inserted generated face string.');
				facePanel?.dispose();
				return;
			}

			if (message.command === 'copyFaceString') {
				const value = typeof message.value === 'string' ? message.value : '';
				if (!value) {
					return;
				}
				await vscode.env.clipboard.writeText(value);
				vscode.window.showInformationMessage('Copied generated face string to clipboard.');
			}
		});

		context.subscriptions.push(facePanel);
	}

	if (!facePanel) {
		return;
	}

	const entries = buildFaceEntries(payload, facePanel);
	facePanel.title = 'Face String Builder';
	facePanel.webview.html = buildFaceViewerHtml(context, facePanel.webview, entries, payload);
}

export function getWebviewContent(content: string): string {
	return content;
}