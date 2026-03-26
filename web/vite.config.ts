import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  root: resolve(__dirname),
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3420",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: resolve(__dirname, "../dist-web"),
    emptyOutDir: true,
  },
});
