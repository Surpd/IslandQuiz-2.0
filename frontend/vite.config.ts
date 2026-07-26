import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";

export default defineConfig({
  tanstackStart: {
    // Включаем статический экспорт вместо Nitro Cloudflare Workers
    deployment: {
      target: "static",
    },
  },
  vite: {
    plugins: [
      cssInjectedByJsPlugin(), // <-- Добавили инлайнинг CSS
    ],
    build: {
      // Разбиваем тяжелые библиотеки на мелкие чанки, чтобы VPN не подавился
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules")) {
              return "vendor";
            }
          },
        },
      },
    },
  },
});