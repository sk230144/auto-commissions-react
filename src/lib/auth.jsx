import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, setAuthToken, setOnUnauthorized, authLogin, authMe } from "./api.js";

/**
 * Identity and permissions, served by the API.
 *
 * The backend enforces access on every request; this only mirrors it so the UI
 * knows what to render. Hiding a nav item is a courtesy — the API is the lock,
 * and a route the role cannot reach is refused there whatever the client does.
 *
 * Permissions are read from the database per request, so a grant, revoke, role
 * change or suspension applies immediately. That is why a 403 refreshes the
 * session rather than assuming our copy is right.
 */

const TOKEN_KEY = "ac.token";

/**
 * Where the token lives decides how long the session outlives the browser.
 *
 *   remembered → localStorage    survives closing the browser, up to the
 *                                token's own 12-hour expiry
 *   not        → sessionStorage  dies when the tab closes, which is what a
 *                                shared machine needs
 *
 * Both are read on boot, so a session started either way is restored. Writes
 * only ever go to the chosen one, and signing out clears both.
 */
const readToken = () => {
  try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ""; }
  catch { return ""; }
};
const writeToken = (token, remember) => {
  try {
    clearToken();
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  } catch { /* private mode — the session simply will not survive a reload */ }
};
const clearToken = () => {
  try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); }
  catch { /* ignore */ }
};

/** The 16 page permissions, grouped for the sidebar and the access matrix. */
export const PAGES = [
  { key: "pipeline_overview", route: "pipeline", label: "Pipeline Overview", group: "Payments" },
  { key: "pending_approval", route: "pending", label: "Pending Approval", group: "Payments" },
  { key: "ready_to_pay", route: "ready", label: "Ready to Pay", group: "Payments" },
  { key: "pay_statements", route: "stmt", label: "Pay Statements", group: "Payments" },
  { key: "exposure", route: "exposure", label: "Exposure", group: "Payments" },
  { key: "payment_records", route: "paid", label: "Payment Records", group: "Payments" },
  { key: "on_hold", route: "hold", label: "On Hold", group: "Payments" },
  { key: "advances", route: "advances", label: "Advances", group: "Payments" },
  { key: "dealer_rates", route: "dealer", label: "Dealer Rates", group: "Rate cards" },
  { key: "sales_rep_rates", route: "rep", label: "Sales Rep Rates", group: "Rate cards" },
  { key: "payout_logic", route: "logic", label: "Payout Logic", group: "Rate cards" },
  { key: "manual_payments", route: "push", label: "Manual Payments", group: "Operations" },
  { key: "open_items", route: "review", label: "Open Items", group: "Operations" },
  { key: "tickets", route: "tickets", label: "Tickets", group: "Operations" },
  { key: "user_management", route: "users", label: "User Management", group: "Admin" },
  { key: "access_control", route: "access", label: "Access Control", group: "Admin" },
];

/** URL path ↔ permission key. The router speaks routes, the API speaks keys. */
export const ROUTE_TO_PERM = Object.fromEntries(PAGES.map((p) => [p.route, p.key]));
export const PERM_TO_ROUTE = Object.fromEntries(PAGES.map((p) => [p.key, p.route]));
export const PAGE_LABEL = Object.fromEntries(PAGES.map((p) => [p.route, p.label]));

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(null);
  // Until the stored token is checked we know nothing — rendering the login
  // screen during that gap would flash it at an already-signed-in user.
  const [booting, setBooting] = useState(() => !!readToken());
  const [authError, setAuthError] = useState("");

  /** Rebuild the session from a stored token (F5), or drop it if it is dead. */
  const refresh = useCallback(async () => {
    const token = readToken();
    if (!token) { setMe(null); setBooting(false); return null; }
    setAuthToken(token);
    try {
      const user = await authMe();
      setMe(user);
      return user;
    } catch (e) {
      // 401 means the token expired or the account was suspended. Anything
      // else (the server being down) must NOT sign the user out.
      if (e instanceof ApiError && e.status === 401) {
        clearToken();
        setAuthToken(null);
        setMe(null);
      }
      return null;
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  /**
   * A 401 anywhere in the app ends the session — the token is dead or the
   * account was suspended, and every subsequent call would fail the same way.
   * A 403 is different: the session is fine but access changed underneath us,
   * so re-read it rather than logging anyone out.
   */
  useEffect(() => {
    setOnUnauthorized((status, message) => {
      if (status === 401) {
        clearToken();
        setAuthToken(null);
        setMe(null);
        setAuthError(message || "Your session has ended. Sign in again.");
      } else if (status === 403) {
        refresh();
      }
    });
    return () => setOnUnauthorized(null);
  }, [refresh]);

  /** Returns an error string rather than throwing, so the form can show it. */
  const signIn = useCallback(async (email, password, remember = true) => {
    try {
      const data = await authLogin(email.trim(), password);
      writeToken(data.token, remember);
      setAuthToken(data.token);
      setAuthError("");
      // The login response carries the same user object as /auth/me, so the
      // shell can be built without a second round trip.
      setMe(data.user);
      return null;
    } catch (e) {
      return e.message || "Could not sign in.";
    }
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setAuthToken(null);
    setMe(null);
    setAuthError("");
  }, []);

  const permissions = me?.permissions || [];

  /** The one gate for nav items, routes and buttons. Takes a ROUTE key. */
  const can = useCallback((route) => {
    if (!me) return false;
    if (me.role === "super_admin") return true;
    const perm = ROUTE_TO_PERM[route] || route;
    return permissions.includes(perm);
  }, [me, permissions]);

  /** Read-only roles may open a page but not change it — the API returns 403,
   *  so the button is hidden rather than offered and then refused. */
  const canWrite = useCallback((route) => can(route) && !me?.read_only, [can, me]);

  /** Routes this user may reach, in sidebar order. */
  const allowed = useMemo(
    () => PAGES.filter((p) => can(p.route)).map((p) => p.route),
    [can]
  );

  const value = useMemo(() => ({
    me, booting, authError, setAuthError,
    signIn, signOut, refresh,
    can, canWrite, allowed, permissions,
    readOnly: !!me?.read_only,
    mustChangePassword: !!me?.must_change_password,
  }), [me, booting, authError, signIn, signOut, refresh, can, canWrite, allowed, permissions]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
