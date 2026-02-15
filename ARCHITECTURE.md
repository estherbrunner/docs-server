# docs-server — Architecture

## Overview

docs-server is a static site generator library installed as a `devDependency`. It transforms Markdoc files into static HTML pages enhanced with Le Truc Web Components. The build pipeline is orchestrated by Cause & Effect signals: file changes propagate through a reactive dependency graph, triggering only the minimal set of rebuilds needed.

The system has two modes: **dev** (watch + incremental rebuild + HMR via WebSocket) and **build** (full static output). Both share the same reactive pipeline — dev mode simply keeps the signal graph alive and connects it to file watchers and a dev server.

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI Entry Point                        │
│                   dev / build command                       │
└──────────────┬──────────────────────┬───────────────────────┘
               │                      │
        ┌──────▼──────┐        ┌──────▼──────┐
        │  Dev Server │        │ Build Mode  │
        │ Bun.serve() │        │ (one-shot)  │
        │ + WebSocket │        └──────┬──────┘
        └──────┬──────┘               │
               │                      │
        ┌──────▼──────────────────────▼───────────────────────┐
        │              Reactive Pipeline                       │
        │         (Cause & Effect signals)                     │
        │                                                      │
        │  ┌──────────┐   ┌──────────┐   ┌────────────────┐  │
        │  │FileWatcher│──▶│ Markdoc  │──▶│ Layout + Render│  │
        │  │  Lists    │   │ Transform│   │   to HTML      │  │
        │  └──────────┘   └──────────┘   └────────────────┘  │
        │                                                      │
        │  ┌──────────┐   ┌──────────┐   ┌────────────────┐  │
        │  │TS Source  │──▶│ Typedoc  │──▶│ Markdoc (API)  │  │
        │  │  Watcher  │   │ Generate │   │                │  │
        │  └──────────┘   └──────────┘   └────────────────┘  │
        │                                                      │
        │  ┌──────────┐   ┌────────────────────────────────┐  │
        │  │Component  │──▶│ Bun.build() → JS/CSS bundle   │  │
        │  │  Watcher  │   └────────────────────────────────┘  │
        │  └──────────┘                                        │
        │                                                      │
        │  ┌──────────┐   ┌────────────────────────────────┐  │
        │  │  Asset    │──▶│ Copy to output                 │  │
        │  │  Watcher  │   └────────────────────────────────┘  │
        │  └──────────┘                                        │
        └─────────────────────────────────────────────────────┘
