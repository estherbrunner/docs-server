import type { PageData } from './markdoc-pipeline.ts'

export interface RenderOptions {
	title: string
	baseUrl: string
	navHtml: string
	cssPath?: string
	jsPath?: string
	isDev?: boolean
}

export function renderPage(
	page: PageData,
	layoutHtml: string,
	options: RenderOptions,
): string {
	const pageTitle = page.frontmatter.title
		? `${page.frontmatter.title} — ${options.title}`
		: options.title

	let html = layoutHtml
		.replace('<!-- content -->', page.content)
		.replace('<!-- menu -->', options.navHtml)
		.replace('<!-- title -->', pageTitle)

	// Auto-inject <title> into <head> if not present
	if (!html.includes('<title>')) {
		html = html.replace('</head>', `  <title>${pageTitle}</title>\n</head>`)
	}

	// Inject CSS before </head>
	if (options.cssPath) {
		const cssTag = `  <link rel="stylesheet" href="${options.baseUrl}${options.cssPath}">\n`
		html = html.replace('</head>', `${cssTag}</head>`)
	}

	// Inject JS before </body>
	if (options.jsPath) {
		const jsTag = `  <script type="module" src="${options.baseUrl}${options.jsPath}"></script>\n`
		html = html.replace('</body>', `${jsTag}</body>`)
	}

	// Inject meta description if present
	if (page.frontmatter.description) {
		const metaTag = `  <meta name="description" content="${escapeAttr(page.frontmatter.description)}">\n`
		html = html.replace('</head>', `${metaTag}</head>`)
	}

	return html
}

function escapeAttr(str: string): string {
	return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function generateNavHtml(
	pages: { slug: string; title: string }[],
	navOrder: string[],
	baseUrl: string,
): string {
	// Order pages according to nav config, then include any remaining
	const ordered = navOrder
		.map(name => pages.find(p => p.slug === name || (name === 'index' && p.slug === '')))
		.filter(Boolean) as { slug: string; title: string }[]

	// Add pages not in nav config at the end
	const remaining = pages.filter(
		p => !navOrder.includes(p.slug) && !navOrder.includes(p.slug === '' ? 'index' : p.slug),
	)

	const allItems = [...ordered, ...remaining]

	const items = allItems
		.map(p => {
			const href = p.slug === '' ? `${baseUrl}` : `${baseUrl}${p.slug}/`
			return `    <li><a href="${href}">${escapeAttr(p.title)}</a></li>`
		})
		.join('\n')

	return `<nav>\n  <ul>\n${items}\n  </ul>\n</nav>`
}
