import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { debug } from 'console';
import { MastFile } from './files/MastFile';
import { PyFile } from './files/PyFile';
import { fixFileName, getFilesInDir, getFolders, readFile, readZipArchive } from './fileFunctions';
import { IRouteLabel, loadRouteLabels } from './tokens/routeLabels';
import { loadStyleDefs } from './data/styles';
import { getDescriptionName, isDevelopmentDescription, MissionDescription, readMissionDescription } from './data/missionDescription';
import type { LabelInfo } from './tokens/labels';
import type { SignalInfo } from './tokens/signals';
import type { Word } from './tokens/words';

const isMochaProcess = process.argv.some((arg) => arg.toLowerCase().includes('mocha')) || !!process.env.MOCHA_WORKER_ID;

export interface ParsedLibraryFile {
	key: string;
	source: string;
	fingerprint: string;
	file: string;
	pyFile?: PyFile;
	mastFile?: MastFile;
	routeLabels: IRouteLabel[];
	styleDefinitions: string[];
}

export interface PackageSnapshot {
	files: ParsedLibraryFile[];
	pyFiles: PyFile[];
	mastFiles: MastFile[];
	labels: LabelInfo[];
	signals: SignalInfo[];
	roles: Word[];
	blobKeys: Word[];
	links: Word[];
	inventoryKeys: Word[];
	sharedVariableKeys: Word[];
	routeLabels: IRouteLabel[];
	styleDefinitions: string[];
}
export type PackageChangeListener = (packagePath: string, snapshot: PackageSnapshot) => void | Promise<void>;

function emptyPackageSnapshot(): PackageSnapshot {
	return {
		files: [], pyFiles: [], mastFiles: [], labels: [], signals: [], roles: [], blobKeys: [],
		links: [], inventoryKeys: [], sharedVariableKeys: [], routeLabels: [], styleDefinitions: []
	};
}

export interface PackageRequest {
	name: string;
	missionLibFolder: string;
	artemisMissions: Array<{ name: string; path: string }>;
	workspaceFolders: string[];
	getModuleBaseName: (name: string) => string;
}

interface ResolvedPackage {
	identity: string;
	path: string;
	kind: 'archive' | 'folder';
	files?: string[];
}

interface ParsedFileRecord {
	parsed: ParsedLibraryFile;
	owners: Set<string>;
}

interface PackageRecord {
	path: string;
	kind: 'archive' | 'folder';
	initialFiles?: string[];
	listeners: Map<string, PackageChangeListener>;
	snapshot: PackageSnapshot;
	loaded: boolean;
	dirty: boolean;
	loadPromise?: Promise<PackageSnapshot>;
	reloadPromise?: Promise<void>;
	watcher?: fs.FSWatcher;
	parentWatcher?: fs.FSWatcher;
	reloadTimer?: ReturnType<typeof setTimeout>;
}

/** Owns shared package data and package lifecycle independently of MissionCache instances. */
export class PackageManager {
	private readonly packages = new Map<string, PackageRecord>();
	private readonly parsedFiles = new Map<string, ParsedFileRecord>();
	private readonly parsedKeysByPackage = new Map<string, Set<string>>();
	private readonly packageReloads = new Map<string, Promise<void>>();
	private readonly packageKeysByOwner = new Map<string, Set<string>>();

	normalizeSource(source: string): string {
		const normalized = fixFileName(source).trim();
		return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
	}

	getParsedFile(data: string, file: string, source: string): ParsedLibraryFile {
		const normalizedSource = this.normalizeSource(source);
		const fingerprint = createHash('sha256').update(data, 'utf8').digest('hex');
		const key = `${normalizedSource}\u0000${fingerprint}`;
		const existing = this.parsedFiles.get(key);
		if (existing) return existing.parsed;

		const parsed: ParsedLibraryFile = {
			key,
			source: normalizedSource,
			fingerprint,
			file,
			routeLabels: path.extname(file) === '.py' ? loadRouteLabels(data) : [],
			styleDefinitions: path.extname(file) === '.py' ? loadStyleDefs(file, data) : [],
		};
		if (path.extname(file) === '.py') {
			parsed.pyFile = new PyFile(file, data);
		} else if (path.extname(file) === '.mast' && !file.includes('sbs_utils')) {
			parsed.mastFile = new MastFile(file, data);
			parsed.mastFile.inZip = true;
		}
		this.parsedFiles.set(key, { parsed, owners: new Set<string>() });
		return parsed;
	}

