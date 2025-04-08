import { debug } from 'console';
import path = require('path');
import { getFilesInDir, getFileContents, readFile } from './fileFunctions';
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import { getRolesAsCompletionItem } from './roles';


export class ShipData {
	roles: string[] = [];
	data: any[] = [];
	fileExists = false;
	validJSON = true;
	constructor(artemisDir: string) {
		
		try {
			this.load(artemisDir);
		} catch(e) {
			debug(e);
		}
	}

	load(artemisDir: string) {
		const file = path.join(artemisDir,"data","shipData.json");
		if (file !== null) {
			readFile(file).then((contents)=>{
				contents = contents.replace(/\/\/.*?(\n|$)/gm,"");
				try {
					this.data = JSON.parse(contents)["#ship-list"];
					this.validJSON = true;
					this.roles = this.parseRolesJSON();
				} catch (e) {
					this.validJSON = false;
					debug("shipData.json NOT parsed properly");
					debug(e);
					this.roles = this.parseRolesText(contents);
				}
				debug(this.data);
				this.fileExists = true;
				
			});
		} else {
			//throw new Error("shipData.json not found!");
			this.fileExists = false;
		}
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