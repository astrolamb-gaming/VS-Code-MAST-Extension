import { debug } from 'console';
import path = require('path');
import { getFilesInDir, getFileContents, readFile } from './fileFunctions';
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import { getRolesAsCompletionItem } from './roles';


export class ShipData {
	roles: CompletionItem[] = [];
	data: any[] = [];
	fileExists = false;
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
				} catch (e) {
					debug("shipData.json NOT parsed properly");
					debug(e);
				}
				debug(this.data);
				this.fileExists = true;
				this.roles = this.parseRoles();
			});
		} else {
			//throw new Error("shipData.json not found!");
			this.fileExists = false;
		}
	}
	parseRoles(): CompletionItem[] {
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
		return getRolesAsCompletionItem(roles);
	}
}