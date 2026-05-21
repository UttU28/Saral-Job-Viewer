import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(import.meta.dirname, ".."),
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    allowedHosts: [
      "saral.thatinsaneguy.com",
      "saralapi.thatinsaneguy.com",
      "localhost",
      "127.0.0.1",
    ],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    allowedHosts: [
      "saral.thatinsaneguy.com",
      "saralapi.thatinsaneguy.com",
      "localhost",
      "127.0.0.1",
    ],
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
});
