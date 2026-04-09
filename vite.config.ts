import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backendTarget = process.env.VITE_BACKEND_TARGET ?? "http://127.0.0.1:8000";

function manualChunks(id: string) {
  if (id.includes("maplibre-gl")) {
    return "maplibre";
  }
  if (id.includes("recharts") || id.includes("victory-vendor")) {
    return "charts";
  }
  if (id.includes("framer-motion")) {
    return "motion";
  }
  if (id.includes("lucide-react")) {
    return "icons";
  }
  if (id.includes("@tanstack/react-query")) {
    return "query";
  }
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/health": {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
});
