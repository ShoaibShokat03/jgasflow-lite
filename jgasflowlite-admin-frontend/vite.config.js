import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { BASE_PATH } from "./src/config/app.js"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // ABSOLUTE base — must match the deploy sub-path (config/app.js BASE_PATH).
  // A relative base ("./") breaks a hard refresh on any nested route: the
  // browser resolves "./assets/x.js" against the current directory, gets the
  // SPA fallback HTML back instead of JS, and renders a blank page.
  base: BASE_PATH ? `${BASE_PATH}/` : "/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5001,
    strictPort: true, // fail instead of silently picking another port
    host: true, // Allow access from network (192.168.18.99)
    // Proxy removed - using direct URL or standalone proxy server instead
  },
})