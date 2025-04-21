"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePrefabs = parsePrefabs;
function parsePrefabs(labels) {
    let prefabs = [];
    const prefab = /type:[\t ]*prefab[\w\/]*(\n|$)/g;
    for (const l of labels) {
        let hasPrefab = l.metadata.match(prefab);
        if (hasPrefab !== null) {
            prefabs.push(l);
        }
    }
    return prefabs;
}
//# sourceMappingURL=prefabs.js.map