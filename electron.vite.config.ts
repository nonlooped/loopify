import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          app: resolve(__dirname, "src/main/app.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
        },
        output: {
          format: "cjs",
          entryFileNames: "[name].js",
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer"),
        // Match TS `baseUrl: "."` imports like `src/shared/...` (Vite does not use tsconfig paths by default)
        "src/": `${resolve(__dirname, "src")}/`,
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined
            if (id.includes("react-dom") || id.includes("/react/")) {
              return "vendor-react"
            }
            if (
              id.includes("@dnd-kit") ||
              id.includes("lucide-react") ||
              id.includes("@radix-ui")
            ) {
              return "vendor-ui"
            }
            if (id.includes("zustand") || id.includes("@tanstack")) {
              return "vendor-state"
            }
            return undefined
          },
        },
      },
    },
  },
})
