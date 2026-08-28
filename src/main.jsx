import { createRoot } from "react-dom/client";
// BrowserRouter, not HashRouter: real paths (/logic, not /#/logic). It needs
// the server to serve index.html for any URL — Vite does that in dev, and
// vercel.json's /(.*) → /index.html rewrite does it in production.
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { StoreProvider } from "./lib/store.jsx";
import { AuthProvider } from "./lib/auth.jsx";
import "./styles.css";

// No <StrictMode>: its deliberate dev-only double-mount fired every API read
// twice (abort + retry) on each page load, which reads as a bug in the network
// tab and doubles load on the staging API. useApi cleans up after itself, so
// the safety net was costing more than it caught.
// AuthProvider sits outermost: App decides between the login screen and the
// shell, so identity has to resolve before anything else mounts.
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AuthProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </AuthProvider>
  </BrowserRouter>
);
