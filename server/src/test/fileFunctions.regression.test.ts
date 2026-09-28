import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'mocha';
import { fixFileName, getArtemisDirFromChild, getMissionFolder } from '../fileFunctions';

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

	it('returns null for missing and non-Artemis paths', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-non-artemis-'));
		try {
			const ordinaryDir = path.join(tempDir, 'ordinary', 'nested');
			fs.mkdirSync(ordinaryDir, { recursive: true });
			assert.equal(getArtemisDirFromChild(ordinaryDir), null);
			assert.equal(getArtemisDirFromChild(path.join(tempDir, 'missing', 'file.py')), null);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('finds an Artemis directory from a nested child using PyAddons', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-artemis-'));
		try {
			const addonsDir = path.join(tempDir, 'PyAddons');
			const childDir = path.join(tempDir, 'data', 'missions', 'alpha');
			fs.mkdirSync(addonsDir);
			fs.mkdirSync(childDir, { recursive: true });
			assert.equal(getArtemisDirFromChild(childDir), tempDir);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('finds an Artemis directory from the release executable marker', () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-artemis-release-'));
		try {
			const childDir = path.join(tempDir, 'data');
			fs.mkdirSync(childDir);
			fs.writeFileSync(path.join(tempDir, 'Artemis3-x64-release.exe'), '');
			assert.equal(getArtemisDirFromChild(childDir), tempDir);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});