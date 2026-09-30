

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:5000",
      "/uploads": "http://localhost:5000",
      "/carousel": "http://localhost:5000",
    },
    port: 5173,
    host: true, // listen on all network interfaces, not just localhost
  },
});
