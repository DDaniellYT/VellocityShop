

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "vellocityshop-production.up.railway.app:8080",
      "/uploads": "vellocityshop-production.up.railway.app:8080",
      "/carousel": "vellocityshop-production.up.railway.app:8080",
    },
    port: 5173,
    host: true, // listen on all network interfaces, not just localhost
  },
});
