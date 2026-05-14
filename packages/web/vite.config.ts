import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/src/notebook/notebookAssistant") || id.includes("/src/assistant/")) {
            return "assistant";
          }

          if (id.includes("/src/components/AssistantMarkdown.tsx")) {
            return "assistant";
          }

          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("@codemirror") || id.includes("/codemirror/")) {
            return "codemirror";
          }

          if (
            id.includes("react-markdown") ||
            id.includes("remark-gfm") ||
            id.includes("rehype-sanitize") ||
            id.includes("micromark") ||
            id.includes("unified")
          ) {
            return "markdown";
          }

          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
            return "react";
          }

          return undefined;
        }
      }
    }
  },
  define: {
    __SFCR_BUILD_DATE__: JSON.stringify(new Date().toISOString())
  },
  resolve: {
    alias: {
      "@sfcr/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
      "@sfcr/core-worker": fileURLToPath(new URL("../core-worker/src/index.ts", import.meta.url)),
      "@sfcr/notebook-core": fileURLToPath(new URL("../notebook-core/src/index.ts", import.meta.url))
    }
  },
  base: command === "serve" ? "/" : process.env.VITE_BASE_PATH ?? "/"
}));