	retainParsedFile(key: string, owner: string): void {
		this.parsedFiles.get(key)?.owners.add(owner);
	}

	releaseParsedFile(key: string, owner: string): void {
		const record = this.parsedFiles.get(key);
		if (!record) return;
		record.owners.delete(owner);
		this.removeParsedFileIfUnused(key, record);
	}

	async acquirePackage(packagePath: string, owner: string, listener: PackageChangeListener): Promise<PackageSnapshot> {
		return this.acquireResolvedPackage({ identity: this.normalizeSource(packagePath), path: packagePath, kind: 'archive' }, owner, listener);
	}

	private resolvePackage(
		request: PackageRequest,
		missionCandidates: Array<{ name: string; path: string }>,
		loadableFilesByPath: Map<string, string[]>,
		descriptionsByPath: Map<string, MissionDescription | undefined>,
		sourceCandidateDirs: string[]
	): ResolvedPackage {
		const moduleParts = request.getModuleBaseName(request.name).split('.').filter(Boolean);
		for (const mission of missionCandidates) {
			const missionPartIndex = moduleParts.findIndex((part) => part.toLowerCase() === mission.name.toLowerCase());
			if (missionPartIndex < 0) continue;
			const packageSubpath = moduleParts.slice(missionPartIndex + 1);
			const sourcePath = path.join(mission.path, ...packageSubpath);
			const { key: sourceKey, files } = this.getLoadableFilesForPath(sourcePath, loadableFilesByPath);
			if (files.length > 0) {
				const dev = this.findPreferredSource(mission.path, packageSubpath, sourceCandidateDirs, loadableFilesByPath, descriptionsByPath);
				if (dev) {
					debug(`[package] ${request.name} resolved to preferred source ${dev.sourcePath}`);
					return { identity: dev.key, path: dev.sourcePath, kind: 'folder', files: dev.files };
				}
				debug(`[package] ${request.name} resolved to editable source ${sourcePath}`);
				return { identity: sourceKey, path: sourcePath, kind: 'folder', files };
			}
		}

		for (const folderPath of request.workspaceFolders) {
			const folderName = path.basename(folderPath);
			const folderPartIndex = moduleParts.findIndex((part) => part.toLowerCase() === folderName.toLowerCase());
			if (folderPartIndex < 0) continue;
			const packageSubpath = moduleParts.slice(folderPartIndex + 1);
			const sourcePath = path.join(folderPath, ...packageSubpath);
			const { key: sourceKey, files } = this.getLoadableFilesForPath(sourcePath, loadableFilesByPath);
			if (files.length > 0) {
				const dev = this.findPreferredSource(folderPath, packageSubpath, sourceCandidateDirs, loadableFilesByPath, descriptionsByPath);
				if (dev) {
					debug(`[package] ${request.name} resolved to preferred source ${dev.sourcePath}`);
					return { identity: dev.key, path: dev.sourcePath, kind: 'folder', files: dev.files };
				}
				debug(`[package] ${request.name} resolved to workspace source ${sourcePath}`);
				return { identity: sourceKey, path: sourcePath, kind: 'folder', files };
			}
		}
		const archivePath = path.join(request.missionLibFolder, request.name);
		debug(`[package] ${request.name} resolved to archive ${archivePath}`);
		return { identity: this.normalizeSource(archivePath), path: archivePath, kind: 'archive' };
	}

	private getMissionDescription(folderPath: string, descriptionsByPath: Map<string, MissionDescription | undefined>): MissionDescription | undefined {
		const key = this.normalizeSource(folderPath);
		if (!descriptionsByPath.has(key)) descriptionsByPath.set(key, readMissionDescription(folderPath));
		return descriptionsByPath.get(key);
	}

