import { debug } from 'console';
import path = require('path');
import fs = require('fs');
import os = require('os');
import { readFile } from './fileFunctions';
import { CompletionItem, CompletionItemKind, MarkupContent } from 'vscode-languageserver';
import { connection, sendToClient } from './server';
import Hjson = require('hjson');
import { getGlobals } from './globals';
import sharp = require('sharp');


export class ShipData {
	roles: string[] = [];
	data: any[] = [];
	fileExists = false;
	validJSON = true;
	filePath: string = "";
	artemisDir: string;
	ships: Ship[] = [];
	constructor(artemisDir: string) {
		this.artemisDir = artemisDir;
		if (artemisDir === "") return;
		// try {
		// 	this.load();
		// } catch(e) {
		// 	debug(e);
		// }
	}

	load() {
		const file = path.join(this.artemisDir,"data","shipData.json");
		this.filePath = file;
		if (file !== null) {
			readFile(file).then((contents)=>{
				// contents = contents.replace(/\/\/.*?(\n|$)/gm,"");
				try {
					this.data = Hjson.parse(contents)["#ship-list"];
					
					this.validJSON = true;
					this.ships = this.parseShips();
					this.roles = this.parseRolesJSON();
				} catch (e) {
					const err = e as Error;
					this.validJSON = false;
					debug("shipData.json NOT parsed properly");
					debug(err);
					this.shipDataJsonError(err);
					this.roles = this.parseRolesText(contents);
				}
				// debug(this.data);
				// debug(typeof this.data[0]);
				this.fileExists = true;
				
			});
		} else {
			//throw new Error("shipData.json not found!");
			this.fileExists = false;
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
			sendToClient("showFile",this.filePath);
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
					roleList.push(l.trim());
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

		// Now that we know the 150p files exist, we can get them
		let ret = "!["+ artfileroot +"](/"+ tempFile +")\n![diffuse](/" + tempDiffuse + ")";
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
		let g = getGlobals();
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
					roles.push(l.trim());
				}
			}
			newRoles = ship["side"];
			if (newRoles) {
				const list = newRoles.split(",");
				for (const l of list) {
					roles.push(l.trim());
				}
			}
		}
		roles = [...new Set(roles)];
		return roles;
	}
	parseRolesText(contents: string): string[] {
		let roles: string[] = [];
		const lines = contents.split("\n");
		for (const line of lines) {
			if (line.trim().startsWith("\"roles\"") || line.trim().startsWith("\"side\"")) {
				const role = line.trim().replace("roles","").replace("side","").replace(/\"/g,"").replace(":","").trim();
				const list = role.split(",");
				for (const r of list) {
					if (r !== "") {
						roles.push(r.trim());
					}
				}
			}
		}
		roles = [...new Set(roles)];
		return roles
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