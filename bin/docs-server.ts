#!/usr/bin/env bun

import { loadConfig } from '../src/config.ts'
import { createPipeline } from '../src/pipeline.ts'

const command = process.argv[2]

if (!command || !['dev', 'build'].includes(command)) {
	console.log('Usage: docs-server <command>')
	console.log('')
	console.log('Commands:')
	console.log('  dev    Start dev server with file watching and HMR')
	console.log('  build  Build static site for production')
	process.exit(1)
}

const cwd = process.cwd()

if (command === 'build') {
	console.log('Building documentation...')
	const config = await loadConfig(cwd)
	const pipeline = await createPipeline(config, { watch: false })

	await pipeline.build()
	pipeline.dispose()
	console.log('Build complete.')
}

if (command === 'dev') {
	console.log('Dev server not yet implemented (Phase 2)')
	process.exit(1)
}
