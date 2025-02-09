"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getYaml = getYaml;
const comments_1 = require("./comments");
function getYaml(textDocument) {
    const text = textDocument.getText();
    let yamls = [];
    let yaml = /^\\s*---$.*^\\s*?...$/gms;
    yamls = (0, comments_1.getMatchesForRegex)(yaml, text);
    //debug(strings);
    //stringRanges = yamls;
    //debug("Strings found: " + strings.length);
    return yamls;
}
//# sourceMappingURL=yaml_injection.js.map