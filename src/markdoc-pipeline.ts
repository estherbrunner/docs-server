import Markdoc, { type Schema } from '@markdoc/markdoc'
import { parse as parseYaml } from 'yaml'
import type { FileInfo } from './file-watcher.ts'

export interface Frontmatter {
	title: string
	description?: string
	layout?: string
	[key: string]: unknown
}

export interface Heading {
	level: number
	text: string
	id: string
}

export interface PageData {
	slug: string
	filePath: string
	frontmatter: Frontmatter
	content: string
	headings: Heading[]
}

export interface MarkdocSchemaSet {
	nodes: Record<string, Schema>
	tags: Record<string, Schema>
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.trim()
}

function extractHeadings(ast: ReturnType<typeof Markdoc.parse>): Heading[] {
	const headings: Heading[] = []

	function walk(node: { type?: string; attributes?: Record<string, unknown>; children?: unknown[] }) {
		if (node.type === 'heading' && node.attributes?.level === 2) {
			const text = getTextContent(node)
			headings.push({
				level: 2,
				text,
				id: slugify(text),
			})
		}
		if (node.children) {
			for (const child of node.children) {
				if (child && typeof child === 'object') walk(child as typeof node)
			}
		}
	}

	walk(ast)
	return headings
}

function getTextContent(node: { type?: string; attributes?: Record<string, unknown>; children?: unknown[] }): string {
	if (node.type === 'text') return String(node.attributes?.content ?? '')
	if (!node.children) return ''
	return node.children
		.map(child => (child && typeof child === 'object' ? getTextContent(child as typeof node) : ''))
		.join('')
}

function parseFrontmatter(raw: string | undefined): Frontmatter {
	if (!raw) return { title: '' }
	try {
		const parsed = parseYaml(raw) as Record<string, unknown>
		return { title: '', ...parsed }
	} catch {
		return { title: '' }
	}
}

function filePathToSlug(filePath: string, srcDir: string): string {
	let slug = filePath
		.replace(srcDir, '')
		.replace(/^\//, '')
		.replace(/\.md$/, '')

	// index files map to directory root
	if (slug === 'index') slug = ''
	else if (slug.endsWith('/index')) slug = slug.slice(0, -'/index'.length)

	return slug
}

export function processMarkdoc(
	file: FileInfo,
	schemas: MarkdocSchemaSet,
	srcDir: string,
	variables?: Record<string, unknown>,
): PageData {
	const ast = Markdoc.parse(file.content)
	const frontmatter = parseFrontmatter(ast.attributes.frontmatter as string | undefined)
	const headings = extractHeadings(ast)

	const config = {
		nodes: schemas.nodes,
		tags: schemas.tags,
		variables: {
			...variables,
			frontmatter,
		},
	}

	const transformed = Markdoc.transform(ast, config)
	const content = Markdoc.renderers.html(transformed)

	return {
		slug: filePathToSlug(file.path, srcDir),
		filePath: file.path,
		frontmatter,
		content,
		headings,
	}
}
