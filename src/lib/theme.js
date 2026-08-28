import { useEffect, useState } from "react";

/**
 * Two states only — "light" / "dark", stamped on the root as data-theme.
 * Persisted to localStorage so a refresh keeps whatever the user picked.
 */
const KEY = "ac.theme";

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    // Dark is the default for a first visit; an explicit "light" choice is the
    // only thing that overrides it, and it is kept once made.
    try { return localStorage.getItem(KEY) === "light" ? "light" : "dark"; } catch { return "dark"; }
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(KEY, theme); } catch {}
  }, [theme]);

  const cycle = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  return { theme, resolved: theme, setTheme, cycle };
}