	/**
	 * Package source was found in `matchedDir`. Looks for other mission/workspace folders whose description
	 * has the same display name and prefers, in order: a folder containing `.git`, then one marked
	 * Dev/Development in its category or keywords. Returns undefined to keep `matchedDir`.
	 */
	private findPreferredSource(
		matchedDir: string,
		packageSubpath: string[],
		candidateDirs: string[],
		loadableFilesByPath: Map<string, string[]>,
		descriptionsByPath: Map<string, MissionDescription | undefined>
	): { key: string; sourcePath: string; files: string[] } | undefined {
		const matchedDescription = this.getMissionDescription(matchedDir, descriptionsByPath);
		const name = getDescriptionName(matchedDescription);
		if (!name) return undefined;
		const hasGit = (dir: string) => fs.existsSync(path.join(dir, '.git'));
		if (hasGit(matchedDir)) return undefined;

		const matchedKey = this.normalizeSource(matchedDir);
		const alternatives: Array<{ dir: string; key: string; sourcePath: string; files: string[]; description: MissionDescription | undefined }> = [];
		const seen = new Set<string>([matchedKey]);
		for (const dir of candidateDirs) {
			const dirKey = this.normalizeSource(dir);
			if (seen.has(dirKey)) continue;
			seen.add(dirKey);
			const description = this.getMissionDescription(dir, descriptionsByPath);
			if (getDescriptionName(description) !== name) continue;
			const sourcePath = path.join(dir, ...packageSubpath);
			const { key, files } = this.getLoadableFilesForPath(sourcePath, loadableFilesByPath);
			if (files.length > 0) alternatives.push({ dir, key, sourcePath, files, description });
		}

		const gitSource = alternatives.find((alt) => hasGit(alt.dir));
		if (gitSource) return gitSource;
		if (isDevelopmentDescription(matchedDescription)) return undefined;
		return alternatives.find((alt) => isDevelopmentDescription(alt.description));
	}

	private getLoadableFilesForPath(folderPath: string, filesByPath: Map<string, string[]>): { key: string; files: string[] } {
		const key = this.normalizeSource(folderPath);
		if (!filesByPath.has(key)) filesByPath.set(key, this.getLoadableLibraryFiles(folderPath));
		return { key, files: filesByPath.get(key)! };
	}

	private getLoadableLibraryFiles(folderPath: string): string[] {
		if (/(^|[\\/])tests?([\\/]|$)/i.test(folderPath)) return [];
		return getFilesInDir(folderPath, true).filter((file) =>
			(file.endsWith('.py') || file.endsWith('.mast')) &&
			!file.endsWith('__init__.py') && !file.endsWith('__init__.mast') &&
			!file.endsWith('.pyc') &&
			!/(^|[\\/])tests?([\\/]|$)/i.test(file)
		);
	}

	private async acquireResolvedPackage(resolved: ResolvedPackage, owner: string, listener: PackageChangeListener): Promise<PackageSnapshot> {
		const key = resolved.identity;
		let record = this.packages.get(key);
		if (!record) {
			record = {
				path: resolved.path,
				kind: resolved.kind,
				initialFiles: resolved.kind === 'folder' ? resolved.files : undefined,
				listeners: new Map(),
				snapshot: emptyPackageSnapshot(),
				loaded: false,
				dirty: false
			};
			this.packages.set(key, record);
		}
		record.listeners.set(owner, listener);
		this.startWatching(key, record);
		if (!record.loadPromise && !record.loaded) {
			record.loadPromise = this.loadPackage(key, record).finally(() => { record!.loadPromise = undefined; });
		}
		return record.loadPromise ? record.loadPromise : record.snapshot;
	}

