import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { after, describe, it } from 'mocha';
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
});