// Production server: serves the built app plus the photo hand-off API.
// Run after `pnpm --filter @workspace/boat-booth run build`.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handlePhotoRequest } from "./photos.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "public");
const port = Number(process.env.PORT) || 4000;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".bin": "application/octet-stream", ".txt": "text/plain", ".ico": "image/x-icon",
};

async function serveFile(res, file, cache) {
  const body = await readFile(file);
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
    "Cache-Control": cache,
  });
  res.end(body);
}

http
  .createServer(async (req, res) => {
    try {
      if (handlePhotoRequest(req, res)) return;
      const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const file = path.join(root, pathname);
      if (file.startsWith(root) && (await stat(file).catch(() => null))?.isFile()) {
        const immutable = /^\/(assets|models)\//.test(pathname);
        return await serveFile(res, file, immutable ? "public, max-age=31536000, immutable" : "no-cache");
      }
      // SPA fallback
      await serveFile(res, path.join(root, "index.html"), "no-cache");
    } catch (err) {
      console.error(err);
      res.writeHead(500).end("Server error");
    }
  })
  .listen(port, "0.0.0.0", () => console.log(`boat-booth listening on :${port}`));
