import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import { StoreProvider } from "./lib/store.jsx";
import "./styles.css";

// No <StrictMode>: its deliberate dev-only double-mount fired every API read
// twice (abort + retry) on each page load, which reads as a bug in the network
// tab and doubles load on the staging API. useApi cleans up after itself, so
// the safety net was costing more than it caught.
createRoot(document.getElementById("root")).render(
  <HashRouter>
    <StoreProvider>
      <App />
    </StoreProvider>
  </HashRouter>
);
