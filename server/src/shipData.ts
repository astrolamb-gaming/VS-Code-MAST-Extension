import { debug } from 'console';
import path = require('path');
import fs = require('fs');
import os = require('os');
import { fileFromUri, readFile } from './fileFunctions';
import { CompletionItem, CompletionItemKind, MarkupContent, Range } from 'vscode-languageserver';
import { connection, sendToClient, setProgress } from './server';
import Hjson = require('hjson');
import { getArtemisGlobals } from './artemisGlobals';
import sharp = require('sharp');
import { Word } from './tokens/words';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { pathToFileURL } from 'url';


export class ShipData {
	roles: Word[] = [];
	data: any[] = [];
	fileExists = false;
	validJSON = true;
	filePath: string = "";
	artemisDir: string;
	ships: Ship[] = [];
	textDoc:TextDocument|undefined;
	private loadPromise: Promise<void> | undefined;
	private reloadQueued = false;
	private watcher: fs.FSWatcher | undefined;
	private reloadTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(artemisDir: string) {
		this.artemisDir = artemisDir;
	}

	/** Watches only the ship data files, so unrelated changes in the data folder don't trigger a reload. */
	private startWatching() {
		if (this.watcher || this.artemisDir === "") return;
		const dataDir = path.join(this.artemisDir, "data");
		if (!fs.existsSync(dataDir)) return;
		this.watcher = fs.watch(dataDir, (eventType, filename) => {
			if (filename !== "shipData.yaml" && filename !== "shipData.json") return;
			clearTimeout(this.reloadTimer);
			this.reloadTimer = setTimeout(() => void this.load().catch((e) => debug(e)), 200);
		});
	}

	/**
	 * Loads the ship data. Calls made while a load is in progress share that load,
	 * and a single follow-up load is run if the data changed in the meantime.
	 */
	load(): Promise<void> {
		if (this.artemisDir === "") return Promise.resolve();
		this.startWatching();
		if (this.loadPromise) {
			this.reloadQueued = true;
			return this.loadPromise;
		}
		this.loadPromise = (async () => {
			try {
				do {
					this.reloadQueued = false;
					await this.loadInternal();
				} while (this.reloadQueued);
			} finally {
				this.loadPromise = undefined;
			}
		})();
		return this.loadPromise;
	}

	private async loadInternal(): Promise<void> {
		const progressId = `ship-data:${this.artemisDir}`;
		setProgress(progressId, true, 'Loading Ship Data');
		const yamlFile = path.join(this.artemisDir, "data", "shipData.yaml");
		const jsonFile = path.join(this.artemisDir, "data", "shipData.json");
		const file = fs.existsSync(yamlFile) ? yamlFile : jsonFile;
		this.filePath = file;
		this.fileExists = false;

		try {
			if (!fs.existsSync(file)) {
				return;
			}

			debug(`shipData: reading ${file}`);
			const contents = await readFile(file);
			debug(`shipData: read ${file}; parsing HJSON`);
			this.textDoc = TextDocument.create(file, path.extname(file), 0, contents);
			try {
				this.data = Hjson.parse(contents)["#ship-list"];
				this.validJSON = true;
				debug(`shipData: parsed ${this.data?.length ?? 0} entries; building ships`);
				this.ships = this.parseShips();
				debug(`shipData: built ${this.ships.length} ships`);
			} catch (e) {
				const err = e as Error;
				this.validJSON = false;
				debug("shipData.json NOT parsed properly");
				debug(err);
				void this.shipDataJsonError(err).catch((error) => debug(error));
			}

			this.roles = this.parseRolesText(this.textDoc);
			debug(`shipData: parsed roles from ${file}`);
			this.fileExists = true;
		} catch (e) {
			debug(`Unable to load ship data from ${file}`);
			debug(e);
		} finally {
			setProgress(progressId, false);
		}
	}

	async shipDataJsonError(err: Error) {
		let ret = await connection.window.showErrorMessage(
			"shipData.json contains an error:\n" + err.name + ": " + err.message,
			{title: "Open file to fix"},
			{title: "Ignore"},
			//{title: hide} // TODO: Add this later!!!!!!
		);
		if (ret === undefined) return;
		if (ret.title === "Open file to fix") {
			await sendToClient("showFile",this.filePath);
		} else if (ret.title === "Ignore") {}
	}

	parseShips(): Ship[] {
		const ships: Ship[] = [];
		for (const d of this.data) {
			const ship: Ship = {
				key: "",
				name: "",
				side: "",
				artFileRoot: "",
				roles: [],
				completionItem: {
					label: "",
					kind: CompletionItemKind.Text
				}
			}
			let key = d["key"];
			if (key) ship.key = key; ship.completionItem.label = key;
			let name = d["name"];
			if (name) ship.name = name;
			let side = d["side"];
			if (side) ship.side = side;
			let art = d["artfileroot"];
			if (art) ship.artFileRoot = art;
			let roles = d["roles"];
			if (roles) {
				const roleList = [];
				const list = roles.split(",");
				for (const l of list) {
					roleList.push(l.trim().toLowerCase());
				}
				ship.roles = roleList;
			}
			if (ship.key !== "") {
				ships.push(ship);
			}
			ship.completionItem.filterText = [
				key,
				name,
				side,
				roles
			].join(" ");
			// TODO: Add additional information about the shipdata entry
			const documentation: MarkupContent = {
				kind: 'markdown',
				value: this.findArtFile(art)
			}
			ship.completionItem.documentation = documentation;
		}
		// debug(ships);
		return ships;
	}

