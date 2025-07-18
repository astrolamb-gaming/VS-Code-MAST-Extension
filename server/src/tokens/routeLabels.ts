import { debug } from 'console';
import { CompletionItem, CompletionItemKind, CompletionItemLabelDetails, Diagnostic, DiagnosticSeverity, Position } from 'vscode-languageserver';
import { Range, TextDocument } from 'vscode-languageserver-textdocument';
import { parseLabelsInFile } from './labels';
import { getCache } from '../cache';

//const routeLabels: IRouteLabel[] = [];
//const mediaLabels: IRouteLabel[] = [];
const resourceLabels: IRouteLabel[] = [];
const supportedRoutes: string[][] = [];
const routeDefSource = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/sbs_utils/mast_sbs/story_nodes/route_label.py";
const mediaDefSource = "https://github.com/artemis-sbs/sbs_utils/blob/master/sbs_utils/procedural/media.py";
// const labelDetails: CompletionItemLabelDetails = {
// 	// Decided that this clutters up the UI too much. Same information is displayed in the CompletionItem details.
// 	//detail: "(" + params + ")",
// 	description: "Route Label"
// }

let skyboxes: CompletionItem[] = [];
export function getSkyboxCompletionItems(): CompletionItem[] {
	return skyboxes;
}

// Resource labels can use @ or // when called.
export function loadResourceLabels() {
	let resourceLabels: IRouteLabel[] = [];
	const resLabels = [
		"console/",
		"gui/tab/"
	];
	const resDetails = [
		"Console label - Go to or define a custom console",
		"gui/tab label - Make a client tab with the label name. When it is selected, the code within this label is executed."
	];
	for (const i in resLabels) {
		let docs = resDetails[i];//"Media label - loads skyboxes or music";
		const resourceLabelDetails: CompletionItemLabelDetails = {
			description: "Resource Label"
		}
		const ci = {
			label: resLabels[i],
			kind: CompletionItemKind.Event,
			labelDetails: resourceLabelDetails,
			documentation: docs
		};
		const ri: IRouteLabel = {
			route: resLabels[i],
			labels: resLabels[i].split("/"),
			completionItem: ci,
			type: IRouteLabelType.NOT_ENABLED
		}
		resourceLabels.push(ri);
	}
	return resourceLabels;
}

/**
 * Parse media.py for media types, for autocompletion purposes
 * May need to change this later if it is changed to use switch statement
 * Also gets other @ whatever options
 */
