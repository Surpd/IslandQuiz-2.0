import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Включаем статический экспорт вместо Nitro Cloudflare Workers
    deployment: {
      target: "static",
    },
  },
  vite: {
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