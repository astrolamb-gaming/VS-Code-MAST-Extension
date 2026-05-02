import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { after, describe, it } from 'mocha';
import { MissionCache } from '../cache';
import { matchesClassName } from '../data';
import { PyFile } from '../files/PyFile';

const tempRoots: string[] = [];

function createPyFile(filePath: string, contents: string): PyFile {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-pyfile-test-'));
	tempRoots.push(root);

	const fullPath = path.join(root, filePath);
	fs.mkdirSync(path.dirname(fullPath), { recursive: true });
	fs.writeFileSync(fullPath, contents.trimStart(), 'utf8');

	return new PyFile(fullPath, contents.trimStart());
}

function createMissionCache(testName: string): { cache: MissionCache; missionDir: string } {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-cache-test-'));
	tempRoots.push(root);

	const missionDir = path.join(root, 'data', 'missions', testName);
	fs.mkdirSync(missionDir, { recursive: true });
	fs.writeFileSync(path.join(missionDir, 'story.json'), '{}', 'utf8');

	const workspaceFile = path.join(missionDir, 'main.mast');
	return {
		cache: new MissionCache(workspaceFile),
		missionDir,
	};
}

after(() => {
	for (const root of tempRoots) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

describe('global alias regression coverage', () => {
	it('normalizes simulation classes to sim', () => {
		const simulationPy = createPyFile('simulation.py', `
class simulation:
    def time_tick_counter(self):
        pass
`);

		assert.equal(simulationPy.classes.length, 1);
		assert.equal(simulationPy.classes[0].name, 'sim');
		assert.ok(matchesClassName('sim', 'simulation'));
		assert.equal(simulationPy.classes[0].methods[0].className, 'sim');
		assert.equal(simulationPy.classes[0].methods[0].name, 'time_tick_counter');
	});

	it('keeps sbs as a class without generating prefixed free functions', () => {
		const sbsPy = createPyFile('sbs.py', `
class sbs:
    def send_message(self):
        pass
`);

		const sbsClass = sbsPy.classes.find((classObject) => classObject.name === 'sbs');
		assert.ok(sbsClass);
		assert.ok(sbsClass?.methods.some((method) => method.name === 'send_message'));
		assert.equal(sbsPy.defaultFunctions.find((func) => func.name === 'sbs_send_message'), undefined);
	});

	it('creates both scatter class wrappers and prefixed free functions', () => {
		const scatterPy = createPyFile('scatter.py', `
def arc():
    pass

def line():
    pass
`);

		scatterPy.isGlobal = true;
		scatterPy.globalAlias = 'scatter';
		scatterPy.applyImportedGlobalAlias();

		const scatterClass = scatterPy.classes.find((classObject) => classObject.name === 'scatter');
		assert.ok(scatterClass);
		assert.ok(scatterClass?.methods.some((method) => method.name === 'arc'));
		assert.ok(scatterClass?.methods.some((method) => method.name === 'line'));
		assert.ok(scatterPy.defaultFunctions.some((func) => func.name === 'scatter_arc'));
		assert.ok(scatterPy.defaultFunctions.some((func) => func.name === 'scatter_line'));
	});

	it('creates names class wrapper without prefixed free functions', () => {
		const namesPy = createPyFile('names.py', `
def random_kralien_name():
    pass
`);

		namesPy.isGlobal = true;
		namesPy.globalAlias = 'names';
		namesPy.applyImportedGlobalAlias(false);

		const namesClass = namesPy.classes.find((classObject) => classObject.name === 'names');
		assert.ok(namesClass);
		assert.ok(namesClass?.methods.some((method) => method.name === 'random_kralien_name'));
		assert.equal(namesPy.defaultFunctions.some((func) => func.name === 'names_random_kralien_name'), false);
	});

	it('applies MastGlobals faces entries as class wrappers on matching modules', () => {
		const { cache, missionDir } = createMissionCache('faces-global');

		const facesPy = new PyFile(path.join(missionDir, 'sbs_utils', 'faces.py'), `
def make_face_list():
    pass
`);

		const globalsPy = new PyFile(path.join(missionDir, 'globals.py'), `
class MastGlobals:
    globals = {
        "faces": faces,
    }
`);

		cache.addSbsPyFile(facesPy);
		cache.addMissionPyFile(globalsPy);

		const facesClass = cache.getClasses().find((classObject) => classObject.name === 'faces');
		assert.ok(facesClass);
		assert.ok(facesClass?.methods.some((method) => method.name === 'make_face_list'));
		assert.ok(cache.getMethod('make_face_list'));
	});

	it('does not treat import_python_module module names as MastGlobals exports', () => {
		const { cache, missionDir } = createMissionCache('imported-module-global');

		const sidesPy = new PyFile(path.join(missionDir, 'sbs_utils', 'procedural', 'sides.py'), `
def port_side():
    pass
`);

		const globalsPy = new PyFile(path.join(missionDir, 'globals.py'), `
class MastGlobals:
    @staticmethod
    def load():
        MastGlobals.import_python_module('sbs_utils.procedural.sides')
`);

		cache.addSbsPyFile(sidesPy);
		cache.addMissionPyFile(globalsPy);

		assert.ok(cache.getMethod('port_side'));
		assert.equal(cache.getMastGlobal('sides'), undefined);
		assert.equal(cache.getClasses().some((classObject) => classObject.name === 'sides'), false);
	});

	it('keeps sbs as a special-case module global', () => {
		const { cache } = createMissionCache('sbs-special-global');

		cache.sbsGlobals.push(['sbs', '']);

		assert.ok(cache.getMastGlobal('sbs'));
	});
});