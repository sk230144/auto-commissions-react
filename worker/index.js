/**
 * Same-origin proxy for the commission API — the Cloudflare equivalent of
 * vercel.json's /__api rewrite. The API sends no CORS headers, so the browser
 * must talk to this origin and the Worker forwards server-side.
 *
 * If the API moves, change API_ORIGIN here and VITE_API_BASE_URL in .env.
 *
 * Workers refuse to fetch a bare IP (Cloudflare error 1003), so the IP is
 * wrapped in sslip.io — a public wildcard DNS where 66.42.90.20.sslip.io
 * resolves to 66.42.90.20. If the API ever gets a real hostname, use that.
 */
const API_ORIGIN = "http://66.42.90.20.sslip.io:28975";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/__api" || url.pathname.startsWith("/__api/")) {
      const upstream = API_ORIGIN + url.pathname.replace(/^\/__api/, "") + url.search;
      // Pass the original request through so method, headers and body survive.
      return fetch(upstream, request);
    }

    // Anything else (only reachable if run_worker_first widens): serve assets.
    return env.ASSETS.fetch(request);
  },
};