	async reconcilePackages(
		requests: PackageRequest[],
		owner: string,
		listener: PackageChangeListener
	): Promise<Map<string, { identity: string; snapshot: PackageSnapshot }>> {
		const missionRoot = requests.length > 0 ? path.dirname(requests[0].missionLibFolder) : '';
		const missionCandidates: Array<{ name: string; path: string }> = [];
		const seenMissionPaths = new Set<string>();
		const addMissionCandidate = (candidate: { name: string; path: string }) => {
			const key = this.normalizeSource(candidate.path);
			if (seenMissionPaths.has(key)) return;
			seenMissionPaths.add(key);
			missionCandidates.push(candidate);
		};
		if (missionRoot) {
			try {
				for (const name of getFolders(missionRoot)) {
					if (name !== '__lib__') addMissionCandidate({ name, path: path.join(missionRoot, name) });
				}
			} catch (error) {
				debug(`Unable to enumerate local mission sources in ${missionRoot}`);
				debug(error);
			}
		}
		for (const mission of requests[0]?.artemisMissions ?? []) addMissionCandidate(mission);
		const loadableFilesByPath = new Map<string, string[]>();
		const descriptionsByPath = new Map<string, MissionDescription | undefined>();
		const sourceCandidateDirs = [...missionCandidates.map((mission) => mission.path), ...(requests[0]?.workspaceFolders ?? [])];
		const resolvedByName = new Map<string, ResolvedPackage>();
		for (const request of requests) {
			resolvedByName.set(request.name, this.resolvePackage(request, missionCandidates, loadableFilesByPath, descriptionsByPath, sourceCandidateDirs));
		}

		const uniquePackages = new Map<string, ResolvedPackage>();
		for (const resolved of resolvedByName.values()) uniquePackages.set(resolved.identity, resolved);

		const previousKeys = this.packageKeysByOwner.get(owner) ?? new Set<string>();
		const nextKeys = new Set(uniquePackages.keys());
		const snapshots = new Map<string, PackageSnapshot>();
		const acquisitions = await Promise.allSettled([...uniquePackages.values()].map(async (resolved) => {
				const snapshot = await this.acquireResolvedPackage(resolved, owner, listener);
				snapshots.set(resolved.identity, snapshot);
		}));
		const failedAcquisition = acquisitions.find((result): result is PromiseRejectedResult => result.status === 'rejected');
		if (failedAcquisition) {
			for (const key of nextKeys) {
				if (!previousKeys.has(key)) this.releasePackage(key, owner);
			}
			throw failedAcquisition.reason;
		}

		for (const key of previousKeys) {
			if (!nextKeys.has(key)) this.releasePackage(key, owner);
		}
		if (nextKeys.size > 0) this.packageKeysByOwner.set(owner, nextKeys);
		else this.packageKeysByOwner.delete(owner);

		const result = new Map<string, { identity: string; snapshot: PackageSnapshot }>();
		for (const [name, resolved] of resolvedByName) {
			result.set(name, { identity: resolved.identity, snapshot: snapshots.get(resolved.identity) ?? emptyPackageSnapshot() });
		}
		return result;
	}

	releasePackage(packagePath: string, owner: string): void {
		const key = this.normalizeSource(packagePath);
		this.packageKeysByOwner.get(owner)?.delete(key);
		const record = this.packages.get(key);
		if (!record) return;
		record.listeners.delete(owner);
		if (record.listeners.size > 0) return;
		record.watcher?.close();
		record.parentWatcher?.close();
		if (record.reloadTimer) clearTimeout(record.reloadTimer);
		this.packages.delete(key);
		for (const parsedKey of this.parsedKeysByPackage.get(key) ?? []) {
			const parsed = this.parsedFiles.get(parsedKey);
			if (parsed) {
				parsed.owners.delete(`package:${key}`);
				this.removeParsedFileIfUnused(parsedKey, parsed);
			}
		}
		this.parsedKeysByPackage.delete(key);
	}

	releaseOwnerPackages(owner: string): void {
		const keys = [...(this.packageKeysByOwner.get(owner) ?? [])];
		for (const key of keys) this.releasePackage(key, owner);
		this.packageKeysByOwner.delete(owner);
	}

	private startWatching(key: string, record: PackageRecord): void {
		if (isMochaProcess || record.watcher) return;
		try {
			const packageFileName = path.basename(record.path).toLowerCase();
			const scheduleReload = () => {
				if (record.reloadTimer) clearTimeout(record.reloadTimer);
				record.reloadTimer = setTimeout(() => {
					record.reloadTimer = undefined;
					void this.reloadPackage(record.path).catch((error) => debug(error));
				}, 120);
			};

			if (record.kind === 'folder') {
				if (fs.existsSync(record.path)) {
					record.watcher = fs.watch(record.path, { recursive: true }, scheduleReload);
					record.watcher.on('error', (error) => {
						debug(`Package folder watcher failed for ${record.path}`);
						debug(error);
						record.watcher?.close();
						record.watcher = undefined;
						scheduleReload();
					});
				}
				record.parentWatcher = fs.watch(path.dirname(record.path), (_eventType, fileName) => {
					if (fileName?.toString().toLowerCase() !== packageFileName) return;
					if (fs.existsSync(record.path) && !record.watcher) {
						try { record.watcher = fs.watch(record.path, { recursive: true }, scheduleReload); }
						catch (error) { debug(error); }
					}
					scheduleReload();
				});
				return;
			}

			record.watcher = fs.watch(path.dirname(record.path), (_eventType, fileName) => {
				if (!fileName || fileName.toString().toLowerCase() !== packageFileName) return;
				scheduleReload();
			});
		} catch (error) {
			debug(`Unable to watch library package ${record.path}`);
			debug(error);
		}
	}

