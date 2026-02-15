# docs-server — Requirements

## 1. Problem Statement

**Current situation:** Teams building TypeScript libraries need documentation sites. Existing tools (VitePress, Docusaurus, Starlight) work well but offer limited control over the server-side build pipeline and client-side component model.

**Goals:**
- Provide a reusable, installable library (`devDependency`) for generating static documentation sites from Markdoc files, deployed to GitHub Pages
- Showcase Cause & Effect (signals library) as a server-side build orchestration tool — demonstrating that signals aren't just for UI
- Showcase Le Truc (Web Components library) as the client-side component model — demonstrating fine-grained DOM updates over server-rendered HTML

**Success criteria:**
- A TypeScript library author can install the package, write Markdoc files, and produce a deployable static site with `docs-server build`
- Dev server with HMR provides fast feedback during documentation authoring
- API reference is auto-generated from TypeScript source via Typedoc
- The build pipeline uses Cause & Effect signals for dependency tracking and incremental rebuilds

## 2. User Personas

### Documentation Author
- **Role:** Experienced TypeScript developer maintaining an open-source library
- **Technical level:** Advanced — comfortable with TS, CLI tools, Web Components, Markdoc syntax
- **Goals:** Write docs in Markdown-like syntax, get a professional static site with rich interactive components, auto-generated API reference
- **Environment:** macOS/Linux, Bun runtime, GitHub for hosting
- **Pain points solved:** No need to learn React/Vue framework; full control over markup and components; signals-based incremental rebuilds

## 3. Functional Requirements

### Must Have

**CLI**
- `docs-server dev` — start dev server with file watching and HMR
- `docs-server build` — produce static site ready for GitHub Pages deployment

**Configuration (`docs-server.config.ts`)**
- Site title, base URL
- Source directory (default: `docs-src/`), output directory (default: `docs/`), TypeScript source directory for Typedoc (default: `src/`)
- Main navigation as ordered array of page names, e.g. `['index', 'getting-started', 'components']`
- Components directory (default: `components/`)
- Schema directory (default: `docs-server/schema/`)

**Markdoc Pipeline**
- Process `docs-src/**/*.md` → `docs/**/*.html` (file-based routing)
- Use Stripe's Markdoc library with `Markdoc.renderers.html()` (HTML output, not React)
- Frontmatter support: page title, meta information, custom variables, optional custom layout reference
- Convention-based Web Component mapping: `components/basic-button/basic-button.ts` → `<basic-button>`

**Layout System**
- Default layout template at `docs-src/layout.html` with `<!-- menu -->` and `<!-- content -->` placeholders (additional placeholders may be added as needed)
- Pages can specify alternative layouts via frontmatter
- Automatic injection of `<link>` and `<script>` tags in sensible default positions

**Default Schemas & Components**
- Library ships with built-in Markdoc schemas and corresponding Le Truc Web Components:
  - Callouts
  - Tabs
  - Code blocks with syntax highlighting, copy button, collapsible for long blocks
  - Anchor navigation (generated from H2 headings)
  - Menu / main navigation
  - API reference blocks
- Users can override or extend defaults with custom schemas in `docs-server/schema/*.markdoc.ts`
- Users can override or extend defaults with custom components in `components/`
- Resolution strategy (internal defaults vs. user overrides) — **open question for architect**

**Navigation**
- Main navigation: configured order in `docs-server.config.ts`
- Sub-navigation: auto-generated per section via custom Markdoc schemas, with configurable ordering logic (alphabetical, grouped by type for API, by date for changelog)
- Anchor navigation: auto-generated from H2 headings within a page

**Typedoc Integration**
- `docs-server dev` watches configured TypeScript source directory and regenerates API docs on change
- Uses `typedoc-plugin-markdown` to produce Markdoc-compatible Markdown
- Generated API Markdown is processed through the same Markdoc pipeline as hand-written docs
- Cleanup step: strip Typedoc boilerplate (breadcrumbs, etc.), keep only `<main>` content
- Whether intermediate `.md` files are written to disk or processed in-memory — **open question for architect**

**Incremental Build (Cause & Effect)**
- Signal-based dependency tracking: file changes trigger minimal rebuilds
- Glob-based file watching detects additions, changes, and deletions
- Appropriate tool invoked per change type: Markdoc for `.md`, Bun bundler for `.ts`/`.css`, Typedoc for source `.ts`

**HMR / Dev Server**
- Dev server via `Bun.serve()`, serves built static files
- Full page reload when page source (`.md`) changes
- Hot swap for CSS changes (no full reload)
- Hot swap for lazy-loaded fragments and scripts where possible
- Dev bundling strategy (individual imports vs. bundle) — **open question for architect**

**Static Assets**
- Copy `docs-src/assets/**/*` → `docs/assets/**/*`
- Component aggregation via `components/main.ts` and `components/main.css` (which import dependencies including `components/global.css`)

**Build Output**
- Production: minified single JS bundle, minified CSS
- Output committed to repo for GitHub Pages serving

