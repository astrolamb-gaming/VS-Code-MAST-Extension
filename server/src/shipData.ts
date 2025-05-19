import { debug } from 'console';
import path = require('path');
import { getFilesInDir, getFileContents, readFile } from './fileFunctions';
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import { getRolesAsCompletionItem } from './tokens/roles';
import { connection, sendToClient } from './server';
import Hjson = require('hjson');
import { getGlobals } from './globals';


export class ShipData {
	roles: string[] = [];
	data: any[] = [];
	fileExists = false;
	validJSON = true;
	filePath: string = "";
	artemisDir: string;
	constructor(artemisDir: string) {
		this.artemisDir = artemisDir;
		try {
			this.load();
		} catch(e) {
			debug(e);
		}
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
					// this.parseShips();
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
				roles: []
			}
			let key = d["key"];
			if (key) ship.key = key;
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
		}
		debug(ships);
		return ships;
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
		let ci: CompletionItem[] = getGlobals().artFiles;
		
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
	roles: string[]
}