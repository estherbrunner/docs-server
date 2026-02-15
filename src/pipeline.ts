import {
  createEffect,
  createTask,
  match,
  type Store,
} from "@zeix/cause-effect";
import { mkdir } from "fs/promises";
import { dirname, join, resolve } from "path";
import type { DocsServerConfig } from "./config.ts";
import { createFileList, type FileInfo } from "./file-watcher.ts";
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
  options: { watch: boolean },
): Promise<ReactivePipeline> {
  const cwd = process.cwd();
  const srcDir = resolve(cwd, config.srcDir.get());
  const outDir = resolve(cwd, config.outDir.get());
  const schemaDir = resolve(cwd, config.schemaDir.get());
  const builtinSchemaDir = resolve(import.meta.dir, "schemas");

  // Resolve schemas (built-in + user overrides)
  const schemas: MarkdocSchemaSet = await resolveSchemas(
    builtinSchemaDir,
    schemaDir,
  );

  // Create watched file list for markdown sources
  const mdFiles = await createFileList(srcDir, "**/*.md", undefined, {
    watch: options.watch,
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

  // Derive page data from markdown files (sync — Markdoc is synchronous)
  const pageDataCollection = mdFiles.deriveCollection((file: FileInfo) =>
    processMarkdoc(file, schemas, srcDir),
  );

  // Promise that resolves when the first full build is complete
  let buildResolve: (() => void) | null = null;
  const buildPromise = new Promise<void>((r) => {
    buildResolve = r;
  });

  // Track disposables
  const disposables: (() => void)[] = [];

  // Terminal effect: write each rendered page to disk
  const disposeWriteEffect = createEffect(() => {
    match([layoutTask], {
      ok: ([layoutHtml]) => {
        // Build nav from page data
        const pages: { slug: string; title: string }[] = [];
        for (const signal of pageDataCollection) {
          const page = signal.get();
          pages.push({
            slug: page.slug,
            title: page.frontmatter.title || page.slug || "Home",
          });
        }
        const navHtml = generateNavHtml(
          pages,
          config.nav.get(),
          config.baseUrl.get(),
        );

        const renderOptions: RenderOptions = {
          title: config.title.get(),
          baseUrl: config.baseUrl.get(),
          navHtml,
        };

        const writePromises: Promise<void>[] = [];

        for (const signal of pageDataCollection) {
          const page = signal.get();
          const html = renderPage(page, layoutHtml, renderOptions);
          const outPath = pageDataToOutPath(page, outDir);
          writePromises.push(
            mkdir(dirname(outPath), { recursive: true })
              .then(() => Bun.write(outPath, html))
              .then(() => {
                console.log(`  ${page.slug || "index"} → ${outPath}`);
              }),
          );
        }

        // Signal build completion after all writes
        Promise.all(writePromises).then(() => {
          if (buildResolve) {
            buildResolve();
            buildResolve = null;
          }
        });
      },
      nil: () => {
        // Layout still loading
      },
      err: (errors) => {
        console.error("Layout error:", errors[0]);
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
    },
  };
}