	private async loadPackage(key: string, record: PackageRecord): Promise<PackageSnapshot> {
		const nextFiles: ParsedLibraryFile[] = [];
		let committed = false;
		try {
			if (!fs.existsSync(record.path)) {
				if (!record.loaded) throw new Error(`Package source does not exist: ${record.path}`);
			} else if (record.kind === 'archive') {
				const archive = await readZipArchive(record.path);
				for (const [entryName, data] of archive.entries()) {
					if ((!entryName.endsWith('.py') && !entryName.endsWith('.mast')) ||
						entryName.endsWith('__init__.py') || entryName.endsWith('__init__.mast') ||
						/(^|[\\/])tests?([\\/]|$)/i.test(entryName)) continue;
					const file = this.getPackageTempPath(record.path, entryName);
					this.writePackageTempFile(file, data);
					nextFiles.push(this.getParsedFile(data, file, `${record.path}!/${entryName}`));
				}
			} else {
				const files = record.initialFiles ?? this.getLoadableLibraryFiles(record.path);
				record.initialFiles = undefined;
				for (const file of files) {
					const data = await readFile(file).catch((error: unknown) => {
						throw new Error(`Unable to read library source ${file}: ${String(error)}`);
					});
					nextFiles.push(this.getParsedFile(data, file, file));
				}
			}

			if (this.packages.get(key) !== record || record.listeners.size === 0) return record.snapshot;
			for (const parsed of nextFiles) this.retainParsedFile(parsed.key, `package:${key}`);
			this.replacePackageKeys(key, nextFiles);
			record.snapshot = this.aggregatePackage(nextFiles);
			record.loaded = true;
			committed = true;
			debug(`[package] loaded ${record.path} (${record.kind}): files=${record.snapshot.files.length}, py=${record.snapshot.pyFiles.length}, mast=${record.snapshot.mastFiles.length}, labels=${record.snapshot.labels.length}[${record.snapshot.labels.slice(0, 5).map((label) => label.name).join(', ')}], signals=${record.snapshot.signals.length}[${record.snapshot.signals.slice(0, 5).map((signal) => signal.name).join(', ')}]`);
			return record.snapshot;
		} finally {
			if (!committed) {
				for (const parsed of nextFiles) {
					const parsedRecord = this.parsedFiles.get(parsed.key);
					if (parsedRecord) this.removeParsedFileIfUnused(parsed.key, parsedRecord);
				}
			}
		}
	}

	private aggregatePackage(files: ParsedLibraryFile[]): PackageSnapshot {
		const pyFiles = files.flatMap((entry) => entry.pyFile ? [entry.pyFile] : []);
		const mastFiles = files.flatMap((entry) => entry.mastFile ? [entry.mastFile] : []);
		const labels = mastFiles.flatMap((file) => file.labelNames);
		const signalByName = new Map<string, SignalInfo>();
		const mergeSignalLocations = (target: SignalInfo['emit'], incoming: SignalInfo['emit']) => {
			const seen = new Set(target.map((location) => `${location.uri}:${location.range.start.line}:${location.range.start.character}:${location.range.end.line}:${location.range.end.character}`));
			for (const location of incoming) {
				const key = `${location.uri}:${location.range.start.line}:${location.range.start.character}:${location.range.end.line}:${location.range.end.character}`;
				if (!seen.has(key)) {
					seen.add(key);
					target.push(location);
				}
			}
		};
		for (const signal of [...pyFiles.flatMap((file) => file.signals), ...mastFiles.flatMap((file) => file.signals)]) {
			let aggregate = signalByName.get(signal.name);
			if (!aggregate) {
				aggregate = { name: signal.name, description: signal.description, emit: [...signal.emit], triggered: [...signal.triggered] };
				signalByName.set(signal.name, aggregate);
				continue;
			}
			if (!aggregate.description && signal.description) aggregate.description = signal.description;
			mergeSignalLocations(aggregate.emit, signal.emit);
			mergeSignalLocations(aggregate.triggered, signal.triggered);
		}
		return {
			files,
			pyFiles,
			mastFiles,
			labels,
			signals: [...signalByName.values()],
			roles: [...pyFiles.flatMap((file) => file.roles), ...mastFiles.flatMap((file) => file.roles)],
			blobKeys: [...pyFiles.flatMap((file) => file.blob_keys), ...mastFiles.flatMap((file) => file.blob_keys)],
			links: [...pyFiles.flatMap((file) => file.links), ...mastFiles.flatMap((file) => file.links)],
			inventoryKeys: [...pyFiles.flatMap((file) => file.inventory_keys), ...mastFiles.flatMap((file) => file.inventory_keys)],
			sharedVariableKeys: [...pyFiles.flatMap((file) => file.shared_variable_keys), ...mastFiles.flatMap((file) => file.shared_variable_keys)],
			routeLabels: files.flatMap((file) => file.routeLabels),
			styleDefinitions: files.flatMap((file) => file.styleDefinitions)
		};
	}

