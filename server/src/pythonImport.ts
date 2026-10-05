import { CompletionItem, TextEdit } from 'vscode-languageserver';

/**
 * Add a Python import edit for a selected source-backed completion item.
 * The first module name is preferred; later names are compatibility fallbacks.
 */
export function addPythonAutoImport(
	completionItem: CompletionItem,
	text: string,
	moduleNames: Array<string | undefined>
): CompletionItem {
	if (!completionItem.data) {
		return completionItem;
	}

	const functionName = (completionItem.data.functionName as string)
		|| (completionItem.data.className as string);
	const candidates = [...new Set(moduleNames.filter((name): name is string => !!name))];
	if (!functionName || candidates.length === 0) {
		return completionItem;
	}

	let moduleName = candidates[0];
	for (const candidate of candidates) {
		if (isAlreadyImported(text, candidate, functionName)) {
			return completionItem;
		}
	}

	let existingImportMatch: { line: number; lineContent: string; imports: string[] } | undefined;
	for (const candidate of candidates) {
		const match = findExistingImportFromModule(text, candidate);
		if (match) {
			existingImportMatch = match;
			moduleName = candidate;
			break;
		}
	}

	if (existingImportMatch) {
		const { line, lineContent, imports } = existingImportMatch;
		if (!imports.some((imported) => imported.split(/\s+as\s+/)[0].trim() === functionName)) {
			const updatedLine = `from ${moduleName} import ${[...imports, functionName].join(', ')}`;
			completionItem.additionalTextEdits = [TextEdit.replace(
				{ start: { line, character: 0 }, end: { line, character: lineContent.length } },
				updatedLine
			)];
		}
		return completionItem;
	}

	completionItem.additionalTextEdits = [TextEdit.insert(
		{ line: 0, character: 0 },
		`from ${moduleName} import ${functionName}\n`
	)];
	return completionItem;
}

/** Resolve a source file path to its importable sbs_utils module name. */
export function extractPythonModuleName(sourceFile: string): string | undefined {
	if (sourceFile.includes('sbs.py') || sourceFile.includes('sbs\\sbs.py')) {
		return 'sbs';
	}
	if (sourceFile.includes('sbs_utils')) {
		const match = sourceFile.match(/sbs_utils[\\/](.+?)\.py$/);
		if (match) {
			// PackageManager prefixes extracted archive files with READONLY_ on disk;
			// strip it because it is not part of the importable Python module name.
			const modulePath = match[1].replace(/(^|[\\/])READONLY_/g, '$1').replace(/[\\/]/g, '.');
			if (modulePath.startsWith('sbs_utils.')) {
				return modulePath;
			}
			return 'sbs_utils.' + modulePath;
		}
		return 'sbs_utils';
	}
	return undefined;
}

function findExistingImportFromModule(text: string, moduleName: string): { line: number; lineContent: string; imports: string[] } | undefined {
	const lines = text.split('\n');
	const importRegex = /^\s*from\s+([^\s]+)\s+import\s+(.+)$/;

	for (let i = 0; i < lines.length; i++) {
		const lineContent = lines[i];
		const match = importRegex.exec(lineContent.trim());
		if (!match || match[1].trim() !== moduleName) {
			continue;
		}

		let importPart = match[2];
		const commentIndex = importPart.indexOf('#');
		if (commentIndex >= 0) {
			importPart = importPart.slice(0, commentIndex);
		}
		const imports = importPart.split(',').map((item) => item.trim()).filter(Boolean);
		return { line: i, lineContent, imports };
	}
	return undefined;
}

function isAlreadyImported(text: string, moduleName: string, functionName: string): boolean {
	const escapedModule = moduleName.replace(/\./g, '\\.');
	const importRegex = new RegExp(`from\\s+${escapedModule}\\s+import\\s+[^\\n]*\\b${functionName}\\b`, 'm');
	if (importRegex.test(text)) {
		return true;
	}
	const fullModuleRegex = new RegExp(`import\\s+${escapedModule}`, 'm');
	return fullModuleRegex.test(text);
}
