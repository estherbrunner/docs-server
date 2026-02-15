import { Glob } from 'bun'
import { mkdir } from 'fs/promises'
import { dirname, join } from 'path'

export async function copyAssets(srcDir: string, outDir: string): Promise<void> {
	const assetsDir = join(srcDir, 'assets')
	const outAssetsDir = join(outDir, 'assets')
	const glob = new Glob('**/*')

	try {
		for await (const file of glob.scan(assetsDir)) {
			const srcPath = join(assetsDir, file)
			const destPath = join(outAssetsDir, file)
			const srcFile = Bun.file(srcPath)

			// Skip directories
			if (!(await srcFile.exists())) continue

			await mkdir(dirname(destPath), { recursive: true })
			await Bun.write(destPath, srcFile)
		}
	} catch {
		// No assets directory — nothing to copy
	}
}
