import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { debug } from './extension';
import { WebviewPanel } from 'vscode';
import * as fs from 'fs';

let shipPanel: WebviewPanel | undefined = undefined;
let facePanel: WebviewPanel | undefined = undefined;
let iconPanel: WebviewPanel | undefined = undefined;

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
	diffuseUri?: string;
	specularUri?: string;
	emissiveUri?: string;
	normalUri?: string;
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

interface IconViewerIcon {
	index: string;
	filePath: string;
}

interface IconViewerPayload {
	artemisDir: string;
	icons: IconViewerIcon[];
	mode?: string;
	sourceUri?: string;
}

interface IconViewerEntry {
	index: string;
	imageUri: string;
}

interface ClassFunctionLocation {
	uri: string;
	line: number;
	character: number;
}

interface ClassFunctionItem {
	name: string;
	parameters?: string[];
	location?: ClassFunctionLocation;
}

export interface ClassFunctionListPayload {
	title?: string;
	classes: Array<ClassFunctionItem & { methods: ClassFunctionItem[] }>;
	globals: ClassFunctionItem[];
}

const MODEL_EXTENSIONS = ['.obj'];
const PREVIEW_SUFFIXES = ['.png', '256.png', '1024.png'];
const TEXTURE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];
const DIFFUSE_SUFFIXES = ['_d', '_diffuse', '_albedo', '_basecolor'];
const SPECULAR_SUFFIXES = ['_s', '_spec', '_specular'];
const EMISSIVE_SUFFIXES = ['_e', '_emit', '_emissive', '_illum', '_illumination'];
const NORMAL_SUFFIXES = ['_n', '_normal', '_norm'];

function getUserCosmosImagesDir(): string {
	return path.join(os.homedir(), 'Documents', 'Cosmos', 'cosmosImages');
}

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

function findTextureForArt(basePathNoExt: string, suffixes: string[]): string | undefined {
	for (const suffix of suffixes) {
		for (const ext of TEXTURE_EXTENSIONS) {
			const p = `${basePathNoExt}${suffix}${ext}`;
			if (fs.existsSync(p)) {
				return p;
			}
		}
	}
	return undefined;
}

function findTextureForAnyBase(basePathNoExtList: string[], suffixes: string[]): string | undefined {
	for (const basePathNoExt of basePathNoExtList) {
		const hit = findTextureForArt(basePathNoExt, suffixes);
		if (hit) {
			return hit;
		}
	}
	return undefined;
}

// Fallback lookup: case-insensitive match of <art>.obj, or any .obj whose name starts with the art root.
function findModelByScan(shipsDir: string, art: string, objFiles: string[]): { path: string; suffix: string } | undefined {
	const normalized = art.replace(/\\/g, '/').toLowerCase();
	const exact = objFiles.find((f) => f.toLowerCase() === normalized + '.obj');
	const hit = exact ?? objFiles.find((f) => f.toLowerCase().startsWith(normalized));
	return hit ? { path: path.join(shipsDir, hit), suffix: '.obj' } : undefined;
}

function listObjFiles(shipsDir: string): string[] {
	try {
		const files = fs.readdirSync(shipsDir, { recursive: true }) as string[];
		return files.map((f) => String(f).replace(/\\/g, '/')).filter((f) => f.toLowerCase().endsWith('.obj'));
	} catch (err) {
		debug('Could not list ships dir: ' + shipsDir + ' (' + String(err) + ')');
		return [];
	}
}

function findMtlFromObjPath(objPath: string): string | undefined {
	if (!fs.existsSync(objPath)) {
		return undefined;
	}

	try {
		const text = fs.readFileSync(objPath, 'utf8');
		const lines = text.split(/\r?\n/);
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) {
				continue;
			}

			const match = /^mtllib\s+(.+)$/i.exec(trimmed);
			if (!match) {
				continue;
			}

			const relativeMtl = match[1].trim();
			if (!relativeMtl) {
				continue;
			}

			const objDir = path.dirname(objPath);
			const resolved = path.resolve(objDir, relativeMtl);
			if (fs.existsSync(resolved)) {
				return resolved;
			}
		}
	} catch (err) {
		debug('Could not parse OBJ for mtllib: ' + objPath + ' (' + String(err) + ')');
	}

	return undefined;
}

