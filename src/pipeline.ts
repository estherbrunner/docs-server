import {
  createEffect,
  createTask,
  match,
  type Store,
} from "@zeix/cause-effect";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { dirname, join, resolve } from "path";
import { copyAssets } from "./asset-copier.ts";
import { bundleComponents, type BundleResult } from "./bundler.ts";
import type { DocsServerConfig } from "./config.ts";
import {
  createFileList,
  type FileInfo,
  type WatchedFileList,
} from "./file-watcher.ts";
import { hmrClientScript } from "./hmr-client.ts";
import {
  generateNavHtml,
  renderPage,
  type RenderOptions,
} from "./layout-engine.ts";
import {
  processMarkdoc,
  type MarkdocSchemaSet,
  type PageData,
} from "./markdoc-pipeline.ts";
import { resolveSchemas } from "./schema-resolver.ts";
import {
  cleanupTypedocMarkdown,
  generateApiDocs,
} from "./typedoc-generator.ts";

export interface PipelineOptions {
  watch: boolean;
  /** Called after pages are written to disk (dev mode HMR — content change) */
  onPagesWritten?: () => void;
  /** Called after CSS bundle is written to disk (dev mode HMR — CSS swap) */
  onCssWritten?: (cssPath: string) => void;
}

export interface ReactivePipeline {
  build(): Promise<void>;
  dispose(): void;
}

function pageDataToOutPath(page: PageData, outDir: string): string {
  if (page.slug === "") return join(outDir, "index.html");
  return join(outDir, page.slug, "index.html");
}

