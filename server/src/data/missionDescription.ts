import * as fs from 'fs';
import * as path from 'path';
import { debug } from 'console';
import { load as loadYaml, YAMLException } from 'js-yaml';

export type MissionDescription = Record<string, unknown>;

/**
 * Reads description.yaml from a mission folder.
 * @returns the parsed description, or undefined if the file is missing or isn't a YAML mapping.
 */
export function readMissionDescription(missionFolder: string): MissionDescription | undefined {
	const descriptionPath = path.join(missionFolder, 'description.yaml');
	if (!fs.existsSync(descriptionPath)) return undefined;
	let parsed: unknown;
	try {
		parsed = loadYaml(fs.readFileSync(descriptionPath, 'utf8'));
	} catch (e) {
		if (!(e instanceof YAMLException)) throw e;
		debug(`Invalid YAML in ${descriptionPath}: ${e.message}`);
		return undefined;
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
	return parsed as MissionDescription;
}

/** Looks up description fields ignoring case, spaces, underscores and dashes (e.g. "Visible Mission Name"). */
function getDescriptionValues(description: MissionDescription | undefined, keys: string[]): unknown[] {
	if (!description) return [];
	const wanted = new Set(keys);
	return Object.entries(description)
		.filter(([key]) => wanted.has(key.toLowerCase().replace(/[^a-z0-9]/g, '')))
		.map(([, value]) => value);
}

/** The mission's display name, lowercased for comparison. */
export function getDescriptionName(description: MissionDescription | undefined): string | undefined {
	for (const value of getDescriptionValues(description, ['visiblemissionname', 'missionname', 'displayname', 'name'])) {
		if (typeof value === 'string' && value.trim() !== '') return value.trim().toLowerCase();
	}
	return undefined;
}

function collectStrings(value: unknown): string[] {
	if (typeof value === 'string') return value.split(/[,;]/).map((part) => part.trim());
	if (Array.isArray(value)) return value.flatMap(collectStrings);
	return [];
}

/** True if any category or keyword entry contains the word "Dev" or "Development" (case-insensitive; "Device" doesn't match). */
export function isDevelopmentDescription(description: MissionDescription | undefined): boolean {
	const entries = getDescriptionValues(description, ['category', 'categories', 'keyword', 'keywords']).flatMap(collectStrings);
	return entries.some((entry) => /\bDev(elopment)?(\b|$)/i.test(entry));
}
