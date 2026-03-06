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
 * Extract MAST framework strings from a MAST file using the token-based approach
 */
export function extractStringsFromMastFile(doc: TextDocument): ExtractedStrings {
	// Tokenize the document using the MAST lexer
	const lexer = new MastStateMachineLexer(doc);
	const mastTokens = lexer.tokenize();
	
	// Convert to common token format
	const tokens = convertMastTokens(mastTokens);
	
	// Extract strings using token-based extractor
	const extractor = new TokenBasedExtractor(doc, tokens);
	return extractor.extractAll();
}

/**
 * Get just the roles from a MAST file
 */
export function extractRolesFromMastFile(doc: TextDocument): ReturnType<TokenBasedExtractor['extractRoles']> {
	const lexer = new MastStateMachineLexer(doc);
	const tokens = convertMastTokens(lexer.tokenize());
	const extractor = new TokenBasedExtractor(doc, tokens);
	return extractor.extractRoles();
}

/**
 * Get just the signals from a MAST file
 */
export function extractSignalsFromMastFile(doc: TextDocument): ReturnType<TokenBasedExtractor['extractSignals']> {
	const lexer = new MastStateMachineLexer(doc);
	const tokens = convertMastTokens(lexer.tokenize());
	const extractor = new TokenBasedExtractor(doc, tokens);
	return extractor.extractSignals();
}

/**
 * Get just the inventory keys from a MAST file
 */
export function extractInventoryKeysFromMastFile(doc: TextDocument): ReturnType<TokenBasedExtractor['extractInventoryKeys']> {
	const lexer = new MastStateMachineLexer(doc);
	const tokens = convertMastTokens(lexer.tokenize());
	const extractor = new TokenBasedExtractor(doc, tokens);
	return extractor.extractInventoryKeys();
}

/**
 * Get just the blob keys from a MAST file
 */
export function extractBlobKeysFromMastFile(doc: TextDocument): ReturnType<TokenBasedExtractor['extractBlobKeys']> {
	const lexer = new MastStateMachineLexer(doc);
	const tokens = convertMastTokens(lexer.tokenize());
	const extractor = new TokenBasedExtractor(doc, tokens);
	return extractor.extractBlobKeys();
}

/**
 * Get just the links from a MAST file
 */
export function extractLinksFromMastFile(doc: TextDocument): ReturnType<TokenBasedExtractor['extractLinks']> {
	const lexer = new MastStateMachineLexer(doc);
	const tokens = convertMastTokens(lexer.tokenize());
	const extractor = new TokenBasedExtractor(doc, tokens);
	return extractor.extractLinks();
}
