# docs-server

A static site generator that transforms [Markdoc](https://markdoc.dev/) files into HTML pages enhanced with [Le Truc](https://github.com/zeixcom/le-truc) Web Components. The build pipeline is orchestrated by [Cause & Effect](https://github.com/nicolo-ribaudo/cause-effect) signals for reactive, incremental rebuilds.

Designed for TypeScript library authors who want a documentation site deployable to GitHub Pages.

## Install

```bash
bun add -d docs-server
```

Requires [Bun](https://bun.sh/) as the runtime.

## Quick start

1. Create a `docs-server.config.ts` in your project root:

```typescript
export default {
  title: 'My Library',
  baseUrl: '/',
  nav: ['index', 'getting-started', 'api'],
}
```

2. Add markdown files in `docs-src/`:

```markdown
---
title: Home
description: Welcome to My Library
---

# My Library

Welcome to the documentation.
```

3. Run a build or start the dev server:

```bash
# Development with live reload
bunx docs-server dev

# Production build
bunx docs-server build
```

The output is written to `docs/` by default, ready for GitHub Pages.

## Project structure

```
your-library/
├── src/                            # TypeScript source (Typedoc input)
├── docs-src/                       # Documentation source
│   ├── layout.html                 # Layout template
│   ├── index.md                    # → /
│   ├── getting-started.md          # → /getting-started/
│   ├── guides/
│   │   └── advanced.md             # → /guides/advanced/
│   └── assets/                     # Copied to docs/assets/
├── components/                     # Web Components (Le Truc)
│   ├── main.ts                     # JS entry point
│   └── main.css                    # CSS entry point
├── docs-server/                    # Customizations
│   └── schema/                     # Custom Markdoc schemas
│       └── fence.markdoc.ts        # Overrides built-in fence
├── docs/                           # Build output
└── docs-server.config.ts           # Configuration
```

Routing is file-based. `docs-src/index.md` becomes `/`, `docs-src/guides/advanced.md` becomes `/guides/advanced/`.

## Configuration

All options have sensible defaults. A minimal config only needs `title` and `nav`:

```typescript
// docs-server.config.ts
export default {
  title: 'My Library',              // Site title (used in <title> and nav)
  baseUrl: '/',                     // Base URL for all links
  srcDir: 'docs-src',              // Markdown source directory
  outDir: 'docs',                  // Build output directory
  typedocSource: 'src',            // TypeScript source for API docs
  componentsDir: 'components',     // Web Components directory
  schemaDir: 'docs-server/schema', // Custom Markdoc schema overrides
  nav: ['index', 'getting-started', 'api'],
}
```

The `nav` array controls page order in the navigation. Use the slug `'api'` to position the auto-generated API Reference section. Pages not listed in `nav` are appended at the end.

## Layout template

Create `docs-src/layout.html` with HTML comment placeholders:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
  <header><!-- menu --></header>
  <main>
    <article><!-- content --></article>
  </main>
</body>
</html>
```

**Placeholders:**

| Placeholder | Replaced with |
|---|---|
| `<!-- content -->` | Rendered Markdoc HTML |
| `<!-- menu -->` | Generated navigation |
| `<!-- title -->` | Page title text |

The following are injected automatically (no placeholder needed):

- `<title>` — into `<head>` if not already present
- `<meta name="description">` — from frontmatter `description` field
- `<link rel="stylesheet">` — CSS bundle, before `</head>`
- `<script type="module">` — JS bundle, before `</body>`

If no `layout.html` exists, a minimal default is used.

## Frontmatter

Each markdown file supports YAML frontmatter:

```markdown
---
title: Getting Started
description: How to set up the library
layout: custom
---
```

`title` is used in `<title>` and navigation. `description` becomes a `<meta>` tag.

## Built-in Markdoc schemas

### Code blocks (fence)

Fenced code blocks render as `<module-codeblock>` with a copy button and language label:

````markdown
```typescript
const x = 1
```
````

Specify a filename with the `#` syntax:

````markdown
```typescript#config.ts
export default { title: 'My Docs' }
```
````

Code blocks longer than 10 lines are automatically collapsed with an expand button.

### Callouts

```markdown
{% callout type="tip" title="Hot tip" %}
Use `bun run dev` for live reload.
{% /callout %}
```

Types: `note` (default), `warning`, `caution`, `tip`.

### Headings

H1–H6 headings get auto-generated `id` attributes for anchor linking:

```markdown
## My Section
<!-- renders as <h2 id="my-section">My Section</h2> -->
```

## Custom schemas

Override built-in schemas or add new ones by placing `*.markdoc.ts` files in `docs-server/schema/`:

```typescript
// docs-server/schema/callout.markdoc.ts — overrides the built-in
import { type Schema, Tag } from '@markdoc/markdoc'

const callout: Schema = {
  render: 'my-callout',
  attributes: {
    type: { type: String, default: 'info' },
  },
  transform(node, config) {
    return new Tag('my-callout', node.transformAttributes(config), node.transformChildren(config))
  },
}

export default callout
```

Schemas matching known Markdoc node names (`heading`, `fence`, `paragraph`, etc.) are registered as nodes. Everything else is registered as a tag.

## Components

docs-server ships with built-in Le Truc Web Components for the default schemas. To use them, create `components/main.ts`:

```typescript
import 'docs-server/components'
```

And `components/main.css` for styles:

```css
@import '../node_modules/docs-server/components/main.css';

/* Your custom styles */
```

Components are bundled with `Bun.build()`. In production, output files use content-hashed filenames (`main.[hash].js`). In development, bundles are unminified with inline sourcemaps.

### Adding custom components

Define Le Truc components and import them in `components/main.ts`:

```typescript
import 'docs-server/components'
import './my-widget/my-widget.ts'
```

Then create a matching Markdoc schema in `docs-server/schema/` to use your component in markdown.

## API documentation

If a `src/` directory (or the configured `typedocSource`) exists, docs-server runs [Typedoc](https://typedoc.org/) to generate API reference pages from your TypeScript source.

API pages are automatically grouped in the navigation under "API Reference" with sub-sections for Interfaces, Functions, Type Aliases, Classes, and Enumerations.

Add `'api'` to your `nav` array to control where the API section appears:

```typescript
export default {
  nav: ['index', 'getting-started', 'api'],
}
```

In dev mode, changing a TypeScript source file triggers Typedoc regeneration and a page reload.

## Dev server

`bunx docs-server dev` starts a local server with:

- Static file serving from the output directory
- WebSocket-based HMR at `/__hmr`
- Full page reload on content changes
- CSS hot-swap without reload on style changes
- Auto-reconnect on connection loss

The default port is 3000.

## Programmatic API

docs-server exports its internals for advanced use cases:

```typescript
import {
  loadConfig,
  createPipeline,
  startDevServer,
  processMarkdoc,
  resolveSchemas,
  bundleComponents,
  generateApiDocs,
} from 'docs-server'
```

See the generated API reference for full details on each export.

## How it works

The build pipeline uses Cause & Effect signals for dependency tracking:

```
Markdown files (List<FileInfo>)
  → Markdoc transform (deriveCollection)
  → Layout + render (Effect)
  → Write HTML

TypeScript source (List<FileInfo>)
  → Typedoc (Task)
  → Markdoc transform
  → Merge with pages

Components (List<FileInfo>)
  → Bun.build() (Task)
  → JS + CSS bundles

Static assets (List<FileInfo>)
  → Copy to output (Task)
```

File changes propagate through the reactive graph, triggering only the minimal set of rebuilds needed. Each markdown file is processed independently via `deriveCollection`, so changing one page doesn't re-render all pages.

## License

MIT
