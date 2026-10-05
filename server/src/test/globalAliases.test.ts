import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { after, describe, it } from 'mocha';
import AdmZip = require('adm-zip');
import { getCache, MissionCache } from '../cache';
import { PackageManager, PackageSnapshot } from '../packageManager';
import { StoryJson } from '../data/storyJson';
import { buildLabelDocs } from '../tokens/labels';
import { matchesClassName } from '../data';
import { checkFunctionSignatures } from '../errorChecking';
import { PyFile } from '../files/PyFile';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { onCompletion } from '../requests/autocompletion';
import { onHover } from '../requests/hover';
import { addPythonAutoImport, extractPythonModuleName } from '../pythonImport';

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

function createRegisteredMissionCache(testName: string): { cache: MissionCache; missionDir: string } {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-cache-test-'));
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

after(() => {
	for (const root of tempRoots) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

describe('global alias regression coverage', () => {
	it('retains shared package state until the final owner releases it', async () => {
		const manager = new PackageManager();
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-package-lease-test-'));
		tempRoots.push(root);
		const archivePath = path.join(root, 'shared.mastlib');
		const zip = new AdmZip();
		zip.addFile('shared.mast', Buffer.from('== shared_package_label ==\n', 'utf8'));
		zip.writeZip(archivePath);
		const firstOwner = `package-lease-first-${Date.now()}`;
		const secondOwner = `package-lease-second-${Date.now()}`;
		let secondNotifications = 0;
		const listener = () => { secondNotifications++; };

		const firstSnapshot = await manager.acquirePackage(archivePath, firstOwner, () => {});
		const secondSnapshot = await manager.acquirePackage(archivePath, secondOwner, listener);
		assert.strictEqual(firstSnapshot, secondSnapshot);

		manager.releasePackage(archivePath, firstOwner);
		await manager.reloadPackage(archivePath);
		assert.equal(secondNotifications, 1);
		assert.equal((manager as unknown as { packages: Map<string, unknown> }).packages.size, 1);

		manager.releasePackage(archivePath, secondOwner);
		assert.equal((manager as unknown as { packages: Map<string, unknown> }).packages.size, 0);
		await manager.reloadPackage(archivePath);
		assert.equal(secondNotifications, 1);
	});

	it('publishes an empty package snapshot when an in-use archive is deleted', async () => {
		const manager = new PackageManager();
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-package-delete-test-'));
		tempRoots.push(root);
		const archivePath = path.join(root, 'deleted.mastlib');
		const zip = new AdmZip();
		zip.addFile('deleted.mast', Buffer.from('== deleted_package_label ==\n', 'utf8'));
		zip.writeZip(archivePath);
		const owner = `package-delete-owner-${Date.now()}`;
		let latestSnapshot: PackageSnapshot | undefined;
		latestSnapshot = await manager.acquirePackage(archivePath, owner, (_packagePath, snapshot) => { latestSnapshot = snapshot; });
		assert.ok(latestSnapshot?.labels.some((label) => label.name === 'deleted_package_label'));

		fs.rmSync(archivePath);
		await manager.reloadPackage(archivePath);
		assert.equal(latestSnapshot?.files.length, 0);
		assert.equal(latestSnapshot?.labels.length, 0);
		manager.releasePackage(archivePath, owner);
	});

	it('retains the last successful snapshot when an archive reload fails', async () => {
		const manager = new PackageManager();
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-package-failed-reload-test-'));
		tempRoots.push(root);
		const archivePath = path.join(root, 'unstable.mastlib');
		const zip = new AdmZip();
		zip.addFile('stable.mast', Buffer.from('== stable_package_label ==\n', 'utf8'));
		zip.writeZip(archivePath);
		const owner = `package-failed-reload-owner-${Date.now()}`;
		let notifications = 0;
		const initial = await manager.acquirePackage(archivePath, owner, () => { notifications++; });
		assert.ok(initial.labels.some((label) => label.name === 'stable_package_label'));

		fs.writeFileSync(archivePath, 'not a zip archive', 'utf8');
		await manager.reloadPackage(archivePath);
		const retained = await manager.acquirePackage(archivePath, owner, () => { notifications++; });
		assert.strictEqual(retained, initial);
		assert.ok(retained.labels.some((label) => label.name === 'stable_package_label'));
		assert.equal(notifications, 0);

		manager.releasePackage(archivePath, owner);
	});

	it('does not retain package state when its final owner releases during initial load', async () => {
		const manager = new PackageManager();
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-package-release-race-test-'));
		tempRoots.push(root);
		const archivePath = path.join(root, 'release-race.mastlib');
		const zip = new AdmZip();
		zip.addFile('race.mast', Buffer.from('== release_race_label ==\n', 'utf8'));
		zip.writeZip(archivePath);
		const owner = `package-release-race-${Date.now()}`;
		const acquisition = manager.acquirePackage(archivePath, owner, () => {});
		manager.releasePackage(archivePath, owner);
		await acquisition;
		assert.equal((manager as unknown as { packages: Map<string, unknown> }).packages.size, 0);
		const parsedFiles = (manager as unknown as { parsedFiles: Map<string, { owners: Set<string> }> }).parsedFiles;
		assert.equal([...parsedFiles.values()].some((record) => record.owners.has(`package:${manager.normalizeSource(archivePath)}`)), false);
	});

	it('refreshes changed shared package entries once for every dependent cache', async () => {
		const packageManager = new PackageManager();
		const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-package-reload-test-'));
		tempRoots.push(packageRoot);
		const zipPath = path.join(packageRoot, 'shared.mastlib');
		const zip = new AdmZip();
		const unchangedContents = 'def stay(self):\n    pass\n';
		const firstContents = 'def before(self):\n    pass\n';
		zip.addFile('changed.py', Buffer.from(firstContents, 'utf8'));
		zip.addFile('unchanged.py', Buffer.from(unchangedContents, 'utf8'));
		zip.writeZip(zipPath);

		let firstUpdate: Awaited<ReturnType<typeof packageManager.acquirePackage>> | undefined;
		let secondUpdate: Awaited<ReturnType<typeof packageManager.acquirePackage>> | undefined;
		const firstOwner = `reload-test-first-${Date.now()}`;
		const secondOwner = `reload-test-second-${Date.now()}`;
		const firstInitial = await packageManager.acquirePackage(zipPath, firstOwner, (_packagePath, snapshot) => { firstUpdate = snapshot; });
		const secondInitial = await packageManager.acquirePackage(zipPath, secondOwner, (_packagePath, snapshot) => { secondUpdate = snapshot; });
		assert.strictEqual(firstInitial.files.find((file) => file.file.endsWith('unchanged.py')),
			secondInitial.files.find((file) => file.file.endsWith('unchanged.py')));
		const firstUnchanged = firstInitial.files.find((file) => file.file.endsWith('unchanged.py'));
		const secondUnchanged = secondInitial.files.find((file) => file.file.endsWith('unchanged.py'));

		const updatedZip = new AdmZip();
		updatedZip.addFile('changed.py', Buffer.from('def after(self):\n    pass\n', 'utf8'));
		updatedZip.addFile('unchanged.py', Buffer.from(unchangedContents, 'utf8'));
		updatedZip.writeZip(zipPath);
		await packageManager.reloadPackage(zipPath);

		assert.ok(firstUpdate);
		assert.ok(secondUpdate);
		for (const snapshot of [firstUpdate, secondUpdate]) {
			const changedFunctions = snapshot?.files.find((file) => file.file.endsWith('changed.py'))?.pyFile?.defaultFunctions;
			assert.ok(changedFunctions?.some((func) => func.name === 'after'));
			assert.equal(changedFunctions?.some((func) => func.name === 'before'), false);
		}
		assert.strictEqual(firstUpdate?.files.find((file) => file.file.endsWith('unchanged.py')), firstUnchanged);
		assert.strictEqual(secondUpdate?.files.find((file) => file.file.endsWith('unchanged.py')), secondUnchanged);

		packageManager.releasePackage(zipPath, firstOwner);
		packageManager.releasePackage(zipPath, secondOwner);
	});

	it('reconciles package references when the resolved source and story package set change', async () => {
		const manager = new PackageManager();
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-package-set-test-'));
		tempRoots.push(root);
		const libName = 'shared-lib.v1.0.0.sbslib';
		const missionLibFolder = path.join(root, '__lib__');
		const archivePath = path.join(missionLibFolder, libName);
		const sourceFolder = path.join(root, 'shared-lib');
		fs.mkdirSync(missionLibFolder, { recursive: true });
		fs.mkdirSync(sourceFolder, { recursive: true });
		const zip = new AdmZip();
		zip.addFile('archive_module.py', Buffer.from('def from_archive(self):\n    pass\n', 'utf8'));
		zip.writeZip(archivePath);

		const owner = `package-set-test-${Date.now()}`;
		const changed: string[] = [];
		const listener = (packagePath: string) => { changed.push(packagePath); };
		const request = (missions: Array<{ name: string; path: string }>) => ({
			name: libName,
			missionLibFolder,
			artemisMissions: missions,
			workspaceFolders: [],
			getModuleBaseName: (name: string) => name.substring(0, name.indexOf('.v'))
		});

		const archiveResult = await manager.reconcilePackages([request([])], owner, listener);
		assert.ok(archiveResult.get(libName)?.snapshot.files.some((file) => file.file.endsWith('archive_module.py')));
		assert.equal(archiveResult.get(libName)?.identity, manager.normalizeSource(archivePath));

		fs.rmSync(archivePath);
		fs.writeFileSync(path.join(sourceFolder, 'folder_module.py'), 'def from_folder(self):\n    pass\n', 'utf8');
		fs.writeFileSync(path.join(sourceFolder, 'folder_module.mast'), '== folder_only_label ==\n', 'utf8');
		const folderResult = await manager.reconcilePackages([request([{ name: 'shared-lib', path: sourceFolder }])], owner, listener);
		assert.ok(folderResult.get(libName)?.snapshot.files.some((file) => file.file.endsWith('folder_module.py')));
		assert.ok(folderResult.get(libName)?.snapshot.mastFiles.some((file) => file.uri.endsWith('folder_module.mast')));
		assert.equal(folderResult.get(libName)?.identity, manager.normalizeSource(sourceFolder));
		assert.notEqual(archiveResult.get(libName)?.identity, folderResult.get(libName)?.identity);

		await manager.reconcilePackages([], owner, listener);
		await manager.reloadPackage(archivePath);
		await manager.reloadPackage(sourceFolder);
		assert.equal(changed.length, 0);
	});

	it('resolves workspace mission roots to the package-specific subfolder', async () => {
		const manager = new PackageManager();
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-workspace-package-test-'));
		tempRoots.push(root);
		const missionLibFolder = path.join(root, 'data', 'missions', '__lib__');
		const workspaceMissionRoot = path.join(root, 'LegendaryMissions');
		const packageName = 'artemis-sbs.LegendaryMissions.hangar.v1.4.0.mastlib';
		const archivePath = path.join(missionLibFolder, packageName);
		fs.mkdirSync(missionLibFolder, { recursive: true });
		fs.mkdirSync(workspaceMissionRoot, { recursive: true });
		fs.writeFileSync(path.join(workspaceMissionRoot, 'script.mast'), '== unrelated_root_label ==\n', 'utf8');
		const archive = new AdmZip();
		archive.addFile('archived.mast', Buffer.from('== archived_hangar_label ==\n', 'utf8'));
		archive.writeZip(archivePath);
		const owner = `workspace-package-test-${Date.now()}`;
		const request = {
			name: packageName,
			missionLibFolder,
			artemisMissions: [],
			workspaceFolders: [workspaceMissionRoot],
			getModuleBaseName: (name: string) => name.substring(0, name.indexOf('.v'))
		};

		const archiveResult = await manager.reconcilePackages([request], owner, () => {});
		assert.equal(archiveResult.get(packageName)?.identity, manager.normalizeSource(archivePath));
		assert.ok(archiveResult.get(packageName)?.snapshot.labels.some((label) => label.name === 'archived_hangar_label'));
		assert.equal(archiveResult.get(packageName)?.snapshot.labels.some((label) => label.name === 'unrelated_root_label'), false);

		const packageFolder = path.join(workspaceMissionRoot, 'hangar');
		fs.mkdirSync(packageFolder, { recursive: true });
		fs.writeFileSync(path.join(packageFolder, 'hangar.mast'), '== editable_hangar_label ==\n', 'utf8');
		const workspaceResult = await manager.reconcilePackages([request], owner, () => {});
		assert.equal(workspaceResult.get(packageName)?.identity, manager.normalizeSource(packageFolder));
		assert.ok(workspaceResult.get(packageName)?.snapshot.labels.some((label) => label.name === 'editable_hangar_label'));

		manager.releaseOwnerPackages(owner);
	});

	it('prefers the Dev-categorized mission source when mission descriptions share a name', async () => {
		const manager = new PackageManager();
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-dev-package-test-'));
		tempRoots.push(root);
		const missionsRoot = path.join(root, 'data', 'missions');
		const missionLibFolder = path.join(missionsRoot, '__lib__');
		fs.mkdirSync(missionLibFolder, { recursive: true });
		const writeMission = (folder: string, description: string, label: string) => {
			const packageFolder = path.join(missionsRoot, folder, 'hangar');
			fs.mkdirSync(packageFolder, { recursive: true });
			fs.writeFileSync(path.join(missionsRoot, folder, 'description.yaml'), description, 'utf8');
			fs.writeFileSync(path.join(packageFolder, 'hangar.mast'), `== ${label} ==\n`, 'utf8');
			return packageFolder;
		};
		writeMission('LegendaryMissions', 'Category: Classic\nVisible Mission Name: Legendary Missions\nKeywords: classic, multiple\n', 'release_label');
		const devFolder = writeMission('LegendaryMissionsDev', 'Category: Development\nVisible Mission Name: Legendary Missions\nKeywords: classic, multiple\n', 'dev_label');
		const packageName = 'artemis-sbs.LegendaryMissions.hangar.v1.4.0.mastlib';
		const owner = `dev-package-test-${Date.now()}`;

		const result = await manager.reconcilePackages([{
			name: packageName,
			missionLibFolder,
			artemisMissions: [],
			workspaceFolders: [],
			getModuleBaseName: (name: string) => name.substring(0, name.indexOf('.v'))
		}], owner, () => {});

		assert.equal(result.get(packageName)?.identity, manager.normalizeSource(devFolder));
		assert.ok(result.get(packageName)?.snapshot.labels.some((label) => label.name === 'dev_label'));
		manager.releaseOwnerPackages(owner);
	});

	it('prefers the mission folder containing .git over Dev-categorized folders with the same display name', async () => {
		const manager = new PackageManager();
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-git-package-test-'));
		tempRoots.push(root);
		const missionsRoot = path.join(root, 'data', 'missions');
		const missionLibFolder = path.join(missionsRoot, '__lib__');
		fs.mkdirSync(missionLibFolder, { recursive: true });
		const writeMission = (folder: string, category: string, label: string, git: boolean) => {
			const packageFolder = path.join(missionsRoot, folder, 'hangar');
			fs.mkdirSync(packageFolder, { recursive: true });
			fs.writeFileSync(path.join(missionsRoot, folder, 'description.yaml'), `Category: ${category}\nVisible Mission Name: Legendary Missions\n`, 'utf8');
			fs.writeFileSync(path.join(packageFolder, 'hangar.mast'), `== ${label} ==\n`, 'utf8');
			if (git) fs.mkdirSync(path.join(missionsRoot, folder, '.git'));
			return packageFolder;
		};
		writeMission('legendarymissions', 'Classic', 'plain_label', false);
		writeMission('LegendaryMissionsDev', 'Development', 'dev_label', false);
		const gitFolder = writeMission('LegendaryMissionsGit', 'Classic', 'git_label', true);
		const packageName = 'artemis-sbs.LegendaryMissions.hangar.v1.4.0.mastlib';
		const owner = `git-package-test-${Date.now()}`;

		const result = await manager.reconcilePackages([{
			name: packageName,
			missionLibFolder,
			artemisMissions: [],
			workspaceFolders: [],
			getModuleBaseName: (name: string) => name.substring(0, name.indexOf('.v'))
		}], owner, () => {});

		assert.equal(result.get(packageName)?.identity, manager.normalizeSource(gitFolder));
		manager.releaseOwnerPackages(owner);
	});

	it('loads labels and emitted signals from a packaged MAST library file', async () => {
		const { cache, missionDir } = createMissionCache('packaged-mast-library');
		const manager = new PackageManager();
		const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-packaged-mastlib-test-'));
		tempRoots.push(packageRoot);
		const packageName = 'artemis-sbs.LegendaryMissions.hangar.v1.0.0.mastlib';
		const packagePath = path.join(packageRoot, packageName);
		const packagedMast = [
			'== packaged_label ==',
			'signal_emit("package_emit_signal")',
			'//shared/signal/package_emit_signal',
			''
		].join('\n');
		const zip = new AdmZip();
		zip.addFile('hangar.mast', Buffer.from(packagedMast, 'utf8'));
		zip.writeZip(packagePath);

		const request = {
			name: packageName,
			missionLibFolder: packageRoot,
			artemisMissions: [],
			workspaceFolders: [],
			getModuleBaseName: (name: string) => name.substring(0, name.indexOf('.v'))
		};
		const owner = `packaged-mast-test-${Date.now()}`;
		const packages = await manager.reconcilePackages([request], owner, () => {});
		const resolved = packages.get(packageName);
		const mastEntry = resolved?.snapshot.files.find((entry) => entry.mastFile);
		assert.ok(mastEntry?.mastFile, 'PackageManager should parse packaged .mast files');
		assert.ok(resolved?.snapshot.labels.some((label) => label.name === 'packaged_label'));
		const packagedLabel = resolved?.snapshot.labels.find((label) => label.name === 'packaged_label');
		assert.ok(buildLabelDocs(packagedLabel!).value.includes('LegendaryMissions/hangar/hangar.mast'));
		assert.ok(resolved?.snapshot.signals.find((signal) => signal.name === 'package_emit_signal')?.emit.length);
		assert.ok(resolved?.snapshot.signals.find((signal) => signal.name === 'package_emit_signal')?.triggered.length);

		const attach = cache as unknown as {
			attachSharedLibraryPackage: (packagePath: string, snapshot: PackageSnapshot) => void;
		};
		attach.attachSharedLibraryPackage(resolved!.identity, resolved!.snapshot);
		const doc = TextDocument.create(URI.file(path.join(missionDir, 'main.mast')).toString(), 'mast', 1, '');
		assert.ok(cache.getLabels(doc).some((label) => label.name === 'packaged_label'));
		const signal = cache.getSignals().find((entry) => entry.name === 'package_emit_signal');
		assert.ok(signal?.emit.length, 'packaged signal_emit() should be registered as an emit');
		assert.ok(signal?.triggered.length, 'packaged shared signal route should be registered as a trigger');

		cache.releaseSharedLibraryParses();
		manager.releaseOwnerPackages(owner);
	});

	it('refreshes only changed MAST package files and their extracted data', async () => {
		const { cache, missionDir } = createMissionCache('incremental-mast-package-refresh');
		const manager = new PackageManager();
		const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-incremental-package-test-'));
		tempRoots.push(packageRoot);
		const packageName = 'incremental.v1.0.0.mastlib';
		const packagePath = path.join(packageRoot, packageName);
		const initialChanged = '== initial_label ==\nsignal_emit("old_package_signal")\nrole("old_package_role")\n';
		const unchanged = '== unchanged_label ==\nsignal_emit("kept_package_signal")\n';
		const removed = '== removed_label ==\n';
		const writeArchive = (changedText: string, includeRemoved: boolean, includeAdded: boolean) => {
			const archive = new AdmZip();
			archive.addFile('changed.mast', Buffer.from(changedText, 'utf8'));
			archive.addFile('unchanged.mast', Buffer.from(unchanged, 'utf8'));
			if (includeRemoved) archive.addFile('removed.mast', Buffer.from(removed, 'utf8'));
			if (includeAdded) archive.addFile('added.mast', Buffer.from('== added_label ==\nrole("new_package_role")\n', 'utf8'));
			archive.writeZip(packagePath);
		};
		writeArchive(initialChanged, true, false);

		const internalCache = cache as unknown as {
			sharedLibraryOwnerKey: string;
			onSharedPackageChanged: (changedPath: string, snapshot: PackageSnapshot) => Promise<void>;
			attachSharedLibraryPackage: (sourcePath: string, snapshot: PackageSnapshot) => void;
		};
		const owner = internalCache.sharedLibraryOwnerKey;
		const initial = await manager.acquirePackage(packagePath, owner, (changedPath, snapshot) =>
			internalCache.onSharedPackageChanged(changedPath, snapshot)
		);
		internalCache.attachSharedLibraryPackage(manager.normalizeSource(packagePath), initial);
		const unchangedFile = cache.missionMastModules.find((file) => file.uri.endsWith('unchanged.mast'));
		assert.ok(unchangedFile);

		writeArchive('== updated_label ==\nsignal_emit("new_package_signal")\n', false, true);
		await manager.reloadPackage(packagePath);

		const document = TextDocument.create(URI.file(path.join(missionDir, 'main.mast')).toString(), 'mast', 1, '');
		const labels = cache.getLabels(document).map((label) => label.name);
		assert.ok(labels.includes('updated_label'));
		assert.ok(labels.includes('unchanged_label'));
		assert.ok(labels.includes('added_label'));
		assert.equal(labels.includes('initial_label'), false);
		assert.equal(labels.includes('removed_label'), false);
		assert.strictEqual(cache.missionMastModules.find((file) => file.uri.endsWith('unchanged.mast')), unchangedFile);
		const signals = cache.getSignals();
		assert.ok(signals.some((signal) => signal.name === 'new_package_signal' && signal.emit.length > 0));
		assert.equal(signals.some((signal) => signal.name === 'old_package_signal'), false);
		assert.ok(cache.getRoles(missionDir).some((role) => role.name === 'new_package_role'));
		assert.equal(cache.getRoles(missionDir).some((role) => role.name === 'old_package_role'), false);

		cache.releaseSharedLibraryParses();
		manager.releaseOwnerPackages(owner);
	});

	it('falls back to a mission reload when a Python package file changes', async () => {
		const { cache } = createMissionCache('python-package-refresh-fallback');
		const manager = new PackageManager();
		const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-python-package-refresh-test-'));
		tempRoots.push(packageRoot);
		const packagePath = path.join(packageRoot, 'python-shared.sbslib');
		const writeArchive = (functionName: string) => {
			const archive = new AdmZip();
			archive.addFile('shared.py', Buffer.from(`def ${functionName}():\n    pass\n`, 'utf8'));
			archive.writeZip(packagePath);
		};
		writeArchive('before');

		let fullReloads = 0;
		const internalCache = cache as unknown as {
			sharedLibraryOwnerKey: string;
			onSharedPackageChanged: (changedPath: string, snapshot: PackageSnapshot) => Promise<void>;
			attachSharedLibraryPackage: (sourcePath: string, snapshot: PackageSnapshot) => void;
			load: () => Promise<void>;
		};
		const owner = internalCache.sharedLibraryOwnerKey;
		const initial = await manager.acquirePackage(packagePath, owner, (changedPath, snapshot) =>
			internalCache.onSharedPackageChanged(changedPath, snapshot)
		);
		internalCache.attachSharedLibraryPackage(manager.normalizeSource(packagePath), initial);
		internalCache.load = async () => { fullReloads++; };

		writeArchive('after');
		await manager.reloadPackage(packagePath);
		assert.equal(fullReloads, 1);

		cache.releaseSharedLibraryParses();
		manager.releaseOwnerPackages(owner);
	});

	it('uses the editable mission subfolder for package label and signal locations', async () => {
		const { cache, missionDir } = createMissionCache('package-source-subfolder');
		const missionsRoot = path.dirname(missionDir);
		const missionLibFolder = path.join(missionsRoot, '__lib__');
		const missionSource = path.join(missionsRoot, 'LegendaryMissions');
		const packageSource = path.join(missionSource, 'hangar');
		const archiveName = 'artemis-sbs.LegendaryMissions.hangar.v1.4.0.mastlib';
		const archivePath = path.join(missionLibFolder, archiveName);
		fs.mkdirSync(packageSource, { recursive: true });
		fs.mkdirSync(missionLibFolder, { recursive: true });

		const sourceText = [
			'== editable_hangar_label ==',
			'signal_emit("editable_hangar_signal")',
			'//shared/signal/editable_hangar_signal',
			'role("editable_hangar_role")',
			''
		].join('\n');
		const sourceFile = path.join(packageSource, 'hangar.mast');
		fs.writeFileSync(sourceFile, sourceText, 'utf8');
		const rootHelper = path.join(missionDir, 'here_helpers.py');
		fs.writeFileSync(rootHelper, 'def helper():\n    pass\n', 'utf8');
		const archive = new AdmZip();
		archive.addFile('hangar.mast', Buffer.from('== archived_hangar_label ==\n', 'utf8'));
		archive.writeZip(archivePath);

		cache.storyJson.mastlib = [archiveName];
		cache.storyJson.sbslib = [];
		await (cache as unknown as { modulesLoaded: () => Promise<void> }).modulesLoaded();
		const normalizedSourceFile = sourceFile.replace(/\\/g, '/');
		assert.ok(cache.missionMastModules.some((file) => file.uri.replace(/\\/g, '/') === normalizedSourceFile));
		const doc = TextDocument.create(URI.file(path.join(missionDir, 'main.mast')).toString(), 'mast', 1, '');
		const normalizeWindowsPath = (value: string) => path.win32.normalize(value.replace(/\//g, '\\'));
		assert.equal(normalizeWindowsPath(cache.getLabel('editable_hangar_label')?.srcFile || ''), normalizeWindowsPath(sourceFile));
		assert.equal(cache.getLabel('archived_hangar_label'), undefined);
		const signal = cache.getSignals().find((entry) => entry.name === 'editable_hangar_signal');
		const sourceUri = URI.file(sourceFile).toString();
		assert.ok(signal?.emit.some((location) => URI.parse(location.uri).toString() === sourceUri));
		assert.ok(signal?.triggered.some((location) => URI.parse(location.uri).toString() === sourceUri));
		const role = cache.getRoles(missionDir).find((entry) => entry.name === 'editable_hangar_role');
		assert.ok(role?.locations.some((location) => URI.parse(location.uri).toString() === sourceUri));
		assert.ok(cache.getLabels(doc).some((label) => label.name === 'editable_hangar_label'));

		cache.releaseSharedLibraryParses();
	});

	it('clears omitted story.json package lists when reparsed', () => {
		const story = new StoryJson('unused-story.json');
		const parser = story as unknown as { parseFile: (text: string) => void };
		parser.parseFile(JSON.stringify({ sbslib: ['shared.sbslib'], mastlib: ['mission.mastlib'] }));
		assert.deepEqual(story.sbslib, ['shared.sbslib']);
		assert.deepEqual(story.mastlib, ['mission.mastlib']);

		parser.parseFile(JSON.stringify({ sbslib: [] }));
		assert.deepEqual(story.sbslib, []);
		assert.deepEqual(story.mastlib, []);
	});

	it('shares parsed library data across mission caches without sharing alias mutations', () => {
		const first = createMissionCache('shared-library-first').cache;
		const second = createMissionCache('shared-library-second').cache;
		const moduleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mast-shared-library-test-'));
		tempRoots.push(moduleRoot);
		const modulePath = path.join(moduleRoot, 'shared_module.py');
		const contents = 'def ping(self):\n    pass\n';

		first.handleZipData(contents, modulePath, modulePath);
		second.handleZipData(contents, modulePath, modulePath);

		const firstModule = first.missionPyModules[0];
		const secondModule = second.missionPyModules[0];
		assert.ok(firstModule);
		assert.ok(secondModule);
		assert.notStrictEqual(firstModule, secondModule);
		assert.strictEqual(firstModule.defaultFunctions, secondModule.defaultFunctions);

		first.tryApplyFileAsGlobal(firstModule, ['shared_module', 'api']);
		assert.ok(firstModule.defaultFunctions.some((func) => func.name === 'api_ping'));
		assert.ok(secondModule.defaultFunctions.some((func) => func.name === 'ping'));
		assert.equal(secondModule.classes.some((classObject) => classObject.name === 'api'), false);

		first.releaseSharedLibraryParses();
		second.releaseSharedLibraryParses();
	});

	it('uses bytes methods for bytes-literal member completion', () => {
		const { cache, missionDir } = createRegisteredMissionCache('bytes-literal-completion');
		const builtinTypes = createPyFile('builtin-types.py', `
class str:
    def text_only(self):
        pass

class bytes:
    def bytes_only(self):
        pass
`);
		cache.addMissionPyFile(builtinTypes);

		const mastPath = path.join(missionDir, 'main.mast');
		const byteText = "b'hello'.";
		fs.writeFileSync(mastPath, byteText, 'utf8');
		const byteDocument = TextDocument.create(URI.file(mastPath).toString(), 'mast', 1, byteText);
		const byteItems = onCompletion({
			textDocument: { uri: byteDocument.uri },
			position: { line: 0, character: byteText.length },
		}, byteDocument);
		const byteLabels = byteItems.map((item) => item.label);
		assert.ok(byteLabels.includes('bytes_only()'));
		assert.equal(byteLabels.includes('text_only()'), false);

		const stringText = "'hello'.";
		fs.writeFileSync(mastPath, stringText, 'utf8');
		const stringDocument = TextDocument.create(URI.file(mastPath).toString(), 'mast', 1, stringText);
		const stringItems = onCompletion({
			textDocument: { uri: stringDocument.uri },
			position: { line: 0, character: stringText.length },
		}, stringDocument);
		const stringLabels = stringItems.map((item) => item.label);
		assert.ok(stringLabels.includes('text_only()'));
		assert.equal(stringLabels.includes('bytes_only()'), false);
	});

	it('shows the matching builtin receiver type in literal method hover', () => {
		const { cache, missionDir } = createRegisteredMissionCache('literal-method-hover');
		cache.addMissionPyFile(createPyFile('builtin-metadata.py', `
class str:
	def capitalize(self):
		"""String capitalization method."""
        pass

class bytes:
	def capitalize(self):
		"""Bytes capitalization method."""
        pass
`));
		// Mock builtin class declarations share names with metadata classes and
		// must not shadow the latter's native methods during hover resolution.
		cache.addMissionPyFile(createPyFile('builtin-mocks.py', `
class str:
	def __init__(self, object=""):
		pass

class bytes:
	def __init__(self, object=b""):
		pass
`));

		const hoverFor = (text: string, character: number) => {
			const mastPath = path.join(missionDir, 'main.mast');
			fs.writeFileSync(mastPath, text, 'utf8');
			const document = TextDocument.create(URI.file(mastPath).toString(), 'mast', 1, text);
			return onHover({
				textDocument: { uri: document.uri },
				position: { line: 0, character },
			}, document);
		};

		const stringText = 's = "".capitalize()';
		const stringHover = hoverFor(stringText, stringText.indexOf('capitalize') + 2);
		assert.ok(stringHover, 'expected a hover for str literal method access');
		const stringHoverContents = JSON.stringify(stringHover.contents) || '';
		assert.ok(stringHoverContents.includes('str.capitalize'));
		assert.ok(stringHoverContents.includes('String capitalization method.'));

		const bytesText = "b'hello'.capitalize()";
		const bytesHover = hoverFor(bytesText, bytesText.indexOf('capitalize') + 2);
		assert.ok(bytesHover, 'expected a hover for bytes literal method access');
		const bytesHoverContents = JSON.stringify(bytesHover.contents) || '';
		assert.ok(bytesHoverContents.includes('bytes.capitalize'));
		assert.ok(bytesHoverContents.includes('Bytes capitalization method.'));
	});

	it('shows an inherited method only once in ambiguous method hovers', () => {
		const { cache, missionDir } = createRegisteredMissionCache('deduplicated-method-hover');
		cache.addMissionPyFile(createPyFile('agents.py', `
class Agent:
    def get_inventory_value(self, collection_name, default=None):
        """Open Source"""
        pass

class Scout(Agent):
    pass

class Freighter(Agent):
    pass
`));

		const text = 'ship.get_inventory_value("cargo")';
		const mastPath = path.join(missionDir, 'main.mast');
		fs.writeFileSync(mastPath, text, 'utf8');
		const document = TextDocument.create(URI.file(mastPath).toString(), 'mast', 1, text);
		const hover = onHover({
			textDocument: { uri: document.uri },
			position: { line: 0, character: text.indexOf('get_inventory_value') + 2 },
		}, document);

		assert.ok(hover, 'expected a hover for the inherited method');
		const hoverContents = JSON.stringify(hover.contents) || '';
		assert.equal(hoverContents.match(/Agent\.get_inventory_value/g)?.length, 1);
		const hoverWithoutSourceLinks = hoverContents.replace(/\[Open Source\]\([^)]+\)/g, '');
		assert.equal(hoverWithoutSourceLinks.match(/Open Source/g)?.length, 1);
	});

	it('writes profiler summaries to a log file', () => {
		const { cache, missionDir } = createMissionCache('profiling-log');
		(cache as any)._profilingStageStats.set('load:start', { count: 1, totalMs: 120, maxMs: 120 });
		(cache as any)._profilingStageStats.set('load:complete', { count: 2, totalMs: 300, maxMs: 200 });
		(cache as any)._profilingSampleCount = 3;

		(cache as any).flushProfilingSummary('load:complete');

		const logPath = path.join(missionDir, 'mast-profiler.log');
		assert.ok(fs.existsSync(logPath));
		const content = fs.readFileSync(logPath, 'utf8');
		assert.match(content, /\[profile:.*\] trigger=load:complete mode=(debug|setting|off) samples=3/);
	});

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

	it('binds aliased module methods to the alias class name', () => {
		const sbsPy = createPyFile('sbs.py', `
def get_hull_map(spaceObjectID: int, forceCreate: bool = False):
    pass
`);

		sbsPy.isGlobal = true;
		sbsPy.globalAlias = 'sbs';
		sbsPy.applyImportedGlobalAlias(false);

		const sbsClass = sbsPy.classes.find((classObject) => classObject.name === 'sbs');
		assert.ok(sbsClass);
		const method = sbsClass?.methods.find((current) => current.name === 'get_hull_map');
		assert.ok(method);
		assert.equal(method?.className, 'sbs');
		assert.equal(method?.parameters[1]?.default, 'False');
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

	it('uses source-level Python names while retaining prefixed MAST completions', () => {
		const { cache, missionDir } = createRegisteredMissionCache('python-import-source-names');
		const shipDataPy = new PyFile(path.join(missionDir, 'sbs_utils', 'procedural', 'ship_data.py'), `
def get_ship_data():
    pass
`);
		const globalsPy = new PyFile(path.join(missionDir, 'globals.py'), `
class MastGlobals:
    @staticmethod
    def load():
        MastGlobals.import_python_module('sbs_utils.procedural.ship_data')
`);
		cache.addSbsPyFile(shipDataPy);
		cache.addMissionPyFile(globalsPy);
		assert.deepEqual(globalsPy.globalFiles, [['sbs_utils.procedural.ship_data', '']]);
		// This directory is a shared Python library package, not a mission-local
		// module: imports from the mission should use `sbs_utils...`, not a path
		// relative to the library's on-disk Windows location.
		cache.missionPackageLayout.sbslib.add('sbs_utils');

		const pythonPath = path.join(missionDir, 'consumer.py');
		const pythonText = '';
		const pythonDocument = TextDocument.create(URI.file(pythonPath).toString(), 'python', 1, pythonText);
		const pythonItems = onCompletion({
			textDocument: { uri: pythonDocument.uri },
			position: { line: 0, character: 0 },
		}, pythonDocument);
		const pythonLabels = pythonItems.map((item) => item.label);

		assert.ok(pythonLabels.includes('get_ship_data()'));
		assert.equal(pythonLabels.includes('ship_data_get_ship_data()'), false);
		assert.equal(pythonLabels.includes('ship_data'), false);
		assert.ok(cache.getCompletions().some((item) => item.label === 'ship_data_get_ship_data()'));

		// Resolving the selected item adds an import for the real Python symbol, not
		// the prefixed alias exposed only to MAST scripts.
		const selectedItem = pythonItems.find((item) => item.label === 'get_ship_data()');
		assert.ok(selectedItem);
		const sourceFile = selectedItem!.data!.sourceFile as string;
		const moduleNames = [
			cache.getPythonImportModuleNameForSource(sourceFile, pythonPath),
			extractPythonModuleName(sourceFile),
		];
		const resolvedItem = addPythonAutoImport(selectedItem!, pythonText, moduleNames);
		assert.deepEqual(resolvedItem.additionalTextEdits?.[0], {
			range: {
				start: { line: 0, character: 0 },
				end: { line: 0, character: 0 },
			},
			newText: 'from sbs_utils.procedural.ship_data import get_ship_data\n',
		});
	});

	it('uses a relative module import for mission-local Python functions', () => {
		const { cache, missionDir } = createRegisteredMissionCache('python-import-relative-mission');
		const lifeformPy = new PyFile(path.join(missionDir, 'lifeform.py'), `
def lifeform_spawn(name):
    pass
`);
		cache.addMissionPyFile(lifeformPy);

		const importingFile = path.join(missionDir, 'consumer.py');
		assert.equal(
			cache.getPythonImportModuleNameForSource(lifeformPy.uri, importingFile),
			'.lifeform'
		);

		const completion = lifeformPy.pythonFunctions[0].buildCompletionItem();
		const resolved = addPythonAutoImport(completion, '', ['.lifeform']);
		assert.equal(
			resolved.additionalTextEdits?.[0].newText,
			'from .lifeform import lifeform_spawn\n'
		);
	});

	it('uses relative imports between editable and extracted shared-package modules', () => {
		const { cache } = createRegisteredMissionCache('python-import-shared-package-relative');
		const packageRoot = path.join(os.tmpdir(), 'cosmosModules', 'package-hash', 'sbs_utils', 'sbs_utils', 'procedural');
		const sourceFile = path.join(packageRoot, 'READONLY_inventory.py');
		const importingFile = path.join(cache.missionURI, 'sbs_utils', 'sbs_utils', 'procedural', 'lifeform.py');

		const moduleName = cache.getPythonImportModuleNameForSource(sourceFile, importingFile);
		assert.equal(moduleName, '.inventory');
		assert.equal(extractPythonModuleName(sourceFile), 'sbs_utils.procedural.inventory');

		const inventoryPy = new PyFile(sourceFile, 'def get_inventory_value():\n    pass\n');
		const completion = inventoryPy.pythonFunctions[0].buildCompletionItem();
		const resolved = addPythonAutoImport(completion, '', [moduleName]);
		assert.equal(
			resolved.additionalTextEdits?.[0].newText,
			'from .inventory import get_inventory_value\n'
		);
	});

	it('keeps sbs as a special-case module global', () => {
		const { cache } = createMissionCache('sbs-special-global');

		cache.sbsGlobals.push(['sbs', '']);

		assert.ok(cache.getMastGlobal('sbs'));
	});

	it('only aliases the exact sbs module for the sbs special-case global', () => {
		const { cache, missionDir } = createMissionCache('sbs-exact-module-only');

		const sbsPy = new PyFile(path.join(missionDir, 'sbs.py'), `
def get_hull_map(spaceObjectID: int, forceCreate: bool = False):
    pass
`);
		const sidesPy = new PyFile(path.join(missionDir, 'sbs_utils', 'procedural', 'sides.py'), `
def port_side():
    pass
`);

		cache.sbsGlobals.push(['sbs', '']);
		cache.addSbsPyFile(sidesPy);
		cache.addSbsPyFile(sbsPy);

		const sbsClass = cache.getClasses().find((classObject) => classObject.name === 'sbs');
		assert.ok(sbsClass);
		assert.ok(sbsClass?.methods.some((method) => method.name === 'get_hull_map'));
		assert.equal(sidesPy.classes.some((classObject) => classObject.name === 'sbs'), false);
	});

	it('includes inherited methods and deduplicates overridden names in subclass completions', () => {
		const childPy = createPyFile('subclass.py', `
class Base:
    def get_value(self):
        pass

    def base_only(self):
        pass

class Child(Base):
    def get_value(self):
        pass

    def child_only(self):
        pass
`);

		const childClass = childPy.classes.find((classObject) => classObject.name === 'Child');
		assert.ok(childClass);

		const items = childClass!.getMethodCompletionItems(childPy.classes);
		const labels = items.map((item) => item.label);
		assert.ok(labels.includes('get_value()'));
		assert.ok(labels.includes('base_only()'));
		assert.ok(labels.includes('child_only()'));
		assert.equal(labels.filter((label) => label === 'get_value()').length, 1);
	});

	it('deduplicates inherited method names across generic object completions', () => {
		const hierarchyPy = createPyFile('hierarchy.py', `
class Column:
    def on_message(self):
        pass

class Button(Column):
    pass

class Toggle(Button):
    pass
`);

		const seen = new Set<string>();
		const labels: string[] = [];
		for (const classObject of hierarchyPy.classes) {
			for (const method of classObject.getVisibleMethods(hierarchyPy.classes)) {
				if (method.functionType === 'constructor') {
					continue;
				}
				const label = method.buildCompletionItem().label;
				const key = `${method.className || classObject.name}:${method.name}`;
				if (seen.has(key)) {
					continue;
				}
				seen.add(key);
				labels.push(label);
			}
		}

		assert.ok(labels.includes('on_message()'));
		assert.equal(labels.filter((label) => label === 'on_message()').length, 1);
	});

	it('keeps inherited property labels anchored to the parent class owner', () => {
		const hierarchyPy = createPyFile('hierarchy.py', `
class Column:
    is_hidden = False

class TabControl(Column):
    pass
`);

		const tabControl = hierarchyPy.classes.find((classObject) => classObject.name === 'TabControl');
		assert.ok(tabControl);
		const items = tabControl!.buildVariableCompletionItemList(hierarchyPy.classes);
		const labels = items.map((item) => item.label);
		assert.ok(labels.includes('[Column].is_hidden'));
		assert.equal(labels.filter((label) => label === '[Column].is_hidden').length, 1);
		const ownerLabels = items.map((item) => `[${item.data?.className || 'unknown'}].${item.label}`).filter((label) => label.includes('is_hidden'));
		assert.ok(ownerLabels.some((label) => label.startsWith('[Column].')));
	});


	it('does not report missing required args for unresolved member calls when an overload accepts none', () => {
		const { cache, missionDir } = createRegisteredMissionCache('required-arg-member-call');

		const alphaPy = new PyFile(path.join(missionDir, 'alpha.py'), `
class alpha:
    def do_work(self, required_name):
        pass
`);
		const betaPy = new PyFile(path.join(missionDir, 'beta.py'), `
class beta:
    def do_work(self, optional_name = None):
        pass
`);
		cache.addMissionPyFile(alphaPy);
		cache.addMissionPyFile(betaPy);

		const mastPath = path.join(missionDir, 'main.mast');
		const mastText = 'with unknown_ref.do_work():\n    pass\n';
		fs.writeFileSync(mastPath, mastText, 'utf8');

		const mastDoc = TextDocument.create(URI.file(mastPath).toString(), 'mast', 1, mastText);
		cache.updateFileInfo(mastDoc);

		const diagnostics = checkFunctionSignatures(mastDoc);
		assert.equal(diagnostics.length, 0, JSON.stringify(diagnostics, null, 2));
	});

	it('reports missing required args for unresolved member calls when all overloads require arguments', () => {
		const { cache, missionDir } = createRegisteredMissionCache('required-arg-member-call-all-required');

		const alphaPy = new PyFile(path.join(missionDir, 'alpha.py'), `
class alpha:
    def do_work(self, required_name):
        pass
`);
		const betaPy = new PyFile(path.join(missionDir, 'beta.py'), `
class beta:
    def do_work(self, other_required):
        pass
`);
		cache.addMissionPyFile(alphaPy);
		cache.addMissionPyFile(betaPy);

		const mastPath = path.join(missionDir, 'main.mast');
		const mastText = 'with unknown_ref.do_work():\n    pass\n';
		fs.writeFileSync(mastPath, mastText, 'utf8');

		const mastDoc = TextDocument.create(URI.file(mastPath).toString(), 'mast', 1, mastText);
		cache.updateFileInfo(mastDoc);

		const diagnostics = checkFunctionSignatures(mastDoc);
		assert.ok(diagnostics.length > 0);
		assert.ok(diagnostics.some((diag) => diag.message.includes('Missing required argument(s):')));
	});
});