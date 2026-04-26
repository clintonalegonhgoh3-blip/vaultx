// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": resolve(__dirname, "src") }
  },
  build: {
    outDir: "dist",
    sourcemap: false, // désactivé en production pour la sécurité
    rollupOptions: {
      output: {
        manualChunks: {
          react:  ["react", "react-dom"],
          dexie:  ["dexie"],
          zxcvbn: ["zxcvbn"],
        }
      }
    }
  },
  server: {
    port: 5173,
    https: false, // HTTPS requis en prod pour Web Crypto API
  }
});
