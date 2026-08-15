import * as assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { fixFileName, getMissionFolder } from '../fileFunctions';

describe('fileFunctions regression coverage', () => {
	it('extracts mission folders from lowercase mission paths', () => {
		const fullPath = 'C:/Artemis/data/missions/alpha/main.mast';
		assert.equal(getMissionFolder(fullPath), 'C:/Artemis/data/missions/alpha');
	});

	it('extracts mission folders when path uses uppercase Missions segment', () => {
		const fullPath = 'C:/Artemis/data/Missions/alpha/main.mast';
		assert.equal(getMissionFolder(fullPath), 'C:/Artemis/data/Missions/alpha');
	});

	it('extracts mission folders from file URIs', () => {
		const fileUri = 'file:///C:/Artemis/data/missions/alpha/main.mast';
		assert.equal(getMissionFolder(fileUri), 'C:/Artemis/data/missions/alpha');
	});

	it('returns an empty string when path is not under a missions directory', () => {
		const outsidePath = 'C:/Artemis/data/scripts/helpers.py';
		assert.equal(getMissionFolder(outsidePath), '');
	});

	it('normalizes backslashes in file paths', () => {
		const windowsPath = 'C:\\Artemis\\data\\missions\\alpha\\main.mast';
		assert.equal(fixFileName(windowsPath), 'C:/Artemis/data/missions/alpha/main.mast');
	});
});