export async function createPipeline(
  config: Store<DocsServerConfig>,
  options: PipelineOptions,
): Promise<ReactivePipeline> {
  const cwd = process.cwd();
  const srcDir = resolve(cwd, config.srcDir.get());
  const outDir = resolve(cwd, config.outDir.get());
  const schemaDir = resolve(cwd, config.schemaDir.get());
  const componentsDir = resolve(cwd, config.componentsDir.get());
  const typedocSourceDir = resolve(cwd, config.typedocSource.get());
  const builtinSchemaDir = resolve(import.meta.dir, "schemas");
  const isMinified = !options.watch;
  const hasTypedocSource = existsSync(typedocSourceDir);

  // Resolve schemas (built-in + user overrides)
  const schemas: MarkdocSchemaSet = await resolveSchemas(
    builtinSchemaDir,
    schemaDir,
  );

  // Create watched file lists
  const mdFiles = await createFileList(srcDir, "**/*.md", undefined, {
    watch: options.watch,
  });
  const componentFiles = await createFileList(
    componentsDir,
    "**/*.{ts,css}",
    undefined,
    { watch: options.watch },
  );
  const assetFiles = await createFileList(
    join(srcDir, "assets"),
    "**/*",
    undefined,
    { watch: options.watch },
  );

  // Watch TS source files for Typedoc (only if source dir exists)
  const tsFiles = hasTypedocSource
    ? await createFileList(typedocSourceDir, "**/*.ts", "**/node_modules/**", {
        watch: options.watch,
      })
    : null;

  // Generate API docs from TypeScript source (async Task, debounced by signal deps)
  const typedocTask = createTask(async (): Promise<PageData[]> => {
    if (!tsFiles) return [];

    // Read TS file list to track as dependency
    tsFiles.get();

    console.log("  typedoc: generating API docs...");
    const apiFiles = await generateApiDocs({
      sourceDir: typedocSourceDir,
    });

    if (apiFiles.length === 0) return [];

    // Clean up and process each API markdown file through Markdoc
    const apiPages: PageData[] = [];
    for (const file of apiFiles) {
      const cleaned = cleanupTypedocMarkdown(file.content, file.filename);
      const cleanedFile: FileInfo = { ...file, content: cleaned };
      const page = processMarkdoc(cleanedFile, schemas, "");
      apiPages.push(page);
    }

    console.log(`  typedoc: ${apiPages.length} API pages generated`);
    return apiPages;
  });

  // Read layout file (async Task)
  const layoutTask = createTask(async () => {
    const layoutPath = join(srcDir, "layout.html");
    try {
      return await Bun.file(layoutPath).text();
    } catch {
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
  <header><!-- menu --></header>
  <main><!-- content --></main>
</body>
</html>`;
    }
  });

  // Bundle components (async Task — re-runs when component files change)
  const bundleTask = createTask(async (): Promise<BundleResult> => {
    // Read component file list to track as dependency
    componentFiles.get();
    try {
      const result = await bundleComponents({
        componentsDir,
        outDir,
        minify: isMinified,
      });
      if (result.jsPath) console.log(`  bundle → ${result.jsPath}`);
      if (result.cssPath) console.log(`  bundle → ${result.cssPath}`);
      return result;
    } catch (err) {
      console.error("Bundle error:", err);
      return { jsPath: "", cssPath: "", jsHash: "", cssHash: "" };
    }
  });

  // Copy static assets (async Task — re-runs when asset files change)
  const assetTask = createTask(async (): Promise<true> => {
    // Read asset file list to track as dependency
    assetFiles.get();
    await copyAssets(srcDir, outDir);
    return true;
  });

  // Derive page data from markdown files (sync — Markdoc is synchronous)
  const pageDataCollection = mdFiles.deriveCollection((file: FileInfo) =>
    processMarkdoc(file, schemas, srcDir),
  );

  // Promise that resolves when the first full build is complete
  let buildResolve: (() => void) | null = null;
  const buildPromise = new Promise<void>((r) => {
    buildResolve = r;
  });

  let initialBuildDone = false;
  const disposables: (() => void)[] = [];

  // Terminal effect: write each rendered page to disk
  //
  // Read pageDataCollection BEFORE match() so mdFiles is tracked as a
  // dependency on the first run. See IMPLEMENTATION_NOTES.md §1.
  const disposeWriteEffect = createEffect(() => {
    // Eagerly read all page data
    const pages: PageData[] = [];
    for (const signal of pageDataCollection) {
      pages.push(signal.get());
    }

    match([layoutTask, bundleTask, assetTask, typedocTask], {
      ok: ([_layoutHtml, bundle, _assets, _apiPages]) => {
        const layoutHtml = _layoutHtml as string;
        const apiPages = _apiPages as PageData[];
        const allPages = [...pages, ...apiPages];
        const navPages = allPages.map((p) => ({
          slug: p.slug,
          title: p.frontmatter.title || p.slug || "Home",
        }));
        const navHtml = generateNavHtml(
          navPages,
          config.nav.get(),
          config.baseUrl.get(),
        );

        const bundleResult = bundle as BundleResult;
        const renderOptions: RenderOptions = {
          title: config.title.get(),
          baseUrl: config.baseUrl.get(),
          navHtml,
          cssPath: bundleResult.cssPath || undefined,
          jsPath: bundleResult.jsPath || undefined,
          isDev: options.watch,
        };

        const writePromises: Promise<void>[] = [];

        for (const page of allPages) {
          let html = renderPage(page, layoutHtml, renderOptions);

          if (options.watch) {
            html = html.replace("</body>", `${hmrClientScript}\n</body>`);
          }

          const outPath = pageDataToOutPath(page, outDir);
          writePromises.push(
            mkdir(dirname(outPath), { recursive: true })
              .then(() => Bun.write(outPath, html))
              .then(() => {
                console.log(`  ${page.slug || "index"} → ${outPath}`);
              }),
          );
        }

        Promise.all(writePromises).then(() => {
          if (buildResolve) {
            buildResolve();
            buildResolve = null;
          }
          if (initialBuildDone && options.onPagesWritten) {
            options.onPagesWritten();
          }
          initialBuildDone = true;
        });
      },
      nil: () => {
        // Waiting for layout/bundle/assets to resolve
      },
      err: (errors) => {
        console.error("Pipeline error:", errors[0]);
        if (buildResolve) {
          buildResolve();
          buildResolve = null;
        }
      },
    });
  });

  disposables.push(disposeWriteEffect);

  return {
    async build() {
      await buildPromise;
    },
    dispose() {
      for (const dispose of disposables) dispose();
      (mdFiles as WatchedFileList).closeWatcher?.();
      (componentFiles as WatchedFileList).closeWatcher?.();
      (assetFiles as WatchedFileList).closeWatcher?.();
      if (tsFiles) (tsFiles as WatchedFileList).closeWatcher?.();
    },
  };
}
