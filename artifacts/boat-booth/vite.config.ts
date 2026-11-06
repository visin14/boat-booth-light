import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { handlePhotoRequest } from "./server/photos.mjs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig(async ({ command }) => {
  // PORT/BASE_PATH only matter for the dev server and `vite preview` — a
  // production build (e.g. on Vercel, which sets neither) doesn't bind a
  // port or need a non-root base, so only require them when actually
  // serving, instead of failing every build without them.
  const isServe = command === "serve";

  const rawPort = process.env.PORT;
  if (isServe && !rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }
  const port = Number(rawPort || 4000);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  const basePath = process.env.BASE_PATH;
  if (isServe && !basePath) {
    throw new Error(
      "BASE_PATH environment variable is required but was not provided.",
    );
  }

  return {
    base: basePath || "/",
    plugins: [
      {
        // Photo hand-off API for the QR-code download feature (dev + preview).
        name: "booth-photo-api",
        configureServer(server) {
          server.middlewares.use((req, res, next) => (handlePhotoRequest(req, res) ? undefined : next()));
        },
        configurePreviewServer(server) {
          server.middlewares.use((req, res, next) => (handlePhotoRequest(req, res) ? undefined : next()));
        },
      },
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      ...(process.env.NODE_ENV !== "production" &&
      process.env.REPL_ID !== undefined
        ? [
            await import("@replit/vite-plugin-cartographer").then((m) =>
              m.cartographer({
                root: path.resolve(import.meta.dirname, ".."),
              }),
            ),
            await import("@replit/vite-plugin-dev-banner").then((m) =>
              m.devBanner(),
            ),
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
        // Stub: the real "@workspace/api-client-react" workspace package isn't
        // present in this copied project. See src/stub-api-client.tsx.
        "@workspace/api-client-react": path.resolve(import.meta.dirname, "src/stub-api-client.tsx"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
