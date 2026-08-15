import { integer, SemanticTokens } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { debug } from 'console';
import { TokenInfo } from './semanticTokens';
import { getCache, MissionCache } from '../cache';
import { isClassMethod } from '../tokens/tokens';

/**
 * Caching layer for semantic tokens to avoid re-tokenizing unchanged documents
 * Uses a version-based caching strategy
 */
export class SemanticTokensCache {
	private cache: Map<string, {
		version: integer;
		tokens: SemanticTokens;
		timestamp: number;
	}> = new Map();

	private maxCacheSize: integer = 10; // Cache at most 10 documents
	private cacheLifetime: number = 5 * 60 * 1000; // 5 minutes in milliseconds

	/**
	 * Get cached tokens if available and still valid
	 * @returns Cached tokens or null if not available/invalid
	 */
	public get(uri: string, currentVersion: integer): SemanticTokens | null {
		const entry = this.cache.get(uri);
		
		if (!entry) {
			return null;
		}

		// Check if version matches and cache hasn't expired
		if (entry.version === currentVersion && 
		    Date.now() - entry.timestamp < this.cacheLifetime) {
			debug(`Cache hit for ${uri} (v${currentVersion})`);
			return entry.tokens;
		}

		// Cache is stale
		this.cache.delete(uri);
		return null;
	}

	/**
	 * Store tokens in cache
	 */
	public set(uri: string, version: integer, tokens: SemanticTokens): void {
		// Implement simple LRU eviction if cache is full
		if (this.cache.size >= this.maxCacheSize) {
			const oldestUri = this.cache.keys().next().value;
			if (oldestUri) {
				this.cache.delete(oldestUri);
				debug(`Evicted cache entry for ${oldestUri}`);
			}
		}

		this.cache.set(uri, {
			version,
			tokens,
			timestamp: Date.now()
		});
		debug(`Cached semantic tokens for ${uri} (v${version})`);
	}

	/**
	 * Invalidate cache entry when document is closed
	 */
	public invalidate(uri: string): void {
		if (this.cache.has(uri)) {
			this.cache.delete(uri);
			debug(`Invalidated cache for ${uri}`);
		}
	}

	/**
	 * Clear entire cache
	 */
	public clear(): void {
		this.cache.clear();
		debug('Cleared semantic tokens cache');
	}

	/**
	 * Get cache statistics (for debugging)
	 */
	public getStats() {
		return {
			size: this.cache.size,
			maxSize: this.maxCacheSize,
			entries: Array.from(this.cache.keys())
		};
	}
}

// Global cache instance
let globalCache: SemanticTokensCache | null = null;

/**
 * Get the global semantic tokens cache instance
 */
export function getSemanticTokensCache(): SemanticTokensCache {
	if (!globalCache) {
		globalCache = new SemanticTokensCache();
	}
	return globalCache;
}

/**
 * Reset the global cache (useful for testing or memory management)
 */
export function resetSemanticTokensCache(): void {
	globalCache = null;
}

export function convertVariableTokensToLabelOrFunction(tokens: TokenInfo[], text:TextDocument): void {
	const cache = getCache(text.uri);
	const labelLookupCache = new Map<string, boolean>();
	const moduleLookupCache = new Map<string, boolean>();
	const methodLookupCache = new Map<string, boolean>();
	for (const token of tokens) {
		if (token.type === 'variable' && token.modifier === 'reference') {
			let isLabelReference = labelLookupCache.get(token.text);
			if (isLabelReference === undefined) {
				const labelNames = cache.getLabelsAtPos(text, text.offsetAt({ line: token.line, character: token.character }), false);
				isLabelReference = labelNames.find(l => l.name === token.text) !== undefined;
				labelLookupCache.set(token.text, isLabelReference);
			}
			if (isLabelReference) {
				token.type = token.text.startsWith('//') ? 'route-label' : 'label';
				continue;
			}
			
			// if (cache.getLabel(token.text, false)) {
			// 	token.type = token.text.startsWith('//') ? 'route-label' : 'label';
			// 	continue;
			// }
			const normalized = token.text;
			let isModuleReference = moduleLookupCache.get(normalized);
			if (isModuleReference === undefined) {
				isModuleReference = !!cache.getMastGlobal(normalized);
				moduleLookupCache.set(normalized, isModuleReference);
			}
			if (isModuleReference) {
				token.type = 'module';
				token.modifier = 'reference';
				continue;
			}
			// This line was causing variables to show up as class methods (and properties) improperly
			// if (cache.getMethod(normalized) || (cache.getPossibleMethods(normalized) || []).length > 0) {
			let isMethodReference = methodLookupCache.get(normalized);
			if (isMethodReference === undefined) {
				isMethodReference = !!cache.getMethod(normalized);
				methodLookupCache.set(normalized, isMethodReference);
			}
			if (isMethodReference) {
				token.type = 'function';
				continue;
			}
		}
	}
}