	async reloadPackage(packagePath: string): Promise<void> {
		const key = this.normalizeSource(packagePath);
		const record = this.packages.get(key);
		if (!record) return;
		record.dirty = true;
		const existing = record.reloadPromise ?? this.packageReloads.get(key);
		if (existing) return existing;
		const reload = (async () => {
			while (record.dirty && this.packages.get(key) === record && record.listeners.size > 0) {
				record.dirty = false;
				if (record.loadPromise) {
					try { await record.loadPromise; } catch { /* The initial acquisition handles the failure. */ }
				}
				if (this.packages.get(key) !== record || record.listeners.size === 0) return;
				const previous = record.snapshot;
				try {
					await this.loadPackage(key, record);
				} catch (error) {
					debug(`Unable to reload package ${record.path}; retaining its last successful snapshot`);
					debug(error);
					continue;
				}
				if (this.packages.get(key) !== record) return;
				if (record.snapshot !== previous) {
					const callbacks = [...record.listeners.entries()];
					await Promise.all(callbacks.map(async ([owner, callback]) => {
						if (record.listeners.get(owner) === callback && this.packages.get(key) === record) {
							await callback(record.path, record.snapshot);
						}
					}));
				}
			}
		})().finally(() => {
			record.reloadPromise = undefined;
			this.packageReloads.delete(key);
		});
		record.reloadPromise = reload;
		this.packageReloads.set(key, reload);
		return reload;
	}

	private replacePackageKeys(key: string, files: ParsedLibraryFile[]): void {
		const nextKeys = new Set(files.map((item) => item.key));
		const previousKeys = this.parsedKeysByPackage.get(key) ?? new Set<string>();
		for (const previousKey of previousKeys) {
			if (nextKeys.has(previousKey)) continue;
			const parsed = this.parsedFiles.get(previousKey);
			if (parsed) {
				parsed.owners.delete(`package:${key}`);
				this.removeParsedFileIfUnused(previousKey, parsed);
			}
		}
		this.parsedKeysByPackage.set(key, nextKeys);
	}

	private removeParsedFileIfUnused(key: string, record: ParsedFileRecord): void {
		if (record.owners.size === 0) this.parsedFiles.delete(key);
	}

	private getPackageTempPath(packagePath: string, entryName: string): string {
		const packageId = createHash('sha256').update(this.normalizeSource(packagePath), 'utf8').digest('hex').slice(0, 20);
		const archiveName = path.basename(packagePath);
		const extension = path.extname(archiveName);
		const archiveStem = extension ? archiveName.slice(0, -extension.length) : archiveName;
		const versionStart = archiveStem.search(/\.v\d+\.\d+\.\d+(?:_|$)/i);
		const logicalPackageName = (versionStart >= 0 ? archiveStem.slice(0, versionStart) : archiveStem)
			.replace(/^artemis-sbs\./i, '');
		const logicalPackagePath = logicalPackageName.split('.').filter(Boolean);
		const entryDirectory = path.dirname(entryName);
		const entryFileName = path.basename(entryName);
		const tempFileName = `READONLY_${entryFileName}`;
		return fixFileName(path.join(os.tmpdir(), 'cosmosModules', packageId, ...logicalPackagePath, entryDirectory, tempFileName));
	}

	private writePackageTempFile(file: string, contents: string): void {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, contents);
	}
}

export const packageManager = new PackageManager();