export function loadMediaLabels(textData: string = ""): IRouteLabel[] {
	let mediaLabels:IRouteLabel[] = [];
	const routes = ["skybox","music"];
	if (textData === "") {
		for (const route of routes) {
			let label = "media/" + route;
			let docs = "Media label - loads skyboxes or music";
			const mediaLabelDetails: CompletionItemLabelDetails = {
				description: "Media Label"
			}
			const ci = {
				label: label,
				kind: CompletionItemKind.Event,
				labelDetails: mediaLabelDetails,
				documentation: docs
			};
			const ri: IRouteLabel = {
				route: label,
				labels: label.split("/"),
				completionItem: ci,
				type: IRouteLabelType.NOT_ENABLED
			}
			//debug(label);
			mediaLabels.push(ri);
		}
		let label = "map";
		let docs = "Map label - defines a map. Typically only used at the beginning of a file";
		let mediaLabelDetails: CompletionItemLabelDetails = {
			description: "Map Label"
		}
		let ci = {
			label: label,
			kind: CompletionItemKind.Event,
			labelDetails: mediaLabelDetails,
			documentation: docs
		};
		let ri: IRouteLabel = {
			route: label,
			labels: label.split("/"),
			completionItem: ci,
			type: IRouteLabelType.NOT_ENABLED
		}
		mediaLabels.push(ri);
		return mediaLabels;
	}
	if (!textData.includes("_media_schedule")) {
		return mediaLabels;
	}
	try {
		// const data = await fetch(mediaDefSource);
		// debug("Getting media label info");
		// const textData = await data.text();
		let pattern = /def _media_schedule\(kind, label, ID=0\):.+?(def)/gs;
		let m: RegExpExecArray | null;
		while (m = pattern.exec(textData)) {
			let t = m[0];
			//debug(t);
			const ifPattern = /kind == \\\"\w+\\\":/g;
			let n: RegExpExecArray | null;
			while (n = ifPattern.exec(t)) {
				//debug(n[0]);
				let route = n[0].replace(/kind == \\\"/g,"").replace(/\\\":/g,"").trim();
				let label = "media/" + route;
				let docs = "Media label - loads skyboxes or music";
				const mediaLabelDetails: CompletionItemLabelDetails = {
					description: "Media Label"
				}
				const ci = {
					label: label,
					kind: CompletionItemKind.Event,
					labelDetails: mediaLabelDetails,
					documentation: docs
				};
				const ri: IRouteLabel = {
					route: label,
					labels: label.split("/"),
					completionItem: ci,
					type: IRouteLabelType.NOT_ENABLED
				}
				debug(label);
				mediaLabels.push(ri);
			}
		}

		let label = "map";
		let docs = "Map label - defines a map. Typically only used at the beginning of a file";
		let mediaLabelDetails: CompletionItemLabelDetails = {
			description: "Map Label"
		}
		let ci = {
			label: label,
			kind: CompletionItemKind.Event,
			labelDetails: mediaLabelDetails,
			documentation: docs
		};
		let ri: IRouteLabel = {
			route: label,
			labels: label.split("/"),
			completionItem: ci,
			type: IRouteLabelType.NOT_ENABLED
		}
		mediaLabels.push(ri);
		label = "media";
		docs = "Media label - loads skyboxes or music";
		mediaLabelDetails = {
			description: "Media Label"
		}
		ci = {
			label: label,
			kind: CompletionItemKind.Event,
			labelDetails: mediaLabelDetails,
			documentation: docs
		};
		ri = {
			route: label,
			labels: label.split("/"),
			completionItem: ci,
			type: IRouteLabelType.NOT_ENABLED
		}
		mediaLabels.push(ri);


	} catch (e) {
		debug(e);
	}
	return mediaLabels;
}

// I'd love to find a way to get all these programmatically, but for now....
// From procedural/routes.py
export function getRouteLabelVars(route:string) {

	let retVars: string[] = [];

	if (route.includes("collision")) {
		const vars = [
			"COLLISION_SOURCE_ID",
			"COLLISION_PARENT_ID",
			"COLLISION_TARGET_ID",
			"COLLISION_ORIGIN_ID",
			"COLLISION_SELECTED_ID"
		];
		retVars = retVars.concat(vars);
	}
	if (route.includes("damage")) {
		const vars = [
			"DAMAGE_ORIGIN_ID",
			"DAMAGE_PARENT_ID",
			"DAMAGE_SELECTED_ID",
			"DAMAGE_SOURCE_ID",
			"DAMAGE_TARGET_ID"
		];
		if (route.includes("destroy")) {
			retVars.push("DESTROYED_ID");
		} else if (route.includes("internal")) {
			retVars.push("DAMAGE_ORIGIN_ID");
		} else {
			retVars = retVars.concat(vars);
		}
	}


	const consoles = [
		"comms",
		"science",
		"helm",
		"weapons",
		"engineering",
		"dock"
	];

	const lifeCycle = ["spawn", "destory", "kill"];

	for (const con of consoles) {
		if (route.includes(con)) {
			if (con === "comms") {
				retVars.push("LIFEFORM_ID")
			}
			const caps = con.toUpperCase();
			const vars = [
				caps,
				caps+"_ID",
				caps+"_ORIGIN_ID",
				caps+"_ORIGIN",
				caps+"_PARENT_ID",
				caps+"_PARENT",
				caps+"_SELECTED_ID",
				caps+"_SELECTED"
			];
			if (con!=="dock") {
				vars.push(caps+"_POINT");
			}
			retVars = retVars.concat(vars);
		}
	}

	for (const life of lifeCycle) {
		if (route.includes(life)) {
			const caps = life.toUpperCase() + "ED";
			const vars = [
				caps+"_ID",
				caps
			];
			retVars = retVars.concat(vars);
		}
	}


	const uids = [
		["comms", "comms_target_UID"],
		["comms2d", "comms_2d_target_UID"],
		["science", "science_target_UID"],
		["weapons", "weapon_target_UID"],
		["grid", "grid_selected_UID"],
		["normal", "normal_target_UID"]
	];
	for (const arr of uids) {
		if (route.includes(arr[0])) {
			retVars.push(arr[1]);
		}
	}
	retVars.push("EVENT");
	return retVars;
}

/**
 * Parse any file containing the RouteDecoratorLabel class to get the route labels
 * TODO: Add all the provided variables
 */
export function loadRouteLabels(textData:string): IRouteLabel[] {

	let routeLabels: IRouteLabel[] = [];
	if (textData.includes("RouteDecoratorLabel") && textData.includes("generate_label_begin_cmds")) {
		debug("Route Labels");
	} else {
		return routeLabels;
	}
	try {
		//getResourceLabels();
		//loadMediaLabels();

		// const data = await fetch(routeDefSource);
		// const textData = await data.text();
		// Get the text of function that defines route labels
		// see route_label.py, and there is a chance that this changes in the future!!!!!
		let pattern = /RouteDecoratorLabel\(DecoratorLabel\):.+?generate_label_begin_cmds.+?[\s](def |class)/gs;
		let m: RegExpExecArray | null;
		while (m = pattern.exec(textData)) {
			let t = m[0];
			const casePattern = / case [^_.]*?:/gm;
			let n: RegExpExecArray | null;
			// Iterate over each "case...:" to find possible routes
			while (n = casePattern.exec(t)) {
				let routes = n[0].replace(/ (case \[)|\]:|"| /gm,"").trim();
				let arr = routes.split(",");
				supportedRoutes.push(arr);
				const label = arr.join("/").replace("*b","");

				let docs: string = "";
				if (label.startsWith("focus")) {
					docs = "This label runs when the focus is changed on a console. \nThis is similar to select, but will not run if the selected item was already selected.";
				} else if (label.startsWith("select")) {
					docs = "This label runs when a selection is changed on a console (e.g. a button press).";
				} else if (label.startsWith("point")) {
					docs = "This label runs when the 2D view is clicked.";
				} else if (label.startsWith("object")) {
					docs = "This label runs when a grid object arrives at a path location.";
				} else if (label.startsWith("console/change")) {
					docs = "This label runs when the user selects a console.";
				} else if (label.startsWith("console/mainscreen/change")) {
					docs = "This label runs when the user changes the camera mode.";
				} else if (label.startsWith("shared/signal")) {
					docs = "Signals are script defined events, emitted using the 'signal_emit()' function. \nOnly the server receives shared signals.";
				} else if (label.startsWith("signal")) {
					docs = "Signals are script defined events, emitted using the 'signal_emit()' function. \nThe server and all clients receive this signal.";
				} else if (label.startsWith("science")) {
					docs = "This label runs when an object is scanned. See 'https://artemis-sbs.github.io/sbs_utils/mast/routes/science/' for further details.";
				} else if (label.startsWith("spawn")) {
					docs = "This label runs whenever an object spawns. Use 'if has_roles()' if you only want this label to run for particular situations.";
					if (label.includes("spawn/grid")) { docs = "This label runs whenever a grid_object is spawned."; }
				} else if (label.startsWith("comms")) {
					docs = "Comms labels run when comms buttons are pressed. See 'https://artemis-sbs.github.io/sbs_utils/mast/routes/comms/' for further details.";
				} else if (label.startsWith("gui")) {
					docs = "See 'https://artemis-sbs.github.io/sbs_utils/mast/routes/gui/' for more details.";
				} else if (label.startsWith("collision")) {
					docs = "This label runs whenever a collision occurs.";
				} else if (label.startsWith("damage")) {
					docs = "This label runs whenever an object takes damage.";
				}
				
				let type = IRouteLabelType.NOT_ENABLED;
				if (label.includes("science") || label.includes("comms")) {
					type = IRouteLabelType.CAN_ENABLE;
				}

				const ci = {
					label: label,
					kind: CompletionItemKind.Event,
					documentation: docs
				};
				const ri: IRouteLabel = {
					route: label,
					labels: arr,
					completionItem: ci,
					type: type
				}
				//debug(ri);
				routeLabels.push(ri);
			}
		}
		pattern = /generate_label_end_cmds.+?[\s](def |class)/gs;
		while (m = pattern.exec(textData)) {
			let t = m[0];
			const casePattern = / case [^_.]*?:/gm;
			let n: RegExpExecArray | null;
			// Iterate over each "case...:" to find possible routes
			while (n = casePattern.exec(t)) {
				let routes = n[0].replace(/ (case \[)|\]:|"| /gm,"").trim();
				let arr = routes.split(",");
				supportedRoutes.push(arr);
				const label = arr.join("/").replace("*b","");
				let type = IRouteLabelType.NOT_ENABLED;
				let docs: string = "";

				if (label.startsWith("enable")) {
					type = IRouteLabelType.ENABLE;
					let l = arr[1];
					if (label.includes("grid/comms")) { l = "grid comms"; }
					l = label.replace(/\//g,"");
					docs = "This label enables " + l + " labels to run. \nDue to the potential of large numbers of objects triggering these types of label, use 'if has_roles()' or similar to limit how often it is triggered.";
				}

				const ci = {
					label: label,
					kind: CompletionItemKind.Event,
					documentation: docs
				};
				const ri: IRouteLabel = {
					route: label,
					labels: arr,
					completionItem: ci,
					type: type
				}
				routeLabels.push(ri);
			}
		}
	} catch (e) {
		debug("Error in loadRouteLabels(): " + e as string);
	}
	//debug(routeLabels);
	//throw new Error("Route Labels");
	return routeLabels;
}

export function getRoutesInFile(doc: TextDocument): string[] {
	let routes: string[] = [];
	let rx = /\/\/[\w\/]+/g;
	let m: RegExpExecArray | null;
	while (m = rx.exec(doc.getText())) {
		routes.push(m[0]);
	}
	return routes;
}

export interface IRouteLabel {
	route: string,
	labels: string[],
	completionItem: CompletionItem,
	type: IRouteLabelType
}

export enum IRouteLabelType {
	ENABLE,
	CAN_ENABLE,
	NOT_ENABLED
}

export function getRouteLabelAutocompletions(currentText: string): CompletionItem[] {
	const ci: CompletionItem[] = [];
	// for (const i in supportedRoutes) {
	// 	let r = supportedRoutes[i].join("/").replace("*b","");
	// 	if ((r + "//").includes(currentText.trim())) {
	// 		ci.push({label: r, kind: CompletionItemKind.Event});
	// 	}
	// }
	
	// for (const i in routeLabels) {
	// 	if (("//" + routeLabels[i].route).includes(currentText.trim())) {
	// 		ci.push(routeLabels[i].completionItem);
	// 	}
	// }
	// for (const ml of getGlobals().music) {
	// 	if (("@" + ml).includes(currentText.trim())) {
	// 		ci.push(mediaLabels[i].completionItem);
	// 	}
	// }
	for (const i in resourceLabels) {
		if (("//" + resourceLabels[i].route).includes(currentText.trim()) || ("@" + resourceLabels[i].route).includes(currentText.trim())) {
			ci.push(resourceLabels[i].completionItem);
		}
	}
	return ci;
}

export function checkEnableRoutes(textDocument:TextDocument) : Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const labels = parseLabelsInFile(textDocument.getText(),textDocument.uri);
	const needsEnable: string[] =[];
	const isEnabled: boolean[] = [];
	for (const l of getCache(textDocument.uri).routeLabels) {
		if (l.type === IRouteLabelType.ENABLE) {
			needsEnable.push(l.route.replace("enable","").replace("grid/comms","grid").replace(/\//g,""));
			isEnabled.push(false);
		}
		
	}
	for (const l of labels) {
		if (l.type === "route") {
			for (const ne in needsEnable) {
				if (l.name.includes(needsEnable[ne])) {
					if (l.name.includes("enable")) {
						isEnabled[ne] = true;
					}
				}
			}
		}
	}
	for (const l of labels) {
		if (l.type === "route") {
			for (const ne in needsEnable) {
				if (l.name.includes(needsEnable[ne]) && !l.name.includes("enable") &&!l.name.includes("focus")) {
					if (!isEnabled[ne]) {
						const s = textDocument.positionAt(l.start);
						const e = textDocument.positionAt(l.start + l.length);
						// TODO: Add QuickFix for this error - should be one of the easier ones to implement...
						const d:Diagnostic = {
							range: {start: s, end: e},
							message: 'Must use "//enable/' + l.name.replace(/\//g,"") + "\" before using this route.",
							severity: DiagnosticSeverity.Warning,
							data: "enable"
						}
						diagnostics.push(d);
					}
				}
			}
		}
	}
	return diagnostics;
}

