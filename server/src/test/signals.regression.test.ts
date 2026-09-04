import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { after, describe, it } from 'mocha';
import { getCache } from '../cache';
import { buildLabelDocs } from '../tokens/labels';
import { checkForUnusedSignals } from '../tokens/signals';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

const tempRoots: string[] = [];

function createMission(testName: string): { missionDir: string } {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-signals-test-'));
	tempRoots.push(root);

	const missionDir = path.join(root, 'data', 'missions', testName);
	fs.mkdirSync(missionDir, { recursive: true });
	fs.writeFileSync(path.join(missionDir, 'story.json'), '{}', 'utf8');
	return { missionDir };
}

function createMastDocument(missionDir: string, name: string, text: string): TextDocument {
	const mastPath = path.join(missionDir, name);
	fs.writeFileSync(mastPath, text, 'utf8');
	return TextDocument.create(URI.file(mastPath).toString(), 'mast', 1, text);
}

after(() => {
	for (const root of tempRoots) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

describe('signal regression coverage', () => {
	it('reports an un-emitted shared signal only once', () => {
		const { missionDir } = createMission('shared-signal-once');
		const doc = createMastDocument(missionDir, 'main.mast', '//shared/signal/lm_tether_sling_ready\n');
		const cache = getCache(doc.uri);
		cache.updateFileInfo(doc);

		const diagnostics = checkForUnusedSignals(doc).filter((diag) => diag.message.includes('lm_tether_sling_ready'));
		assert.equal(diagnostics.length, 1, JSON.stringify(diagnostics, null, 2));
	});

	it('uses built-in docs for shared signal route labels', () => {
		const { missionDir } = createMission('shared-signal-docs');
		const doc = createMastDocument(missionDir, 'main.mast', '//shared/signal/lm_tether_sling_ready\n');
		const cache = getCache(doc.uri);
		cache.updateFileInfo(doc);

		const label = cache.getMastFile(doc.uri)?.labelNames.find((entry) => entry.name === 'shared/signal/lm_tether_sling_ready');
		assert.ok(label);
		const docs = buildLabelDocs(label!).value;
		assert.ok(docs.includes('Only the server receives shared signals.'));
		assert.ok(!docs.includes("No information specified for the 'shared/signal/lm_tether_sling_ready' label."));
	});

	it('treats named signal arguments as emits', () => {
		const { missionDir } = createMission('signal-kwarg-emit');
		const doc = createMastDocument(
			missionDir,
			'main.mast',
			'set_timer(obj, "some_timer", minutes=20, signal="some_signal")\n//shared/signal/some_signal\n'
		);
		const cache = getCache(doc.uri);
		cache.updateFileInfo(doc);

		const diagnostics = checkForUnusedSignals(doc).filter((diag) => diag.message.includes('some_signal'));
		assert.equal(diagnostics.length, 0, JSON.stringify(diagnostics, null, 2));
	});
});