function buildShipEntries(payload: ShipViewerPayload, panel: WebviewPanel): ShipViewerEntry[] {
	debug('buildShipEntries called, artemisDir: ' + payload.artemisDir);
	debug('Number of ships in payload: ' + (payload.ships?.length || 0));
	const shipsDir = path.join(payload.artemisDir, 'data', 'graphics');
	const cosmosImagesDir = getUserCosmosImagesDir();
	const entries: ShipViewerEntry[] = [];
	const objFiles = listObjFiles(shipsDir);

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
			const artBasePath = path.join(shipsDir, art);
			let textureBasePaths: string[] = [artBasePath];
			const modelHit = findFirstExisting(path.join(shipsDir, art), MODEL_EXTENSIONS)
				?? findModelByScan(shipsDir, art, objFiles);
			if (!modelHit) {
				debug('No model for art root "' + art + '" in ' + shipsDir);
			}
			if (modelHit) {
				entry.modelFormat = modelHit.suffix.replace('.', '').toLowerCase();
				entry.modelUri = panel.webview.asWebviewUri(vscode.Uri.file(modelHit.path)).toString();
				if (entry.modelFormat === 'obj') {
					const mtlPath = path.join(shipsDir, art + '.mtl');
					const resolvedMtlPath = fs.existsSync(mtlPath) ? mtlPath : findMtlFromObjPath(modelHit.path);
					if (resolvedMtlPath) {
						entry.mtlUri = panel.webview.asWebviewUri(vscode.Uri.file(resolvedMtlPath)).toString();
						const mtlParsed = path.parse(resolvedMtlPath);
						const mtlBasePath = path.join(mtlParsed.dir, mtlParsed.name);
						textureBasePaths = [mtlBasePath, artBasePath];
					}

					const diffusePath = findTextureForAnyBase(textureBasePaths, DIFFUSE_SUFFIXES);
					if (diffusePath) {
						entry.diffuseUri = panel.webview.asWebviewUri(vscode.Uri.file(diffusePath)).toString();
					}

					const specularPath = findTextureForAnyBase(textureBasePaths, SPECULAR_SUFFIXES);
					if (specularPath) {
						entry.specularUri = panel.webview.asWebviewUri(vscode.Uri.file(specularPath)).toString();
					}

					const emissivePath = findTextureForAnyBase(textureBasePaths, EMISSIVE_SUFFIXES);
					if (emissivePath) {
						entry.emissiveUri = panel.webview.asWebviewUri(vscode.Uri.file(emissivePath)).toString();
					}

					const normalPath = findTextureForAnyBase(textureBasePaths, NORMAL_SUFFIXES);
					if (normalPath) {
						entry.normalUri = panel.webview.asWebviewUri(vscode.Uri.file(normalPath)).toString();
					}
				}
			}

			const previewHit = findFirstExisting(path.join(shipsDir, art), PREVIEW_SUFFIXES)
				?? findFirstExisting(path.join(cosmosImagesDir, art), PREVIEW_SUFFIXES);
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

function buildIconEntries(payload: IconViewerPayload, panel: WebviewPanel): IconViewerEntry[] {
	const entries: IconViewerEntry[] = [];

	for (const icon of payload.icons || []) {
		const index = (icon.index || '').trim();
		const filePath = (icon.filePath || '').trim();
		if (!index || !filePath || !fs.existsSync(filePath)) {
			continue;
		}

		entries.push({
			index,
			imageUri: panel.webview.asWebviewUri(vscode.Uri.file(filePath)).toString()
		});
	}

	entries.sort((a, b) => {
		const ai = Number.parseInt(a.index, 10);
		const bi = Number.parseInt(b.index, 10);
		if (!Number.isNaN(ai) && !Number.isNaN(bi)) {
			return ai - bi;
		}
		return a.index.localeCompare(b.index);
	});

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

function buildIconViewerHtml(context: vscode.ExtensionContext, webview: vscode.Webview, entries: IconViewerEntry[], payload: IconViewerPayload): string {
	const nonce = getNonce();
	const mediaPath = path.join(context.extensionPath, 'client', 'src', 'media', 'icons.html');
	let template = fs.readFileSync(mediaPath, 'utf8');
	const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'client', 'src', 'media');
	const iconsCssUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'icons.css')).toString();
	const iconsJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'icons.js')).toString();
	const entriesJson = JSON.stringify(entries).replace(/</g, '\\u003c');
	const viewerConfigJson = JSON.stringify({
		mode: payload.mode || 'browse',
		sourceUri: payload.sourceUri || ''
	}).replace(/</g, '\\u003c');

	template = template.split('__CSP_SOURCE__').join(webview.cspSource);
	template = template.split('__NONCE__').join(nonce);
	template = template.split('__ICONS_CSS_URI__').join(iconsCssUri);
	template = template.split('__ICONS_JS_URI__').join(iconsJsUri);
	template = template.split('__ICON_ENTRIES_JSON__').join(entriesJson);
	template = template.split('__ICON_VIEWER_CONFIG_JSON__').join(viewerConfigJson);

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
	const cosmosImagesDir = getUserCosmosImagesDir();
	const targetColumn = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
	const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'client', 'src', 'media');
	debug('Ships directory: ' + shipsDir);
	const localRoots: vscode.Uri[] = [mediaRoot];
	localRoots.push(vscode.Uri.file(cosmosImagesDir));
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
		shipPanel.reveal(targetColumn);
	} else {
		debug('Creating new webview panel');
		shipPanel = vscode.window.createWebviewPanel(
			'shipViewer',
			'Ship 3D Viewer',
			targetColumn,
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
			if (!message) {
				return;
			}

			if (message.command === 'saveShipPreview') {
				const artFileRoot = typeof message.artFileRoot === 'string' ? message.artFileRoot.trim() : '';
				const dataUrl = typeof message.dataUrl === 'string' ? message.dataUrl : '';
				if (!artFileRoot || !dataUrl.startsWith('data:image/png;base64,')) {
					return;
				}

				try {
					fs.mkdirSync(cosmosImagesDir, { recursive: true });
					const outputPath = path.join(cosmosImagesDir, artFileRoot + '.png');
					const base64 = dataUrl.slice('data:image/png;base64,'.length);
					fs.writeFileSync(outputPath, Buffer.from(base64, 'base64'));
					const previewUri = shipPanel?.webview.asWebviewUri(vscode.Uri.file(outputPath)).toString();
					if (previewUri) {
						shipPanel?.webview.postMessage({
							command: 'shipPreviewSaved',
							artFileRoot,
							previewUri
						});
					}
				} catch (err) {
					debug('Failed to save ship preview: ' + String(err));
				}
				return;
			}

			if (message.command !== 'insertShipKey') {
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

export function generateIconWebview(context: vscode.ExtensionContext, payload: IconViewerPayload) {
	const targetColumn = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
	const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'client', 'src', 'media');
	const localRoots: vscode.Uri[] = [mediaRoot];
	if (payload?.artemisDir) {
		localRoots.push(vscode.Uri.file(payload.artemisDir));
	}

	const iconTempRoot = path.join(os.tmpdir(), 'cosmosImages', 'iconSets');
	if (fs.existsSync(iconTempRoot)) {
		localRoots.push(vscode.Uri.file(iconTempRoot));
	}

	if (iconPanel) {
		iconPanel.reveal(targetColumn);
	} else {
		iconPanel = vscode.window.createWebviewPanel(
			'iconViewer',
			'Grid Icon Viewer',
			targetColumn,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: localRoots
			}
		);

		iconPanel.onDidDispose(
			() => {
				iconPanel = undefined;
			},
			null,
			context.subscriptions
		);

		iconPanel.webview.onDidReceiveMessage(async (message) => {
			if (!message) {
				return;
			}

			if (message.command === 'insertIconIndex') {
				const index = typeof message.index === 'string' ? message.index : '';
				if (!index) {
					vscode.window.showWarningMessage('No icon index provided by icon viewer.');
					return;
				}

				const targetUri = typeof message.targetUri === 'string' ? message.targetUri : '';
				const inserted = await insertTextIntoEditor(targetUri, index);
				if (!inserted) {
					vscode.window.showWarningMessage('No active editor to insert icon index into.');
					return;
				}

				vscode.window.showInformationMessage('Inserted icon index: ' + index);
				iconPanel?.dispose();
				return;
			}

			if (message.command === 'copyIconIndex') {
				const index = typeof message.index === 'string' ? message.index : '';
				if (!index) {
					return;
				}

				await vscode.env.clipboard.writeText(index);
				vscode.window.showInformationMessage('Copied icon index: ' + index);
			}
		});

		context.subscriptions.push(iconPanel);
	}

	if (!iconPanel) {
		return;
	}

	const entries = buildIconEntries(payload, iconPanel);
	iconPanel.title = 'Grid Icon Viewer';
	iconPanel.webview.html = buildIconViewerHtml(context, iconPanel.webview, entries, payload);
}

export function generateClassFunctionWebview(context: vscode.ExtensionContext, payload: ClassFunctionListPayload) {
	const targetColumn = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
	const panel = vscode.window.createWebviewPanel(
		'classFunctionList',
		payload.title || 'MAST Classes and Functions',
		targetColumn,
		{ enableScripts: true, retainContextWhenHidden: true }
	);
	const nonce = getNonce();
	const payloadJson = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

	panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
	<title>MAST Classes and Functions</title>
	<style nonce="${nonce}">
		:root { color-scheme: light dark; }
		body { margin: 0; padding: 28px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
		main { max-width: 900px; margin: 0 auto; }
		h1 { margin: 0 0 6px; font-size: 22px; font-weight: 600; }
		.subtitle { margin: 0 0 24px; color: var(--vscode-descriptionForeground); }
		.search { box-sizing: border-box; width: 100%; margin: 0 0 16px; padding: 9px 11px; border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 6px; outline: none; color: var(--vscode-input-foreground); background: var(--vscode-input-background); font: inherit; }
		.search:focus { border-color: var(--vscode-focusBorder); }
		.listing { padding: 22px 26px; border: 1px solid var(--vscode-panel-border); border-radius: 10px; background: var(--vscode-editorWidget-background); font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); line-height: 1.8; overflow: auto; }
		.class-block { margin: 0 0 14px; }
		.class-line, .method-line, .global-line { white-space: pre; }
		.method-line { padding-left: 4ch; }
		.section-heading { margin-top: 12px; }
		.entry-link { padding: 0; border: 0; color: var(--vscode-textLink-foreground); background: transparent; font: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
		.entry-link:hover { color: var(--vscode-textLink-activeForeground); }
		.entry-name { color: var(--vscode-foreground); }
		.empty { color: var(--vscode-descriptionForeground); font-style: italic; }
	</style>
</head>
<body>
	<main>
		<h1>Classes and Functions</h1>
		<p class="subtitle">Click a class or function name to open its definition.</p>
		<input id="search" class="search" type="search" placeholder="Filter classes and functions…" aria-label="Filter classes and functions" />
		<section id="listing" class="listing" aria-label="Classes and functions"></section>
	</main>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const data = ${payloadJson};
		const listing = document.getElementById('listing');
		const search = document.getElementById('search');
		function addName(parent, item) {
			if (!item.location) {
				const label = document.createElement('span');
				label.className = 'entry-name';
				label.textContent = item.name;
				parent.appendChild(label);
				return;
			}
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'entry-link';
			button.textContent = item.name;
			button.addEventListener('click', () => vscode.postMessage({ command: 'openDefinition', location: item.location }));
			parent.appendChild(button);
		}
		function addFunctionLine(parent, item, className) {
			const line = document.createElement('div');
			line.className = className;
			line.appendChild(document.createTextNode('def '));
			addName(line, item);
			line.appendChild(document.createTextNode('(' + (item.parameters || []).join(',') + ')'));
			parent.appendChild(line);
		}
		function renderListing() {
			const query = search.value.trim().toLocaleLowerCase();
			listing.replaceChildren();
			let matchCount = 0;
			for (const classItem of data.classes || []) {
				const classMatches = classItem.name.toLocaleLowerCase().includes(query);
				const methods = (classItem.methods || []).filter((method) => classMatches || method.name.toLocaleLowerCase().includes(query));
				if (!classMatches && methods.length === 0) continue;
				matchCount++;
				const block = document.createElement('div');
				block.className = 'class-block';
				const heading = document.createElement('div');
				heading.className = 'class-line';
				heading.appendChild(document.createTextNode('class '));
				addName(heading, classItem);
				heading.appendChild(document.createTextNode(':'));
				block.appendChild(heading);
				for (const method of methods) addFunctionLine(block, method, 'method-line');
				listing.appendChild(block);
			}
			const globals = (data.globals || []).filter((item) => item.name.toLocaleLowerCase().includes(query));
			matchCount += globals.length;
			const globalsHeading = document.createElement('div');
			globalsHeading.className = 'section-heading';
			globalsHeading.textContent = 'globals:';
			listing.appendChild(globalsHeading);
			if (globals.length === 0) {
				const empty = document.createElement('div');
				empty.className = 'global-line empty';
				empty.textContent = query ? '    No matching global functions' : '    (none)';
				listing.appendChild(empty);
			} else {
				for (const globalFunction of globals) addFunctionLine(listing, globalFunction, 'global-line');
			}
			if (query && matchCount === 0) {
				const empty = document.createElement('div');
				empty.className = 'empty';
				empty.textContent = 'No matching classes or functions.';
				listing.prepend(empty);
			}
		}
		search.addEventListener('input', renderListing);
		renderListing();
	</script>
</body>
</html>`;

	panel.webview.onDidReceiveMessage(async (message) => {
		if (message?.command !== 'openDefinition' || typeof message.location?.uri !== 'string') {
			return;
		}
		const line = Number.isInteger(message.location.line) ? Math.max(0, message.location.line) : 0;
		const character = Number.isInteger(message.location.character) ? Math.max(0, message.location.character) : 0;
		try {
			const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(message.location.uri));
			const position = new vscode.Position(line, character);
			const editor = await vscode.window.showTextDocument(document, {
				viewColumn: targetColumn,
				preserveFocus: false,
				preview: false,
				selection: new vscode.Range(position, position)
			});
			editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
		} catch (error) {
			debug('Failed to open class/function definition: ' + String(error));
			vscode.window.showWarningMessage('Could not open the selected definition.');
		}
	});
	context.subscriptions.push(panel);
}

export function getWebviewContent(content: string): string {
	return content;
}