// In-memory photo hand-off for the QR-code download feature.
//   POST /api/upload      raw image/jpeg body -> { url } (absolute download URL)
//   GET  /api/photo/:id   the photo, as an attachment
// Photos live in memory for TTL_MS and are capped at MAX_PHOTOS, so nothing is
// kept long-term and a restart simply drops them. Used by both the production
// server (server/index.mjs) and the Vite dev/preview servers.
import { randomBytes } from "node:crypto";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS = 200;
const TTL_MS = 6 * 60 * 60 * 1000;

const photos = new Map(); // id -> { buf, expires }

function sweep() {
  const now = Date.now();
  for (const [id, p] of photos) if (p.expires <= now) photos.delete(id);
  while (photos.size > MAX_PHOTOS) photos.delete(photos.keys().next().value);
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BYTES) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Returns true if the request was handled. */
export function handlePhotoRequest(req, res) {
  const url = new URL(req.url, "http://x");

  if (req.method === "POST" && url.pathname === "/api/upload") {
    if (req.headers["content-type"] !== "image/jpeg") {
      send(res, 415, { error: "Expected image/jpeg" });
      return true;
    }
    readBody(req)
      .then((buf) => {
        if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
          send(res, 400, { error: "Not a JPEG" });
          return;
        }
        sweep();
        const id = randomBytes(12).toString("base64url");
        photos.set(id, { buf, expires: Date.now() + TTL_MS });
        const proto = req.headers["x-forwarded-proto"]?.split(",")[0] ?? "http";
        const host = req.headers["x-forwarded-host"] ?? req.headers.host;
        send(res, 200, { url: `${proto}://${host}/api/photo/${id}` });
      })
      .catch(() => send(res, 413, { error: "Upload too large" }));
    return true;
  }

  const m = req.method === "GET" && url.pathname.match(/^\/api\/photo\/([\w-]+)$/);
  if (m) {
    sweep();
    const p = photos.get(m[1]);
    if (!p) {
      send(res, 404, { error: "This photo has expired." });
      return true;
    }
    send(res, 200, p.buf, {
      "Content-Type": "image/jpeg",
      "Content-Disposition": 'attachment; filename="boat-booth-photo.jpg"',
      "Cache-Control": "private, max-age=3600",
    });
    return true;
  }

  return false;
}
