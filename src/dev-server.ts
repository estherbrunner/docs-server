import { resolve, join, extname } from "path";
import type { ServerWebSocket } from "bun";

export type HMRMessage = { type: "reload" } | { type: "css"; path: string };

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export interface DevServerOptions {
  outDir: string;
  port?: number;
}

export interface DevServer {
  send(message: HMRMessage): void;
  stop(): void;
}

export function startDevServer(options: DevServerOptions): DevServer {
  const outDir = resolve(options.outDir);
  const port = options.port ?? 3000;
  const clients = new Set<ServerWebSocket<unknown>>();

  const server = Bun.serve({
    port,
    async fetch(req, server) {
      const url = new URL(req.url);

      // WebSocket upgrade for HMR
      if (url.pathname === "/__hmr") {
        if (server.upgrade(req)) return undefined;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      // Serve static files from outDir
      let filePath = join(outDir, url.pathname);

      // Directory → try index.html
      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        // Try with index.html appended
        const indexPath = join(filePath, "index.html");
        const indexFile = Bun.file(indexPath);
        if (await indexFile.exists()) {
          filePath = indexPath;
        } else {
          return new Response("Not Found", { status: 404 });
        }
      }

      const resolvedFile = Bun.file(filePath);
      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

      return new Response(resolvedFile, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-cache",
        },
      });
    },
    websocket: {
      open(ws) {
        clients.add(ws);
      },
      close(ws) {
        clients.delete(ws);
      },
      message() {
        // No client-to-server messages expected
      },
    },
  });

  console.log(`Dev server running at http://localhost:${server.port}`);

  return {
    send(message: HMRMessage) {
      const data = JSON.stringify(message);
      for (const client of clients) {
        client.send(data);
      }
    },
    stop() {
      server.stop();
    },
  };
}
