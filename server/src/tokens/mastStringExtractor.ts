import { TextDocument } from 'vscode-languageserver-textdocument';
import { MastStateMachineLexer, TokenInfo } from '../requests/semanticTokens';
import { TokenBasedExtractor, Token, ExtractedStrings } from './tokenBasedExtractor';

/**
 * Adapter to convert MAST lexer tokens to the format expected by TokenBasedExtractor
 */
export function convertMastTokens(tokens: TokenInfo[]): Token[] {
	return tokens.map(t => ({
		type: t.type,
		text: t.text,
		line: t.line,
		character: t.character,
		length: t.length,
		modifier: t.modifier
	}));
}

/**
 * Tokenize a MAST file once for reuse across multiple extractions
 */
export function tokenizeMastFile(doc: TextDocument): Token[] {
	const lexer = new MastStateMachineLexer(doc);
	const mastTokens = lexer.tokenize();
	return convertMastTokens(mastTokens);
}

/**
 * Tokenize a slice of the given document between startOffset (inclusive)
 * and endOffset (exclusive). The slice should begin at the start of a line
 * (character 0) to simplify position mapping.
 */
export function tokenizeMastSlice(doc: TextDocument, sliceStartOffset: number, sliceEndOffset: number): Token[] {
	const baseLine = doc.positionAt(sliceStartOffset).line;
	const text = doc.getText().substring(sliceStartOffset, sliceEndOffset);
	const tempDoc = TextDocument.create(doc.uri, 'mast', doc.version, text);
	const tokens = tokenizeMastFile(tempDoc);
	return tokens.map(t => ({ ...t, line: t.line + baseLine }));
}

/**
 * Create an extractor with optional pre-computed tokens
 */
function createExtractor(doc: TextDocument, tokens?: Token[]): TokenBasedExtractor {
	const resolvedTokens = tokens ?? tokenizeMastFile(doc);
	return new TokenBasedExtractor(doc, resolvedTokens);
}

/**
 * Extract MAST framework strings from a MAST file using the token-based approach
 */
export function extractStringsFromMastFile(doc: TextDocument, tokens?: Token[]): ExtractedStrings {
	return createExtractor(doc, tokens).extractAll();
}

/**
 * Get just the roles from a MAST file
 */
export function extractRolesFromMastFile(doc: TextDocument, tokens?: Token[]): ReturnType<TokenBasedExtractor['extractRoles']> {
	return createExtractor(doc, tokens).extractRoles();
}

/**
 * Get just the signals from a MAST file
 */
export function extractSignalsFromMastFile(doc: TextDocument, tokens?: Token[]): ReturnType<TokenBasedExtractor['extractSignals']> {
	return createExtractor(doc, tokens).extractSignals();
}

/**
 * Get just the inventory keys from a MAST file
 */
export function extractInventoryKeysFromMastFile(doc: TextDocument, tokens?: Token[]): ReturnType<TokenBasedExtractor['extractInventoryKeys']> {
	return createExtractor(doc, tokens).extractInventoryKeys();
}

/**
 * Get just the blob keys from a MAST file
 */
export function extractBlobKeysFromMastFile(doc: TextDocument, tokens?: Token[]): ReturnType<TokenBasedExtractor['extractBlobKeys']> {
	return createExtractor(doc, tokens).extractBlobKeys();
}

/**
 * Get just the links from a MAST file
 */
export function extractLinksFromMastFile(doc: TextDocument, tokens?: Token[]): ReturnType<TokenBasedExtractor['extractLinks']> {
	return createExtractor(doc, tokens).extractLinks();
}
