import { debug } from './server';
import { CompletionItem, CompletionItemKind, CompletionItemLabelDetails } from 'vscode-languageserver';

const routeLabels: IRouteLabel[] = [];
const supportedRoutes: string[][] = [];
const routeDefSource = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/sbs_utils/mast/mast.py";
const labelDetails: CompletionItemLabelDetails = {
	// Decided that this clutters up the UI too much. Same information is displayed in the CompletionItem details.
	//detail: "(" + params + ")",
	description: "Route Label"
}
/**
 * Parse the sbs_utils/mast/mast.py file to find all the valid route labels
 * TODO: Add all the provided variables
 */
export async function loadRouteLabels(): Promise<void> {
	try {
		const data = await fetch(routeDefSource);
		const textData = await data.text();
		// Get the text of function that defines route labels
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
				

				const ci = {
					label: label,
					kind: CompletionItemKind.Event,
					labelDetails: labelDetails,
					documentation: docs
				};
				const ri: IRouteLabel = {
					route: label,
					labels: arr,
					completionItem: ci
				}
				routeLabels.push(ri);
			}
		}
		pattern = /RouteDecoratorLabel\(DecoratorLabel\):.+?generate_label_end_cmds.+?[\s](def |class)/gs;
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

				if (label.startsWith("enable")) {
					let l = arr[1];
					if (label.includes("grid/comms")) { l = "grid comms"; }
					l = label.replace(/\//g,"");
					docs = "This label enables " + l + " labels to run. \nDue to the potential of large numbers of objects triggering these types of label, use 'if has_roles()' or similar to limit how often it is triggered.";
				}

				const ci = {
					label: label,
					kind: CompletionItemKind.Event,
					labelDetails: labelDetails,
					documentation: docs
				};
				const ri: IRouteLabel = {
					route: label,
					labels: arr,
					completionItem: ci
				}
				routeLabels.push(ri);
			}
		}
	} catch (e) {
		debug("Error in loadRouteLabels(): " + e as string);
	}
}

export interface IRouteLabel {
	route: string,
	labels: string[],
	completionItem: CompletionItem
}

export function getRouteLabelAutocompletions(currentText: string): CompletionItem[] {
	const ci: CompletionItem[] = [];
	// for (const i in supportedRoutes) {
	// 	let r = supportedRoutes[i].join("/").replace("*b","");
	// 	if ((r + "//").includes(currentText.trim())) {
	// 		ci.push({label: r, kind: CompletionItemKind.Event});
	// 	}
	// }
	for (const i in routeLabels) {
		if (("//" + routeLabels[i].route).includes(currentText.trim())) {
			ci.push(routeLabels[i].completionItem);
		}
	}
	return ci;
}