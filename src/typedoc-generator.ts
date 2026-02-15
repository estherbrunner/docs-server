import { Application } from 'typedoc'
import { mkdtemp, rm, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { FileInfo } from './file-watcher.ts'

export interface TypedocOptions {
	/** Source directory containing TypeScript files */
	sourceDir: string
	/** Entry points for Typedoc (defaults to sourceDir/index.ts) */
	entryPoints?: string[]
	/** Path to tsconfig.json (defaults to sourceDir/../tsconfig.json) */
	tsconfig?: string
}

/**
 * Run Typedoc against the configured source directory,
 * write markdown to a temp directory, and return FileInfo[] for the pipeline.
 */
export async function generateApiDocs(options: TypedocOptions): Promise<FileInfo[]> {
	const {
		sourceDir,
		entryPoints = [join(sourceDir, 'index.ts')],
		tsconfig,
	} = options

	// Create temp directory for Typedoc output
	const tempDir = await mkdtemp(join(tmpdir(), 'docs-server-api-'))

	try {
		const app = await Application.bootstrapWithPlugins({
			entryPoints,
			tsconfig,
			plugin: ['typedoc-plugin-markdown'],
			readme: 'none',
			excludePrivate: true,
			excludeInternal: true,
			outputs: [{
				name: 'markdown',
				path: tempDir,
			}],
		})

		const project = await app.convert()
		if (!project) {
			console.warn('Typedoc: failed to convert project')
			return []
		}

		await app.generateOutputs(project)

		// Read generated markdown files
		return await readMarkdownFiles(tempDir, 'api')
	} catch (err) {
		console.error('Typedoc error:', err)
		return []
	} finally {
		// Clean up temp directory
		await rm(tempDir, { recursive: true, force: true }).catch(() => {})
	}
}

/**
 * Recursively read all .md files from a directory and return as FileInfo[].
 * The path is prefixed with the given section slug (e.g., "api/").
 */
async function readMarkdownFiles(dir: string, sectionSlug: string): Promise<FileInfo[]> {
	const files: FileInfo[] = []
	await walkDir(dir, dir, sectionSlug, files)
	return files
}

async function walkDir(
	baseDir: string,
	currentDir: string,
	sectionSlug: string,
	files: FileInfo[],
): Promise<void> {
	const entries = await readdir(currentDir, { withFileTypes: true })

	for (const entry of entries) {
		const fullPath = join(currentDir, entry.name)

		if (entry.isDirectory()) {
			await walkDir(baseDir, fullPath, sectionSlug, files)
		} else if (entry.name.endsWith('.md')) {
			const content = await Bun.file(fullPath).text()
			const relativePath = fullPath.slice(baseDir.length + 1)

			// Build path as section/relative (e.g., "api/classes/MyClass.md")
			const virtualPath = join(sectionSlug, relativePath)
			const hasher = new Bun.CryptoHasher('sha256')
			hasher.update(content)
			const hash = hasher.digest('hex').slice(0, 12)

			files.push({
				path: virtualPath,
				filename: entry.name,
				content,
				hash,
				lastModified: Date.now(),
				size: content.length,
				exists: true,
			})
		}
	}
}

/**
 * Clean up Typedoc markdown output for use in our Markdoc pipeline.
 * - Strips the auto-generated breadcrumb/navigation lines
 * - Adds frontmatter if missing
 */
export function cleanupTypedocMarkdown(content: string, filename: string): string {
	let cleaned = content

	// Remove breadcrumb navigation lines (e.g., "[**packagename**](../README.md) / ...")
	cleaned = cleaned.replace(/^\[?\*\*[^*]+\*\*\]?\([^)]*\)\s*[/•].*$/gm, '')

	// Remove "Defined in" lines
	cleaned = cleaned.replace(/^(?:#+\s+)?Defined in:?\s+.*$/gm, '')

	// Trim leading blank lines
	cleaned = cleaned.replace(/^\n+/, '')

	// Add frontmatter if not present
	if (!cleaned.startsWith('---')) {
		const title = extractTitle(cleaned, filename)
		cleaned = `---\ntitle: "${title}"\n---\n\n${cleaned}`
	}

	return cleaned
}

function extractTitle(content: string, filename: string): string {
	// Try to extract from first heading
	const headingMatch = content.match(/^#\s+(.+)$/m)
	if (headingMatch) return headingMatch[1].replace(/"/g, '\\"')

	// Fall back to filename
	return filename.replace(/\.md$/, '')
}