	private findArtFile(artfileroot: string): string {
		if (!artfileroot || artfileroot.trim() === '') {
			return "";
		}
		const tempPath = path.join(os.tmpdir(),"cosmosImages");
		if (!fs.existsSync(tempPath)) {
			fs.mkdirSync(tempPath, {recursive: true});
		}
		let tempFile = path.join(tempPath,artfileroot+"_150.png");
		let tempDiffuse = path.join(tempPath, artfileroot + "_diffuse_150.png");
		// Check if the 150p file exists
		if (!fs.existsSync(tempFile) || !fs.existsSync(tempDiffuse)) {
			// If it doesn't exist, we need to create the new file
			let artDir = path.join(this.artemisDir, "data", "graphics", "ships");

			// This should always exist
			let diffuse = path.join(artDir, artfileroot + "_diffuse.png");

			// At least one of these should exist...
			let png = path.join(artDir, artfileroot + ".png");
			if (!fs.existsSync(png)) {
				png = path.join(artDir, artfileroot + "256.png");
				if (!fs.existsSync(png)) {
					png = path.join(artDir, artfileroot + "1024.png")
					debug("PNG MAY NOT EXIST FOR " + png) 
					
				}
			}
			if (!fs.existsSync(png) || !fs.existsSync(diffuse)) {
				debug("WARNING, file not found: " + png);
			} else {
				// File definitely exists
				try {
					debug(tempFile)
					debug(tempDiffuse)
					sharp(png).resize(150,150).toFile(tempFile);
					sharp(diffuse).resize(150,150).toFile(tempDiffuse);
				} catch (e) {
					debug(tempFile);
					debug(tempDiffuse);
					debug(e);
					return "";
				}
			}
		}

		// Build markdown with file:// URIs so VS Code can render local images on all OSes.
		const shipImgUri = pathToFileURL(tempFile).toString();
		const diffuseImgUri = pathToFileURL(tempDiffuse).toString();
		let ret = `![${artfileroot}](${shipImgUri})\n![diffuse](${diffuseImgUri})`;
		// debug(ret);
		return ret;
	}

	parseArtJSON(): string[] {
		let art: string[] = [];
		for (const ship of this.data) {
			let key = ship["key"];
			if (key !== undefined && key !== null) art.push(key);
		}
		return art;
	}
	getShipInfoFromKey(key:string): string | undefined {
		for (const ship of this.data) {
			if (ship["key"] === key) {
				return ship;
			}
		}
		return undefined;
	}
	buildCompletionItemForShip(ship: any) {
		let ci: CompletionItem = {
			label: ship["key"],
			kind: CompletionItemKind.Text,
			insertText: ship["key"]
		};
		
		return ci;
	}
	getCompletionItemsForShips(): CompletionItem[] {
		let g = getArtemisGlobals();
		let ci: CompletionItem[] = g.artFiles;
		for (const c of ci) {
			const ship: any = this.getShipInfoFromKey(c.label);
			debug(ship);
			if (ship === undefined || ship["key"] == undefined) continue;
			c.label = ship["key"];
		}
		return ci;
	}
	parseRolesJSON(): string[] {
		let roles: string[] = [];
		for (const ship of this.data) {
			let newRoles = ship["roles"];
			if (newRoles) {
				const list = newRoles.split(",");
				for (const l of list) {
					roles.push(l.trim().toLowerCase());
				}
			}
			newRoles = ship["side"];
			if (newRoles) {
				const list = newRoles.split(",");
				for (const l of list) {
					roles.push(l.trim().toLowerCase());
				}
			}
		}
		roles = [...new Set(roles)];
		return roles;
	}
	parseRolesText(doc:TextDocument): Word[] {
		let ret: Word[] = [];
		const lines = doc.getText().split("\n");
		for (const line of lines) {
			if (line.trim().startsWith("\"roles\"") || line.trim().startsWith("\"side\"")) {
				const role = line.trim().replace("roles","").replace("side","").replace(/\"/g,"").replace(":","").trim();
				const list = role.split(",");
				for (let v of list) {
					v = v.trim().toLowerCase();
					if (v === "") {
						continue;
					}
					const start = line.indexOf(v.trim());
					const end = start + v.length;

					const range: Range = { start: doc.positionAt(start), end: doc.positionAt(end)}
					let found = false;
					for (const w of ret) {
						if (w.name === v) {
							for (const loc of w.locations) {
								if (loc.uri === doc.uri) {
									loc.ranges.push(range);
									found = true;
									break;
								}
							}
							if (!found) {
								w.locations.push({uri: fileFromUri(doc.uri), ranges: [range]});
								found = true;
							}
							break;
						}
					}
					if (!found) {
						let var1: Word = {
							name: v,
							locations: [{
								uri: fileFromUri(doc.uri),
								ranges: [range]
							}]
						}
						ret.push(var1);
					}
				}
			}
		}
		// roles = [...new Set(roles)];
		return ret
	}
}

export interface Ship {
	key: string,
	name: string,
	side: string,
	artFileRoot: string,
	roles: string[],
	completionItem: CompletionItem
}