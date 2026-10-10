import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const apiTarget = `http://127.0.0.1:${process.env.PORT ?? 3000}`;

export default defineConfig({
  root: appRoot,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: fileURLToPath(new URL("../../dist/apps/web/client", import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        ws: true,
      },
    },
  },
});
