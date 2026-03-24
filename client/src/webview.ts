import * as vscode from 'vscode';
import * as path from 'path';
import { debug } from './extension';
import { WebviewPanel } from 'vscode';
import * as fs from 'fs';

let panel: WebviewPanel | undefined = undefined;

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

function buildShipViewerHtml(context: vscode.ExtensionContext, webview: vscode.Webview, entries: ShipViewerEntry[]): string {
	const nonce = getNonce();
	const mediaPath = path.join(context.extensionPath, 'client', 'src', 'media', 'ships.html');
	let template = fs.readFileSync(mediaPath, 'utf8');

	const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'client', 'src', 'media');
	const shipsCssUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'ships.css')).toString();
	const shipsJsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'ships.js')).toString();

	const entriesJson = JSON.stringify(entries).replace(/</g, '\\u003c');
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
	template = template.split('__IMPORT_MAP__').join(importMapJson);

	return template;
}

export function generateShipWebview(context: vscode.ExtensionContext, payload: ShipViewerPayload) {
	debug('generateShipWebview called with payload: ' + JSON.stringify(payload ? { artemisDir: payload.artemisDir, shipCount: payload.ships?.length } : 'null'));
	debug('artemisDir: ' + payload?.artemisDir);
	debug('Number of ships: ' + (payload?.ships?.length || 0));
	const shipsDir = path.join(payload.artemisDir, 'data', 'graphics', 'ships');
	const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'client', 'src', 'media');
	debug('Ships directory: ' + shipsDir);
	const localRoots: vscode.Uri[] = [
		mediaRoot
	];
	if (payload?.artemisDir) {
		localRoots.push(vscode.Uri.file(payload.artemisDir));
	}
	if (fs.existsSync(shipsDir)) {
		debug('Ships directory exists');
		localRoots.push(vscode.Uri.file(shipsDir));
	} else {
		debug('Ships directory does NOT exist: ' + shipsDir);
	}

	if (panel) {
		debug('Panel already exists, revealing');
		panel.reveal();
	} else {
		debug('Creating new webview panel');
		panel = vscode.window.createWebviewPanel(
			'shipViewer',
			'Ship 3D Viewer',
			vscode.ViewColumn.Two,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: localRoots
			}
		);

		panel.onDidDispose(
			() => {
				debug('Panel disposed');
				panel = undefined;
			},
			null,
			context.subscriptions
		);
		context.subscriptions.push(panel);
	}

	if (!panel) {
		return;
	}

	panel.title = 'Ship 3D Viewer';
	debug('Building ship entries...');
	const entries = buildShipEntries(payload, panel);
	debug('Built ' + entries.length + ' ship entries');
	debug('Building webview HTML...');
	panel.webview.html = buildShipViewerHtml(context, panel.webview, entries);
	debug('Webview HTML set, webview should now display');

}

export function getWebviewContent(content:string): string {
	return content;
}