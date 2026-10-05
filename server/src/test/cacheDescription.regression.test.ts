import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'mocha';
import { MissionCache } from '../cache';

describe('MissionCache description metadata', () => {
	it('loads description.yaml into its cache and clears it when the file is removed', async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-mission-description-'));
		const missionDir = path.join(tempDir, 'data', 'missions', 'alpha');
		const descriptionPath = path.join(missionDir, 'description.yaml');
		fs.mkdirSync(missionDir, { recursive: true });
		fs.writeFileSync(descriptionPath, 'name: Alpha\nobjectives:\n  - Explore\n  - Escape\n');

		try {
			const cache = new MissionCache(missionDir);
			await cache.load();
			assert.deepEqual(cache.missionDescription, {
				name: 'Alpha',
				objectives: ['Explore', 'Escape']
			});

			fs.unlinkSync(descriptionPath);
			await cache.load();
			assert.equal(cache.missionDescription, undefined);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