### Should Have

**Component Authoring DX**
- Clear convention for creating new components: folder with `.ts` and optional `.css`
- Components automatically discovered and registered

### Nice to Have

- `docs-server init` — interactive scaffolding command that sets up directory structure and default config
- Live examples in documentation (interactive component demos)

## 4. Non-Functional Requirements

**Performance**
- Incremental rebuilds should process only changed files and their dependents
- Dev server startup should be fast (sub-second for small-to-medium doc sites)

**Output Quality**
- Generated HTML must be valid, semantic, and accessible
- Static site must work with JavaScript disabled (progressive enhancement via Web Components)
- CSS-only styling — no SCSS, Tailwind, or CSS-in-JS

**Developer Experience**
- TypeScript throughout — config, schemas, components
- Bun as sole runtime and bundler (no Node.js, no Webpack/Vite/esbuild)

## 5. Technical Constraints

**Required technologies:**
- Runtime & bundler: Bun
- Markup: Markdoc (Stripe's `@markdoc/markdoc`, HTML renderer)
- Signals: Cause & Effect (`@zeix/cause-effect`) for server-side build orchestration
- Web Components: Le Truc (`@zeix/le-truc`) for client-side interactivity
- API docs: Typedoc + `typedoc-plugin-markdown`
- Styling: plain CSS only

**Prohibited:**
- No React, Vue, Svelte, or other UI frameworks
- No SCSS, Tailwind, PostCSS, or CSS preprocessors
- No Node.js-specific APIs (must run on Bun)

**Deployment target:** GitHub Pages (static files committed to output directory)

## 6. Assumptions & Dependencies

**Assumptions:**
- Consumers use Bun as their package manager and runtime
- Consumers are experienced TypeScript developers comfortable with CLI tools
- Documentation source files are co-located with the library source in the same repository
- Single documentation version (current) — no multi-version support needed

**Dependencies:**
- `@markdoc/markdoc` — Markdoc parser and HTML renderer
- `@zeix/cause-effect` — signals library (server-side build orchestration)
- `@zeix/le-truc` — Web Components library (client-side, needs update to latest Cause & Effect)
- `typedoc` + `typedoc-plugin-markdown` — API reference generation
- Bun built-in: HTTP server (`Bun.serve()`), bundler, file watcher, TypeScript support

## 7. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Le Truc needs update to latest Cause & Effect | Blocks client-side components | Update Le Truc early; decouple server build from client components |
| Cause & Effect server-side patterns are unproven at scale | Build pipeline reliability | Prototype signal-based file watching early; keep fallback to simple watch+rebuild |
| Typedoc Markdown output may need heavy cleanup | API docs quality | Investigate Typedoc output format early; build robust transform step |
| HMR granularity is complex | Dev experience | Start with full reload; add granular HMR incrementally |
| Bun bundler limitations vs. esbuild/Rollup | Missing features during bundling | Evaluate Bun bundler capabilities for the specific needs early |

## 8. Out of Scope

- Search functionality (client-side or server-side)
- Multi-version documentation
- Multi-project / monorepo documentation
- GitHub Actions build pipeline or other deployment platforms
- SCSS, Tailwind, or any CSS preprocessing
- Server-side rendering of Web Components
- Authentication or gated content
- i18n / localization
- Analytics integration

## 9. Open Questions

_To be resolved with the solution architect:_

1. **Default schema/component override strategy:** Copy defaults to user project for easy customization, or resolve from two locations (node_modules fallback, user project override)?
2. **Typedoc intermediate files:** Write generated `.md` to disk (e.g., `docs-src/api/`) or process entirely in-memory using Cause & Effect signal pipeline?
3. **Dev bundling strategy:** Serve individual ES module imports during development, or bundle (just unminified)? Trade-offs for HMR granularity.
4. **Layout placeholders:** Which additional placeholders beyond `<!-- menu -->` and `<!-- content -->` are needed? (e.g., `<!-- title -->`, `<!-- styles -->`, `<!-- scripts -->`, `<!-- anchor-nav -->`)
5. **Dynamic routes in dev server:** Does the dev server need any dynamic route handling, or is serving static rebuilt files sufficient?

## 10. Acceptance Criteria

1. A consumer can `bun add -d docs-server`, create `docs-server.config.ts`, write `.md` files in `docs-src/`, and run `docs-server build` to produce a working static site in `docs/`
2. `docs-server dev` starts a local server with file watching; editing a `.md` file triggers rebuild and browser refresh
3. CSS changes hot-swap without full page reload
4. TypeScript source changes trigger Typedoc regeneration and corresponding page rebuilds
5. Custom Markdoc schemas in `docs-server/schema/` override library defaults
6. Custom Web Components in `components/` are automatically discovered and available as Markdoc tags
7. Built site is fully functional as static HTML on GitHub Pages (works with JS disabled for content, progressively enhanced with Web Components)
8. Incremental rebuilds process only affected files, not the entire site
