import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The commission API sends no CORS headers, so a browser blocks direct calls
 * even though the server answers curl fine. Requests therefore go to the
 * same-origin path /__api, which is proxied in both environments:
 *   · here, in dev
 *   · by the Cloudflare Worker (worker/index.js), in production
 *
 * VITE_API_BASE_URL is where the dev proxy points; the production target is
 * API_ORIGIN in worker/index.js.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_API_BASE_URL || "http://66.42.90.20:28975";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      open: true,
      proxy: {
        "/__api": {
          target,
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/__api/, ""),
        },
      },
    },
  };
});
