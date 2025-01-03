"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadRouteLabels = loadRouteLabels;
exports.getRouteLabelAutocompletions = getRouteLabelAutocompletions;
const console_1 = require("console");
const vscode_languageserver_1 = require("vscode-languageserver");
const routeLabels = [];
const supportedRoutes = [];
const routeDefSource = "https://raw.githubusercontent.com/artemis-sbs/sbs_utils/master/sbs_utils/mast/mast.py";
const labelDetails = {
    // Decided that this clutters up the UI too much. Same information is displayed in the CompletionItem details.
    //detail: "(" + params + ")",
    description: "Route Label"
};
/**
 * Parse the sbs_utils/mast/mast.py file to find all the valid route labels
 * TODO: Add all the provided variables
 */
async function loadRouteLabels() {
    try {
        const data = await fetch(routeDefSource);
        const textData = await data.text();
        // Get the text of function that defines route labels
        const pattern = /RouteDecoratorLabel\(DecoratorLabel\):.+?generate_label_begin_cmds.+?[\s](def |class)/gs;
        let m;
        while (m = pattern.exec(textData)) {
            let t = m[0];
            const casePattern = / case [^_.]*?:/gm;
            let n;
            // Iterate over each "case...:" to find possible routes
            while (n = casePattern.exec(t)) {
                let routes = n[0].replace(/ (case \[)|\]:|"| /gm, "").trim();
                let arr = routes.split(",");
                supportedRoutes.push(arr);
                const label = arr.join("/").replace("*b", "");
                let docs = "";
                if (label.startsWith("focus")) {
                    docs = "This label runs when the focus is changed on a console. \nThis is similar to select, but will not run if the selected item was already selected.";
                }
                else if (label.startsWith("select")) {
                    docs = "This label runs when a selection is changed on a console (e.g. a button press).";
                }
                else if (label.startsWith("point")) {
                    docs = "This label runs when the 2D view is clicked.";
                }
                else if (label.startsWith("object")) {
                    docs = "This label runs when a grid object arrives at a path location.";
                }
                else if (label.startsWith("console/change")) {
                    docs = "This label runs when the user selects a console.";
                }
                else if (label.startsWith("console/mainscreen/change")) {
                    docs = "This label runs when the user changes the camera mode.";
                }
                else if (label.startsWith("enable")) {
                    let l = arr[1];
                    if (label.includes("grid/comms")) {
                        l = "grid comms";
                    }
                    docs = "This label enables " + l + " labels to run. \nDue to the potential of large numbers of objects triggering these types of label, limit using 'if has_roles()' or similar.";
                }
                else if (label.startsWith("shared/signal")) {
                    docs = "Signals are script defined events, emitted using the 'signal_emit()' function. \nOnly the server receives shared signals.";
                }
                else if (label.startsWith("signal")) {
                    docs = "Signals are script defined events, emitted using the 'signal_emit()' function. \nThe server and all clients receive this signal.";
                }
                else if (label.startsWith("science")) {
                    docs = "This label runs when an object is scanned. See 'https://artemis-sbs.github.io/sbs_utils/mast/routes/science/' for further details.";
                }
                else if (label.startsWith("spawn")) {
                    docs = "This label runs whenever an object spawns. Use 'if has_roles()' if you only want this label to run for particular situations.";
                    if (label.includes("spawn/grid")) {
                        docs = "This label runs whenever a grid_object is spawned.";
                    }
                }
                else if (label.startsWith("comms")) {
                    docs = "Comms labels run when comms buttons are pressed. See 'https://artemis-sbs.github.io/sbs_utils/mast/routes/comms/' for further details.";
                }
                else if (label.startsWith("gui")) {
                    docs = "See 'https://artemis-sbs.github.io/sbs_utils/mast/routes/gui/' for more details.";
                }
                else if (label.startsWith("collision")) {
                    docs = "This label runs whenever a collision occurs.";
                }
                else if (label.startsWith("damage")) {
                    docs = "This label runs whenever an object takes damage.";
                }
                const ci = {
                    label: label,
                    kind: vscode_languageserver_1.CompletionItemKind.Event,
                    labelDetails: labelDetails,
                    documentation: docs
                };
                const ri = {
                    route: label,
                    labels: arr,
                    completionItem: ci
                };
                routeLabels.push(ri);
            }
        }
    }
    catch (e) {
        (0, console_1.debug)("Error in loadRouteLabels(): " + e);
    }
}
function getRouteLabelAutocompletions(currentText) {
    const ci = [];
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
//# sourceMappingURL=routeLabels.js.map