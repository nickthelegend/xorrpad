import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  base: "/desktop/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 8718,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8710",
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
