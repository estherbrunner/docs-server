import type { Schema } from '@markdoc/markdoc'
import { Glob } from 'bun'
import { join } from 'path'
import type { MarkdocSchemaSet } from './markdoc-pipeline.ts'

// Known Markdoc node names — schemas matching these are treated as nodes, not tags
const NODE_NAMES = new Set([
	'document', 'heading', 'paragraph', 'fence', 'blockquote',
	'list', 'item', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
	'hr', 'image', 'link', 'em', 'strong', 'code', 'text', 's',
	'hardbreak', 'softbreak', 'inline',
])

function schemaNameFromPath(filePath: string): string {
	const filename = filePath.split('/').pop() ?? ''
	return filename.replace(/\.markdoc\.(ts|js)$/, '')
}

async function loadSchemasFromDir(dir: string): Promise<Record<string, Schema>> {
	const schemas: Record<string, Schema> = {}
	const glob = new Glob('*.markdoc.{ts,js}')

	try {
		for await (const file of glob.scan(dir)) {
			const filePath = join(dir, file)
			const mod = await import(filePath)
			const schema = mod.default as Schema
			if (schema) {
				schemas[schemaNameFromPath(file)] = schema
			}
		}
	} catch {
		// Directory doesn't exist — no schemas to load
	}

	return schemas
}

export async function resolveSchemas(
	builtinDir: string,
	userDir: string,
): Promise<MarkdocSchemaSet> {
	const builtinSchemas = await loadSchemasFromDir(builtinDir)
	const userSchemas = await loadSchemasFromDir(userDir)

	// User schemas override built-in schemas
	const merged = { ...builtinSchemas, ...userSchemas }

	const nodes: Record<string, Schema> = {}
	const tags: Record<string, Schema> = {}

	for (const [name, schema] of Object.entries(merged)) {
		if (NODE_NAMES.has(name)) {
			nodes[name] = schema
		} else {
			tags[name] = schema
		}
	}

	return { nodes, tags }
}
