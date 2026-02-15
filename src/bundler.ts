import { resolve, join, basename } from "path";

export interface BundleResult {
  jsPath: string;
  cssPath: string;
  jsHash: string;
  cssHash: string;
}

export interface BundleOptions {
  componentsDir: string;
  outDir: string;
  minify: boolean;
}

function extractHash(filename: string): string {
  // Bun outputs files like main-abc123.js — extract the hash part
  const match = filename.match(/-([a-z0-9]+)\.\w+$/);
  return match?.[1] ?? "";
}

export async function bundleComponents(
  options: BundleOptions,
): Promise<BundleResult> {
  const { componentsDir, outDir, minify } = options;
  const assetsDir = join(outDir, "assets");

  const jsEntry = join(componentsDir, "main.ts");
  const cssEntry = join(componentsDir, "main.css");

  // Check if entry points exist
  const jsExists = await Bun.file(jsEntry).exists();
  const cssExists = await Bun.file(cssEntry).exists();

  let jsPath = "";
  let cssPath = "";
  let jsHash = "";
  let cssHash = "";

  // Bundle JS
  if (jsExists) {
    const jsBuild = await Bun.build({
      entrypoints: [jsEntry],
      outdir: assetsDir,
      target: "browser",
      format: "esm",
      minify,
      naming: minify ? "main.[hash].[ext]" : "main.[ext]",
      sourcemap: minify ? "none" : "inline",
    });

    if (!jsBuild.success) {
      const errors = jsBuild.logs.filter((l) => l.level === "error");
      throw new Error(
        `JS bundle failed:\n${errors.map((e) => e.message).join("\n")}`,
      );
    }

    for (const output of jsBuild.outputs) {
      if (output.kind === "entry-point") {
        const filename = basename(output.path);
        jsPath = `assets/${filename}`;
        jsHash = extractHash(filename);
      }
    }
  }

  // Bundle CSS
  if (cssExists) {
    const cssBuild = await Bun.build({
      entrypoints: [cssEntry],
      outdir: assetsDir,
      minify,
      naming: minify ? "main.[hash].[ext]" : "main.[ext]",
    });

    if (!cssBuild.success) {
      const errors = cssBuild.logs.filter((l) => l.level === "error");
      throw new Error(
        `CSS bundle failed:\n${errors.map((e) => e.message).join("\n")}`,
      );
    }

    for (const output of cssBuild.outputs) {
      const filename = basename(output.path);
      if (filename.endsWith(".css")) {
        cssPath = `assets/${filename}`;
        cssHash = extractHash(filename);
      }
    }
  }

  return { jsPath, cssPath, jsHash, cssHash };
}