```

## Consumer Project Structure

```
my-library/
├── src/                          # Library TypeScript source (Typedoc input)
├── docs-src/                     # Documentation source
│   ├── layout.html               # Default layout template
│   ├── index.md                  # Pages (file-based routing)
│   ├── getting-started.md
│   ├── guides/
│   │   └── *.md
│   └── assets/                   # Static assets (copied verbatim)
│       └── images/
├── docs-server/                  # User customizations
│   └── schema/                   # Custom Markdoc schemas (overrides)
│       └── fence.markdoc.ts
├── components/                   # Web Components (Le Truc)
│   ├── main.ts                   # Component entry point (aggregates all)
│   ├── main.css                  # CSS entry point (aggregates all)
│   ├── global.css                # Global styles
│   ├── basic-button/
│   │   ├── basic-button.ts
│   │   └── basic-button.css
│   └── module-codeblock/
│       ├── module-codeblock.ts
│       └── module-codeblock.css
├── docs/                         # Build output (committed for GH Pages)
│   ├── index.html
│   ├── getting-started/
│   │   └── index.html
│   ├── api/
│   │   └── *.html
│   └── assets/
│       ├── main.[hash].js
│       ├── main.[hash].css
│       └── images/
└── docs-server.config.ts         # Configuration
```

## Components

### ConfigLoader

- **Responsibility:** Load and validate `docs-server.config.ts`, merge with defaults, expose as a `Store` so each config property is an individual signal.
- **Interface:**
  ```typescript
  interface DocsServerConfig {
    title: string
    baseUrl: string                     // e.g. '/my-library/'
    srcDir: string                      // default: 'docs-src'
    outDir: string                      // default: 'docs'
    typedocSource: string               // default: 'src'
    componentsDir: string               // default: 'components'
    schemaDir: string                   // default: 'docs-server/schema'
    nav: string[]                       // e.g. ['index', 'getting-started', 'api']
  }

  function loadConfig(cwd: string): Promise<Store<DocsServerConfig>>
  ```
- **Dependencies:** Cause & Effect (`Store`)
- **Design note:** Using `Store<DocsServerConfig>` means each property (e.g., `config.title`, `config.nav`) is an individually trackable signal. An effect that only reads `config.baseUrl` won't re-run when `config.title` changes. In dev mode, if the config file is watched and reloaded, `store.set(newConfig)` updates only the properties that actually changed, triggering only the affected downstream effects.

### FileWatcher

- **Responsibility:** Create reactive `List<FileInfo>` collections for file groups using `fs.watch` + `Glob.scan()`. Adapted from the existing Le Truc pattern but updated for Cause & Effect v0.18.1 API (watched callback as option, no HOOK_WATCH).
- **Interface:**
  ```typescript
  interface FileInfo {
    path: string
    filename: string
    content: string
    hash: string           // SHA-256 prefix for cache-busting
    lastModified: number
    size: number
    exists: boolean
  }

  function createFileList(
    directory: string,
    include: string,
    exclude?: string,
    options?: { watch?: boolean }
  ): Promise<List<FileInfo>>
  ```
- **Dependencies:** Cause & Effect (`List`), Bun (`Glob`), Node compat (`fs.watch`, `crypto`)
- **Notes:** The `List` constructor accepts a `watched` callback option in v0.18.1 (replacing the old `HOOK_WATCH` hook). The watcher is lazily initialized when an effect first reads the list, and cleaned up when no effects depend on it.

### SchemaResolver

- **Responsibility:** Load Markdoc schemas with user-override-wins resolution. Scans two locations: library built-in schemas first, then user schemas in `schemaDir`. User schemas override built-in schemas by filename match.
- **Interface:**
  ```typescript
  interface MarkdocSchemaSet {
    nodes: Record<string, Schema>
    tags: Record<string, Schema>
  }

  function resolveSchemas(
    builtinDir: string,
    userDir: string
  ): Promise<MarkdocSchemaSet>
  ```
- **Dependencies:** Markdoc types, dynamic import
- **Resolution rule:** `docs-server/schema/fence.markdoc.ts` overrides the built-in `fence` schema. File basename (minus `.markdoc.ts`) determines the schema name. Schemas exporting a `default` with a `render` field are tags; schemas matching a known node name (`fence`, `heading`, `paragraph`, etc.) are nodes.

### MarkdocPipeline

- **Responsibility:** Transform `.md` files to HTML strings via Markdoc's parse → transform → render pipeline. Handles frontmatter extraction, schema application, and variable injection.
- **Interface:**
  ```typescript
  interface PageData {
    slug: string              // URL path segment
    title: string             // from frontmatter
    meta: Record<string, string>
    layout: string            // layout file path (from frontmatter or default)
    content: string           // rendered HTML string (<main> content)
    headings: Heading[]       // extracted H2s for anchor nav
    variables: Record<string, unknown>
  }

  function processMarkdoc(
    fileInfo: FileInfo,
    schemas: MarkdocSchemaSet,
    config: DocsServerConfig
  ): PageData
  ```
- **Dependencies:** `@markdoc/markdoc`, `yaml` (frontmatter parsing from `ast.attributes.frontmatter`)

### LayoutEngine

- **Responsibility:** Insert rendered content into layout templates. Replace placeholders with generated content.
- **Interface:**
  ```typescript
  function renderPage(
    page: PageData,
    layoutHtml: string,
    nav: string,
    assets: { jsPath: string, cssPath: string },
    config: DocsServerConfig
  ): string
  ```
- **Placeholders** in layout HTML:
  - `<!-- content -->` — main Markdoc-rendered content
  - `<!-- menu -->` — main navigation HTML
  - `<!-- title -->` — page title (injected into `<title>` and any heading placeholder)
  - `<link>` and `<script>` tags are **auto-injected** before `</head>` and before `</body>` respectively, not via placeholders
- **Dependencies:** None (string replacement)
- **Design note:** We start with these three placeholders. Adding more (e.g., `<!-- anchor-nav -->`) is trivial — it's just another string replacement. No need to over-design a placeholder system.

### TypedocGenerator

- **Responsibility:** Run Typedoc against configured source directory, capture Markdown output, clean up boilerplate, and feed results into the Markdoc pipeline.
- **Interface:**
  ```typescript
  function generateApiDocs(
    sourceDir: string,
    config: DocsServerConfig
  ): Promise<FileInfo[]>
  ```
- **Strategy:** Write intermediate `.md` files to a temp directory (not `docs-src/`), then read them as `FileInfo` objects into the pipeline. This avoids polluting the user's source directory and avoids the complexity of a fully in-memory Typedoc pipeline, while still allowing the signal graph to track them.
- **Debouncing:** In dev mode, Typedoc runs are debounced (500ms) since source changes often come in bursts.
- **Dependencies:** `typedoc`, `typedoc-plugin-markdown`

### ComponentBundler

- **Responsibility:** Bundle Web Components and CSS via `Bun.build()`.
- **Interface:**
  ```typescript
  interface BundleResult {
    jsPath: string    // output path relative to outDir
    cssPath: string   // output path relative to outDir
    jsHash: string    // for cache-busting filenames
    cssHash: string
  }

  function bundleComponents(
    componentsDir: string,
    outDir: string,
    options: { minify: boolean }
  ): Promise<BundleResult>
  ```
- **Production:** Single minified JS bundle + single minified CSS file, content-hashed filenames
- **Development:** Single unminified bundle (no code splitting). Rationale below in Key Decisions.
- **Entry points:** `components/main.ts` for JS, `components/main.css` for CSS
- **Dependencies:** Bun built-in bundler

### AssetCopier

- **Responsibility:** Copy static assets from `docs-src/assets/` to `docs/assets/`, preserving directory structure.
- **Interface:**
  ```typescript
  function copyAssets(srcDir: string, outDir: string): Promise<void>
  ```
- **Dependencies:** Bun file APIs

### DevServer

- **Responsibility:** Serve built files from the output directory, manage WebSocket connections for HMR.
- **Interface:**
  ```typescript
  function startDevServer(
    config: DocsServerConfig,
    pipeline: ReactivePipeline
  ): { stop: () => void }
  ```
- **Implementation:**
  - `Bun.serve()` with static file serving from `outDir`
  - WebSocket endpoint at `/__hmr` for live reload
  - Small client script auto-injected into dev builds (before `</body>`)
  - Message protocol:
    ```typescript
    type HMRMessage =
      | { type: 'reload' }                          // full page reload (content change)
      | { type: 'css', path: string }                // CSS hot swap
      | { type: 'js', path: string }                 // JS module hot swap (future)
    ```
  - No dynamic routes needed — always serves pre-built static files from `outDir`
- **Dependencies:** Bun (`Bun.serve()`), WebSocket

### ReactivePipeline

- **Responsibility:** Wire all components together using Cause & Effect signals. This is the orchestration layer.
- **Interface:**
  ```typescript
  function createPipeline(
    config: DocsServerConfig,
    options: { watch: boolean }  // true for dev, false for build
  ): ReactivePipeline

  interface ReactivePipeline {
    build(): Promise<void>       // trigger full build, wait for completion
    dispose(): void              // clean up all watchers and effects
  }
  ```
- **Async signal pattern:** Most pipeline stages involve file I/O and are therefore async. Use `Task` (not `Memo`) for all derived async computations. Tasks resolve to a result that must be handled via `match()`:
  ```typescript
  // Effects use match() to handle all three paths
  createEffect(() => {
    match(someTask, {
      ok: (value) => { /* handle resolved value */ },
      nil: ()     => { /* pending — upstream not yet resolved */ },
      err: (e)    => { /* handle error */ },
    })
  })
  ```
  Unresolved values (`nil`) and errors (`err`) propagate through the signal graph automatically. A `Task` that reads another unresolved `Task` stays in `nil` state until its dependency resolves. This gives us natural pipeline backpressure — downstream stages wait for upstream without explicit coordination.

- **Collection-based pipeline:** The core pattern is `list.deriveCollection()` for transforming file lists through pipeline stages. Each derived collection creates internal `Task` nodes — one per item, keyed by file path. When a source file changes, only that file's `Task` re-runs. Collections can be chained, and keys are stable throughout the chain.
  ```typescript
  // Source: watched file list (List<FileInfo>)
  const mdFiles = await createFileList('docs-src', '**/*.md', undefined, { watch: true })

  // Stage 1: Parse + transform each .md file (only changed files re-run)
  const pageDataCollection = mdFiles.deriveCollection(async (file, abort) => {
    const ast = Markdoc.parse(file.content)
    const frontmatter = yaml.load(ast.attributes.frontmatter)
    const content = Markdoc.renderers.html(Markdoc.transform(ast, markdocConfig))
    return { slug: toSlug(file.path), frontmatter, content, headings: extractH2s(ast) }
  })

  // Stage 2: Render with layout (chains from stage 1, stable keys)
  const renderedPages = pageDataCollection.deriveCollection(async (pageData, abort) => {
    const layout = await Bun.file(pageData.frontmatter.layout ?? defaultLayout).text()
    return renderPage(pageData, layout, navHtml.get(), bundleResult.get(), config)
  })

  // Terminal effect: write each rendered page to disk
  createEffect(() => {
    for (const [key, pageTask] of renderedPages) {
      match(pageTask, {
        ok:  (html) => Bun.write(toOutPath(key), html),
        nil: ()     => { /* still building */ },
        err: (e)    => console.error(`Failed to build ${key}:`, e),
      })
    }
  })
  ```
  **Memory note:** Each stage memoizes its output per file. For large doc sites, monitor memory usage since memoized content (HTML strings) accumulates across pipeline stages. If this becomes an issue, intermediate stages can be collapsed.

- **Signal graph:**
  ```
  config (Store<DocsServerConfig>)               ── per-property reactivity
       │
       ├──▶ mdFiles (List<FileInfo>)             ── glob: docs-src/**/*.md, watched
       │        │
       │        ├──▶ pageData (Collection)       ── deriveCollection: parse + transform
       │        │        │
       │        │        └──▶ rendered (Collection) ── deriveCollection: layout + render
       │        │                 │
       │        │                 └──▶ writePages (Effect) ── match per item, write .html
       │        │
       │        └──▶ navHtml (Task)              ── generate nav HTML from page list
       │
       ├──▶ tsFiles (List<FileInfo>)             ── glob: src/**/*.ts, watched
       │        │
       │        └──▶ typedocOutput (Task)         ── debounced Typedoc → temp .md files
       │                 │
       │                 └──▶ apiFiles (List)     ── temp dir glob, fed into same
       │                          │                   deriveCollection pipeline
       │                          └──▶ apiPages (Collection) ── same pipeline as mdFiles
       │
       ├──▶ componentFiles (List<FileInfo>)       ── glob: components/**/*.{ts,css}, watched
       │        │
       │        └──▶ bundleResult (Task)          ── Bun.build() for JS + CSS
       │
       ├──▶ assetFiles (List<FileInfo>)           ── glob: docs-src/assets/**/*,  watched
       │        │
       │        └──▶ copyAssets (Effect)          ── match per item, copy to outDir
       │
       └──▶ layoutHtml (Task)                     ── async read + watch layout.html
  ```
- **In build mode:** The pipeline resolves once all `Task` nodes in all collections have settled to `ok` (or `err`) and all effects have run. Then disposes.
- **In dev mode:** The pipeline stays alive. File watchers update `List` signals, `deriveCollection` re-runs only the changed item's `Task`, effects re-run via `match()`, and HMR messages are sent.
- **Error handling:** Errors in any `Task` node propagate as `err` to downstream consumers in the chain. Effects log errors and send error overlay messages to the dev client (if in dev mode). The pipeline does not crash — other files and independent branches continue to work.

### CLI

- **Responsibility:** Parse commands, load config, invoke pipeline and/or dev server.
- **Commands:**
  - `docs-server dev` — load config → create pipeline (watch: true) → build → start dev server
  - `docs-server build` — load config → create pipeline (watch: false) → build → exit
- **Implementation:** Simple `process.argv` parsing. No framework needed for two commands.
- **`bin` entry in `package.json`:**
  ```json
  "bin": {
    "docs-server": "./bin/docs-server.ts"
  }
  ```

## Data Models

```typescript
// --- File system ---

