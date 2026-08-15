import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { after, describe, it } from 'mocha';
import { getCache, MissionCache } from '../cache';
import { checkFunctionSignatures } from '../errorChecking';
import { PyFile } from '../files/PyFile';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { checkForUndefinedVariablesInScope } from '../tokens/labels';
import { tokenizeMastFile } from '../tokens/mastStringExtractor';

const tempRoots: string[] = [];

function createRegisteredMissionCache(testName: string): { cache: MissionCache; missionDir: string } {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-signatures-test-'));
	tempRoots.push(root);

	const missionDir = path.join(root, 'data', 'missions', testName);
	fs.mkdirSync(missionDir, { recursive: true });
	fs.writeFileSync(path.join(missionDir, 'story.json'), '{}', 'utf8');

	const workspaceFile = path.join(missionDir, 'main.mast');
	return {
		cache: getCache(workspaceFile),
		missionDir,
	};
}

function createMastDocument(missionDir: string, text: string): TextDocument {
	const mastPath = path.join(missionDir, 'main.mast');
	fs.writeFileSync(mastPath, text, 'utf8');
	return TextDocument.create(URI.file(mastPath).toString(), 'mast', 1, text);
}

after(() => {
	for (const root of tempRoots) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

describe('function signature regression coverage', () => {
	it('reports missing required args for global function calls', () => {
		const { cache, missionDir } = createRegisteredMissionCache('global-required-arg');

		cache.addMissionPyFile(new PyFile(path.join(missionDir, 'helpers.py'), `
def do_work(required_name, optional_name = None):
    pass
`));

		const mastDoc = createMastDocument(missionDir, 'do_work()\n');
		cache.updateFileInfo(mastDoc);

		const diagnostics = checkFunctionSignatures(mastDoc);
		assert.ok(diagnostics.some((diag) => diag.message.includes("Missing required argument(s): 'required_name'")));
	});

	it('does not report missing args when required params are passed by name', () => {
		const { cache, missionDir } = createRegisteredMissionCache('named-required-arg');

		cache.addMissionPyFile(new PyFile(path.join(missionDir, 'helpers.py'), `
def do_work(required_name, optional_name = None):
    pass
`));

		const mastDoc = createMastDocument(missionDir, 'do_work(required_name = "ok")\n');
		cache.updateFileInfo(mastDoc);

		const diagnostics = checkFunctionSignatures(mastDoc);
		assert.equal(diagnostics.length, 0);
	});

	it('ignores possible calls in comments and strings', () => {
		const { cache, missionDir } = createRegisteredMissionCache('comments-and-strings');

		cache.addMissionPyFile(new PyFile(path.join(missionDir, 'helpers.py'), `
def do_work(required_name):
    pass
`));

		const mastDoc = createMastDocument(
			missionDir,
			'# do_work()\n"do_work()"\ndo_work()\n'
		);
		cache.updateFileInfo(mastDoc);

		const diagnostics = checkFunctionSignatures(mastDoc);
		assert.equal(diagnostics.length, 1);
		assert.ok(diagnostics[0].message.includes("Missing required argument(s): 'required_name'"));
	});

	it('skips strict required-arg validation when argument unpacking is used', () => {
		const { cache, missionDir } = createRegisteredMissionCache('kwargs-unpacking');

		cache.addMissionPyFile(new PyFile(path.join(missionDir, 'helpers.py'), `
def do_work(required_name):
    pass
`));

		const mastDoc = createMastDocument(missionDir, 'do_work(**args)\n');
		cache.updateFileInfo(mastDoc);

		const diagnostics = checkFunctionSignatures(mastDoc);
		assert.equal(diagnostics.length, 0);
	});

	it('does not report ambiguous overloads when the minimum-arity overload can accept the call', () => {
		const { cache, missionDir } = createRegisteredMissionCache('ambiguous-overload');

		cache.addMissionPyFile(new PyFile(path.join(missionDir, 'helpers.py'), `
class Row:
    def show(self):
        pass

class Column:
    def show(self, title):
        pass
`));

		const mastDoc = createMastDocument(missionDir, 'obj.show()\n');
		cache.updateFileInfo(mastDoc);

		const diagnostics = checkFunctionSignatures(mastDoc);
		assert.equal(diagnostics.length, 0);
	});

	it('does not consider unrelated same-name class methods for a known receiver', () => {
		const { cache, missionDir } = createRegisteredMissionCache('known-receiver-unrelated-overload');

		cache.addMissionPyFile(new PyFile(path.join(missionDir, 'helpers.py'), `
class list:
    def pop(self):
        pass

class Gui:
    def pop(self, client_id):
        pass
`));

		const mastDoc = createMastDocument(missionDir, 'list.pop()\n');
		cache.updateFileInfo(mastDoc);

		const diagnostics = checkFunctionSignatures(mastDoc);
		assert.equal(diagnostics.length, 0, JSON.stringify(diagnostics, null, 2));
	});

	it('does not flag guarded variable use in guarded blocks and after early exits', () => {
		const { cache, missionDir } = createRegisteredMissionCache('guarded-variable-check');
		const cases: Array<[string, number]> = [
			[
				'if obj is not None:\n    do_something(obj)\n',
				1
			],
			[
				'yield fail if obj is None\ndo_something(obj)\n',
				1
			],
			[
				'jump END if obj is None\ndo_something(obj)\n',
				1
			],
			[
				'if obj is None:\n    ->END\ndo_something(obj)\n',
				1
			],
			[
				'if obj is None:\n    yield fail\ndo_something(obj)\n',
				1
			]
		];

		for (const [text, expectedCount] of cases) {
			const doc = createMastDocument(missionDir, text);
			cache.updateFileInfo(doc);
			const tokens = tokenizeMastFile(doc);
			const diagnostics = checkForUndefinedVariablesInScope(doc, tokens);
			const objDiags = diagnostics.filter((d) => d.message.includes('`obj`'));
			assert.equal(objDiags.length, expectedCount, `Unexpected diagnostics for:\n${text}\n${JSON.stringify(objDiags, null, 2)}`);
		}
	});
});