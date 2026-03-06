/**
 * Example usage of the Python lexer and string extractors
 * 
 * This demonstrates how to extract structural information and MAST framework
 * strings from both Python and MAST files.
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import { PythonLexer } from '../data/pythonLexer';
import { StringExtractor } from '../tokens/stringExtractor';

// Example 1: Parse Python file structure
export function parsePythonFile(fileContent: string, uri: string) {
	const doc = TextDocument.create(uri, 'python', 1, fileContent);
	const lexer = new PythonLexer(doc);
	const { classes, functions } = lexer.parse();

	console.log('=== Python File Structure ===');
	
	// Display classes
	for (const cls of classes) {
		console.log(`Class: ${cls.name}`);
		if (cls.bases.length > 0) {
			console.log(`  Inherits from: ${cls.bases.join(', ')}`);
		}
		if (cls.docstring) {
			console.log(`  Docstring: ${cls.docstring.substring(0, 50)}...`);
		}
		
		// Display methods
		for (const method of cls.methods) {
			const args = method.args.map((a: { name: string; type?: string; defaultValue?: string; kind: string }) => {
				let str = a.name;
				if (a.type) str += `: ${a.type}`;
				if (a.defaultValue) str += ` = ${a.defaultValue}`;
				return str;
			}).join(', ');
			
			const returnType = method.returnType ? ` -> ${method.returnType}` : '';
			console.log(`  Method: ${method.name}(${args})${returnType}`);
			
			if (method.decorators.length > 0) {
				console.log(`    Decorators: @${method.decorators.join(', @')}`);
			}
		}
		
		// Display properties
		for (const prop of cls.properties) {
			const type = prop.type ? `: ${prop.type}` : '';
			console.log(`  Property: ${prop.name}${type}`);
		}
	}
	
	// Display module-level functions
	if (functions.length > 0) {
		console.log('\nModule Functions:');
		for (const func of functions) {
			const args = func.args.map((a: { name: string }) => a.name).join(', ');
			const returnType = func.returnType ? ` -> ${func.returnType}` : '';
			console.log(`  ${func.name}(${args})${returnType}`);
		}
	}

	return { classes, functions };
}

// Example 2: Extract MAST framework strings from Python file
function extractMastStringsFromPython(fileContent: string, uri: string) {
	const doc = TextDocument.create(uri, 'python', 1, fileContent);
	const extractor = new StringExtractor(doc);
	const strings = extractor.extractAll();

	console.log('\n=== Extracted MAST Strings ===');
	
	console.log('\nRoles:');
	for (const role of strings.roles) {
		console.log(`  - ${role.name} (${role.locations.length} usage(s))`);
	}
	
	console.log('\nSignals:');
	for (const signal of strings.signals) {
		console.log(`  - ${signal.name}`);
		console.log(`    Emitted: ${signal.emit.length} time(s)`);
		console.log(`    Triggered: ${signal.triggered.length} time(s)`);
	}
	
	console.log('\nInventory Keys:');
	for (const key of strings.inventoryKeys) {
		console.log(`  - ${key.name} (${key.locations.length} usage(s))`);
	}
	
	console.log('\nBlob/Dataset Keys:');
	for (const key of strings.blobKeys) {
		console.log(`  - ${key.name} (${key.locations.length} usage(s))`);
	}
	
	console.log('\nLinks:');
	for (const link of strings.links) {
		console.log(`  - ${link.name} (${link.locations.length} usage(s))`);
	}

	return strings;
}

// Example 3: Extract MAST framework strings from MAST file
function extractMastStringsFromMastFile(fileContent: string, uri: string) {
	const doc = TextDocument.create(uri, 'mast', 1, fileContent);
	const extractor = new StringExtractor(doc);
	const strings = extractor.extractAll();

	console.log('\n=== MAST File Strings ===');
	
	// Same output format as Python
	console.log('\nRoles:', strings.roles.length);
	console.log('Signals:', strings.signals.length);
	console.log('Inventory Keys:', strings.inventoryKeys.length);
	console.log('Blob Keys:', strings.blobKeys.length);
	console.log('Links:', strings.links.length);

	return strings;
}

// Example 4: Combine data from multiple files for autocompletion
function buildAutocompletionData(files: Array<{ uri: string; content: string; type: 'python' | 'mast' }>) {
	const allRoles: string[] = [];
	const allSignals: string[] = [];
	const allInventoryKeys: string[] = [];
	const allBlobKeys: string[] = [];
	const allLinks: string[] = [];

	for (const file of files) {
		const doc = TextDocument.create(file.uri, file.type, 1, file.content);
		const extractor = new StringExtractor(doc);
		const strings = extractor.extractAll();

		// Collect unique names
		allRoles.push(...strings.roles.map(r => r.name));
		allSignals.push(...strings.signals.map(s => s.name));
		allInventoryKeys.push(...strings.inventoryKeys.map(k => k.name));
		allBlobKeys.push(...strings.blobKeys.map(k => k.name));
		allLinks.push(...strings.links.map(l => l.name));
	}

	// Remove duplicates
	return {
		roles: [...new Set(allRoles)],
		signals: [...new Set(allSignals)],
		inventoryKeys: [...new Set(allInventoryKeys)],
		blobKeys: [...new Set(allBlobKeys)],
		links: [...new Set(allLinks)]
	};
}

// Example 5: Detailed Python class analysis
function analyzePythonClass(fileContent: string, uri: string, className: string) {
	const doc = TextDocument.create(uri, 'python', 1, fileContent);
	const lexer = new PythonLexer(doc);
	const { classes } = lexer.parse();

	const cls = classes.find((c: { name: string }) => c.name === className);
	if (!cls) {
		console.log(`Class ${className} not found`);
		return null;
	}

	console.log(`\n=== Analyzing ${className} ===`);
	console.log(`Defined at lines ${cls.startLine}-${cls.endLine}`);
	
	if (cls.docstring) {
		console.log(`\nDocstring:\n${cls.docstring}`);
	}

	console.log(`\nMethods: ${cls.methods.length}`);
	for (const method of cls.methods) {
		console.log(`\n  ${method.isAsync ? 'async ' : ''}def ${method.name}:`);
		
		if (method.docstring) {
			console.log(`    """${method.docstring.substring(0, 50)}..."""`);
		}
		
		console.log(`    Arguments:`);
		for (const arg of method.args) {
			let argInfo = `      - ${arg.name}`;
			if (arg.type) argInfo += `: ${arg.type}`;
			if (arg.defaultValue) argInfo += ` = ${arg.defaultValue}`;
			argInfo += ` [${arg.kind}]`;
			console.log(argInfo);
		}
		
		if (method.returnType) {
			console.log(`    Returns: ${method.returnType}`);
		}
	}

	console.log(`\nProperties: ${cls.properties.length}`);
	for (const prop of cls.properties) {
		let propInfo = `  - ${prop.name}`;
		if (prop.type) propInfo += `: ${prop.type}`;
		if (prop.value) propInfo += ` = ${prop.value}`;
		console.log(propInfo);
	}

	return cls;
}

// Example usage with sample code
const samplePythonCode = `
class SpaceShip:
	"""A spaceship in the game"""
	
	def __init__(self, name: str, hull_strength: int = 100):
		"""Initialize the spaceship"""
		self.name: str = name
		self.hull_strength: int = hull_strength
		add_role(self, "ship")
	
	async def take_damage(self, amount: int) -> bool:
		"""Reduce hull strength by damage amount"""
		self.hull_strength -= amount
		set_inventory_value(self, "damage_taken", amount, 0)
		
		if self.hull_strength <= 0:
			signal_emit("ship_destroyed")
			return True
		return False
	
	@property
	def is_destroyed(self) -> bool:
		return self.hull_strength <= 0

def create_ship(name: str) -> SpaceShip:
	"""Factory function for creating ships"""
	ship = SpaceShip(name)
	link(ship, "player_fleet")
	return ship
`;

// Run examples
if (require.main === module) {
	console.log('PYTHON LEXER AND STRING EXTRACTOR EXAMPLES\n');
	console.log('='.repeat(60));
	
	parsePythonFile(samplePythonCode, 'file:///example.py');
	extractMastStringsFromPython(samplePythonCode, 'file:///example.py');
	analyzePythonClass(samplePythonCode, 'file:///example.py', 'SpaceShip');
}