interface FileInfo {
  path: string           // absolute path
  filename: string       // basename
  content: string        // file contents
  hash: string           // SHA-256 prefix (16 chars)
  lastModified: number   // mtime in ms
  size: number
  exists: boolean
}

// --- Page ---

interface Frontmatter {
  title: string
  description?: string
  layout?: string        // path to alternative layout, relative to srcDir
  [key: string]: unknown // custom variables
}

interface Heading {
  level: number
  text: string
  id: string             // slugified for anchor links
}

interface PageData {
  slug: string
  filePath: string       // source .md path
  frontmatter: Frontmatter
  content: string        // rendered HTML
  headings: Heading[]
}

// --- Navigation ---

interface NavItem {
  title: string
  slug: string
  active: boolean
  children?: NavItem[]
}

// --- Config ---

interface DocsServerConfig {
  title: string
  baseUrl: string
  srcDir: string
  outDir: string
  typedocSource: string
  componentsDir: string
  schemaDir: string
  nav: string[]
}

// --- Bundle ---

interface BundleResult {
  jsPath: string
  cssPath: string
  jsHash: string
  cssHash: string
}
```

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Config signal type | `Store<DocsServerConfig>` | `State<DocsServerConfig>`, plain object | Store gives per-property reactivity. Changing `title` doesn't retrigger effects that only read `baseUrl`. `store.set(newConfig)` diffs automatically. |
| Async derived signals | `Task` with `match(ok/nil/err)` | `Memo` (sync only), raw Promises | Almost all pipeline stages do file I/O. Task handles async natively with automatic cancellation via AbortSignal. Unresolved (`nil`) and error (`err`) states propagate through the graph, giving natural backpressure and error handling without try/catch boilerplate. |
| Per-file pipeline | `list.deriveCollection()` chains | One Task per file (manual), one Task for all files (batch) | `deriveCollection` creates per-item Task nodes automatically with stable keys. Only changed items re-run. Collections are chainable. Negligible signal overhead vs. I/O cost. Monitor memory for large sites. |
| Schema override strategy | Two-location resolution (built-in fallback, user overrides by filename) | Copy defaults to user project | Simpler for consumers — no files to manage. Overriding is opt-in. Inspecting defaults is easy via `node_modules`. |
| Typedoc intermediate files | Write to temp directory on disk | In-memory pipeline | Typedoc's API is designed for file output. Fighting it adds complexity. Temp dir keeps `docs-src/` clean. Signal graph still tracks the temp files reactively. |
| Dev bundling | Single unminified bundle (no code splitting) | Individual ES module imports | Bun.build() is fast enough that rebundling on component change is sub-second. Individual imports would require import map generation and complicate the dev server. Single bundle keeps dev/prod parity high. |
| Layout placeholders | Simple HTML comment replacement (`<!-- menu -->`, `<!-- content -->`, `<!-- title -->`) | Template engine (EJS, Handlebars, etc.) | HTML comments are zero-dependency, easy to understand, and sufficient. Auto-inject `<script>` and `<link>` tags positionally (before `</head>`, before `</body>`) rather than via placeholders. |
| Dev server routing | Static file serving only (no dynamic routes) | On-the-fly rendering | Incremental rebuild writes files to `outDir` fast enough. Static serving is simpler, and the output matches production exactly. |
| HMR implementation | Custom WebSocket-based | Bun's built-in `development.hmr` | Bun's HMR is tied to its HTML import system, which doesn't align with our Markdoc-generated HTML. Custom WS gives us full control over reload granularity. |
| CLI argument parsing | Manual `process.argv` | Commander, yargs, citty | Two commands with no flags (initially) don't warrant a dependency. |
| File watching | `fs.watch` (Node compat) + `Glob.scan()` + content hashing | chokidar, Bun `--watch` | `fs.watch` works with Bun's Node compat layer. Content hashing (SHA-256 prefix) prevents false rebuilds from timestamp-only changes. Matches the proven Le Truc pattern. |
| Package exports | Conditional exports with `"bun"` condition for TS source | `"module"` field pointing to TS | `"bun"` condition is the standard way Bun resolves TS source. `"import"` serves pre-compiled JS for non-Bun consumers. |
| CSS handling | Plain CSS only, single bundled output via Bun | CSS Modules, SCSS, Tailwind | Matches requirements constraint. `components/main.css` aggregates all component styles via `@import`. Bun bundler handles CSS bundling natively. Fallback to LightningCSS if Bun's CSS handling has gaps (nesting, `@layer`, etc.). |

## Implementation Plan

### Phase 1: Foundation
**Deliverable:** Config loading, file watching, and basic Markdoc pipeline producing HTML files.

1. Initialize Bun project with `package.json`, TypeScript config
2. Implement `ConfigLoader` — load `docs-server.config.ts`, merge defaults
3. Implement `FileWatcher` — port from Le Truc pattern, update to Cause & Effect v0.18.1 API
4. Implement `MarkdocPipeline` — parse, frontmatter extraction, transform with built-in schemas, render to HTML string
5. Implement `LayoutEngine` — placeholder replacement, script/style injection
6. Implement `ReactivePipeline` (partial) — wire file list → Markdoc → layout → write HTML
7. Implement `CLI` with `docs-server build` command
8. **Verify:** Run `docs-server build` on a test `docs-src/` folder, produce valid HTML in `docs/`

### Phase 2: Dev Server + HMR
**Deliverable:** Live development workflow with file watching and browser reload.

1. Implement `DevServer` — `Bun.serve()` static file serving
2. Add WebSocket HMR endpoint and client injection script
3. Wire `ReactivePipeline` dev mode — keep signal graph alive, connect file watchers
4. Implement CSS hot swap (WebSocket `css` message → client replaces `<link>` href)
5. Implement full page reload on content changes
6. **Verify:** Edit a `.md` file, see browser update without manual refresh

### Phase 3: Components + Bundling
**Deliverable:** Web Component bundling and built-in component set.

1. Implement `ComponentBundler` — `Bun.build()` wrapper for JS and CSS
2. Implement `AssetCopier`
3. Wire component/asset file watchers into `ReactivePipeline`
4. Build initial set of default Markdoc schemas: `fence` (code block), `heading` (with anchor IDs), `callout`
5. Build corresponding Le Truc components: `module-codeblock` (copy, collapse), `basic-button`
6. Add content-hashed filenames for production output
7. **Verify:** Components render in built pages, copy-to-clipboard works, CSS is bundled

### Phase 4: Typedoc Integration
**Deliverable:** Auto-generated API reference from TypeScript source.

1. Implement `TypedocGenerator` — run Typedoc, write to temp dir, clean up output
2. Wire into `ReactivePipeline` — TS source watcher → debounced Typedoc → Markdoc pipeline
3. Build API-specific Markdoc schemas if needed (type signatures, method tables)
4. Implement sub-navigation for API section (grouped by type: classes, functions, types)
5. **Verify:** Change a JSDoc comment in `src/`, see API docs update in dev server

### Phase 5: Polish + Packaging
**Deliverable:** Publishable npm package.

1. Add remaining default schemas: `tabs`, `anchor-nav` (from H2 headings), `menu`
2. Build remaining Le Truc components for default schemas
3. Implement `SchemaResolver` two-location override logic
4. Set up package exports (`"bun"` condition + pre-compiled JS)
5. Add `bin` entry and verify `npx docs-server build` works
6. Write minimal README with usage instructions
7. **Verify:** Install as `devDependency` in a separate test project, full workflow works end-to-end

## Open Questions

_Resolved:_
- ~~Cause & Effect `List` API~~ — Confirmed: `options.watched` replaces `list.on(HOOK_WATCH, callback)`. Cleanup function `() => void` runs automatically when no sinks are connected.
- ~~`Task` granularity~~ — Use `list.deriveCollection()` which creates per-item `Task` nodes automatically. Only changed items re-run. Collections are chainable with stable keys throughout. Signal/Task overhead is negligible compared to async I/O durations. Monitor memory usage for large sites since memoized content accumulates across pipeline stages.

_Still open:_

1. **Typedoc `--incremental` flag:** Worth investigating whether this meaningfully speeds up regeneration in dev mode beyond our debouncing approach.

2. **Bun CSS bundling completeness:** Verify Bun handles all needed CSS features (nesting, custom properties, `@layer`). If gaps exist, fall back to LightningCSS (previously used in Le Truc).

3. **Package name:** `docs-server` is a working title. Final name in `@zeix/*` namespace to be decided before publishing.
