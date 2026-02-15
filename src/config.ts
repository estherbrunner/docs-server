import { createStore, type Store } from "@zeix/cause-effect";
import { resolve } from "path";

export interface DocsServerConfig {
  [key: string]: unknown;
  title: string;
  baseUrl: string;
  srcDir: string;
  outDir: string;
  typedocSource: string;
  componentsDir: string;
  schemaDir: string;
  nav: string[];
}

const defaults: DocsServerConfig = {
  title: "Documentation",
  baseUrl: "/",
  srcDir: "docs-src",
  outDir: "docs",
  typedocSource: "src",
  componentsDir: "components",
  schemaDir: "docs-server/schema",
  nav: [],
};

export async function loadConfig(
  cwd: string,
): Promise<Store<DocsServerConfig>> {
  const configPath = resolve(cwd, "docs-server.config.ts");
  let userConfig: Partial<DocsServerConfig> = {};

  try {
    const mod = await import(configPath);
    userConfig = mod.default ?? mod;
  } catch {
    // No config file found — use defaults
  }

  return createStore<DocsServerConfig>({ ...defaults, ...userConfig });
}
