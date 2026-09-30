

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "vellocityshop-production.up.railway.app",
      "/uploads": "vellocityshop-production.up.railway.app",
      "/carousel": "vellocityshop-production.up.railway.app",
    },
    port: 5173,
    host: true, // listen on all network interfaces, not just localhost
  },
});
