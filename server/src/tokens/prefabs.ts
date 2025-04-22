
import { LabelInfo } from './labels';


export function parsePrefabs(labels: LabelInfo[]): LabelInfo[] {
	let prefabs: LabelInfo[] = [];
	const prefab: RegExp = /type:[\t ]*prefab[\w\/]*(\n|$)/g;
	for (const l of labels) {
		let hasPrefab = l.metadata.match(prefab);
		if (hasPrefab !== null) {
			prefabs.push(l);
		}
	}
	return prefabs;
}
