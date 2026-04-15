import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@sfcr/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
      "@sfcr/core-worker": fileURLToPath(new URL("../core-worker/src/index.ts", import.meta.url))
    }
  },
  base: command === "serve" ? "/" : process.env.VITE_BASE_PATH ?? "/"
}));
