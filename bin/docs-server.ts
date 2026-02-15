#!/usr/bin/env bun

import { loadConfig } from "../src/config.ts";
import { startDevServer } from "../src/dev-server.ts";
import { createPipeline } from "../src/pipeline.ts";

const command = process.argv[2];

if (!command || !["dev", "build"].includes(command)) {
  console.log("Usage: docs-server <command>");
  console.log("");
  console.log("Commands:");
  console.log("  dev    Start dev server with file watching and HMR");
  console.log("  build  Build static site for production");
  process.exit(1);
}

const cwd = process.cwd();

if (command === "build") {
  console.log("Building documentation...");
  const config = await loadConfig(cwd);
  const pipeline = await createPipeline(config, { watch: false });

  await pipeline.build();
  pipeline.dispose();
  console.log("Build complete.");
}

if (command === "dev") {
  const config = await loadConfig(cwd);
  const outDir = config.outDir.get();

  const devServer = startDevServer({ outDir });

  console.log("Building documentation...");
  const pipeline = await createPipeline(config, {
    watch: true,
    onPagesWritten() {
      devServer.send({ type: "reload" });
    },
    onCssWritten(cssPath) {
      devServer.send({ type: "css", path: cssPath });
    },
  });

  await pipeline.build();
  console.log("Watching for changes...");

  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    pipeline.dispose();
    devServer.stop();
    process.exit(0);
  });
}
