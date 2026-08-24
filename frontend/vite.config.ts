import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    deployment: {
      target: "static",
    },
  },
  vite: {
    plugins: [], // Оставляем массив пустым!
    server: {
      warmup: {
        clientFiles: ["./src/routes/__root.tsx", "./src/routes/builder.quiz.tsx"],
      },
    },
    build: {
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
