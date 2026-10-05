import * as path from 'path';
import * as vscode from 'vscode';

/** Adds subdued Explorer styling to mission files omitted from their directory's init file. */
export class InitFileDecorationProvider implements vscode.FileDecorationProvider {
	private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
	private readonly initEntriesByPath = new Map<string, Promise<{ entries: Set<string>; pythonInitExists: boolean }>>();
	readonly onDidChangeFileDecorations = this.changeEmitter.event;

	provideFileDecoration(uri: vscode.Uri, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.FileDecoration> {
		if (!this.isEligibleFile(uri)) {
			return undefined;
		}

		const baseName = path.basename(uri.fsPath);
		const initPath = path.join(path.dirname(uri.fsPath), '__init__.mast');
		return this.getInitEntries(initPath).then(({ entries, pythonInitExists }) => {
			if ((pythonInitExists && path.extname(uri.fsPath).toLowerCase() === '.py') || this.isListed(baseName, entries)) {
				return undefined;
			}

			return new vscode.FileDecoration(
				undefined,
				'Not listed in this folder\'s __init__.mast',
				new vscode.ThemeColor('disabledForeground')
			);
		});
	}

	/** Append the selected mission file to its sibling init file, avoiding duplicate imports. */
	async addFileToInit(uri: vscode.Uri): Promise<'added' | 'already-listed' | 'ineligible'> {
		if (!this.isEligibleFile(uri)) {
			return 'ineligible';
		}

		const initPath = path.join(path.dirname(uri.fsPath), '__init__.mast');
		let contents = '';
		try {
			contents = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(initPath))).toString('utf8');
		} catch (error) {
			if (!(error instanceof vscode.FileSystemError) || error.code !== 'FileNotFound') {
				throw error;
			}
		}

		const baseName = path.basename(uri.fsPath);
		if (this.isListed(baseName, this.parseInitEntries(contents))) {
			return 'already-listed';
		}

		const lineBreak = contents.length > 0 && !contents.endsWith('\n') ? '\n' : '';
		const updatedContents = `${contents}${lineBreak}import ${baseName}\n`;
		await vscode.workspace.fs.writeFile(vscode.Uri.file(initPath), Buffer.from(updatedContents, 'utf8'));
		this.refresh();
		return 'added';
	}

	/** Re-read init files and refresh visible Explorer items after an init file changes. */
	refresh(): void {
		this.initEntriesByPath.clear();
		this.changeEmitter.fire(undefined);
	}

	dispose(): void {
		this.changeEmitter.dispose();
	}

	/** Restrict decorations to files below Missions/<mission>, excluding mission-root files. */
	private getMissionRoot(filePath: string): string | undefined {
		const segments = path.resolve(filePath).split(path.sep);
		const missionsIndex = segments.findIndex((segment) => segment.toLowerCase() === 'missions');
		if (missionsIndex < 0 || missionsIndex + 1 >= segments.length - 1) {
			return undefined;
		}

		return path.join(...segments.slice(0, missionsIndex + 2));
	}

	/** Accept only nested mission source files that are not init files themselves. */
	private isEligibleFile(uri: vscode.Uri): boolean {
		if (uri.scheme !== 'file' || !/\.(mast|py)$/i.test(uri.fsPath)) {
			return false;
		}

		if (/^__init__\.(mast|py)$/i.test(path.basename(uri.fsPath))) {
			return false;
		}

		const missionRoot = this.getMissionRoot(uri.fsPath);
		return !!missionRoot && !this.pathsEqual(path.dirname(uri.fsPath), missionRoot);
	}

	/** Read each sibling init file once until a filesystem event invalidates the cache. */
	private getInitEntries(initPath: string): Promise<{ entries: Set<string>; pythonInitExists: boolean }> {
		const cacheKey = process.platform === 'win32' ? initPath.toLowerCase() : initPath;
		let pendingEntries = this.initEntriesByPath.get(cacheKey);
		if (!pendingEntries) {
			pendingEntries = Promise.resolve(vscode.workspace.fs.readFile(vscode.Uri.file(initPath))).then(
				(contents) => ({ entries: this.parseInitEntries(Buffer.from(contents).toString('utf8')), pythonInitExists: false }),
				async () => {
					try {
						await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(path.dirname(initPath), '__init__.py')));
						return { entries: new Set<string>(), pythonInitExists: true };
					} catch {
						return { entries: new Set<string>(), pythonInitExists: false };
					}
				}
			);
			this.initEntriesByPath.set(cacheKey, pendingEntries);
		}
		return pendingEntries;
	}

	/** Match imports by their module basename, consistent with MAST's init-file checks. */
	private parseInitEntries(contents: string): Set<string> {
		const entries = new Set<string>();
		for (const sourceLine of contents.split(/\r?\n/)) {
			const line = sourceLine.split('#', 1)[0].trim();
			if (!line) {
				continue;
			}

			const importIndex = line.startsWith('from ') ? line.indexOf(' import ') : -1;
			const importedNames = importIndex >= 0
				? line.slice(importIndex + ' import '.length)
				: line.replace(/^import\s+/, '');
			for (const importedName of importedNames.split(',')) {
				const moduleName = importedName.trim().split(/\s+as\s+/i, 1)[0].trim();
				if (!moduleName) {
					continue;
				}

				const leafName = moduleName.replace(/\\/g, '/').split('/').pop() || moduleName;
				const lowerName = leafName.toLowerCase();
				const moduleBase = lowerName.replace(/\.(mast|py)$/i, '');
				const dottedBase = moduleBase.includes('.') ? moduleBase.split('.').pop() || moduleBase : moduleBase;
				entries.add(lowerName);
				entries.add(moduleBase);
				entries.add(dottedBase);
			}
		}
		return entries;
	}

	private isListed(fileName: string, entries: Set<string>): boolean {
		const lowerName = fileName.toLowerCase();
		const moduleBase = lowerName.replace(/\.(mast|py)$/i, '');
		return entries.has(lowerName) || entries.has(moduleBase);
	}

	private pathsEqual(left: string, right: string): boolean {
		const normalizedLeft = path.resolve(left);
		const normalizedRight = path.resolve(right);
		return process.platform === 'win32'
			? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
			: normalizedLeft === normalizedRight;
	}
}