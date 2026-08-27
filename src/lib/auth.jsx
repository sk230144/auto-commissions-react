import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Identity and permissions.
 *
 * This is a FRONT-END STAND-IN. There is no auth API yet, so the credential
 * check and the user list live in the browser and persist to localStorage.
 * That means it is a UI shell for a real system, not a security boundary:
 * anyone can read the seed credential in the bundle or edit localStorage.
 * Nothing here should be relied on to protect money until the backend exists.
 *
 * It is shaped so that swap is small — `signIn` becomes one POST, `users`
 * becomes one GET, and every component that reads `can()` stays unchanged.
 */

const SESSION_KEY = "ac.session";
const USERS_KEY = "ac.users";

/** Every routable page, with the label the nav uses. The permission matrix and
 *  the router are driven from this one list so they cannot drift apart. */
export const PAGES = [
  { key: "pipeline", label: "Pipeline Overview", group: "Payments" },
  { key: "pending", label: "Pending Approval", group: "Payments" },
  { key: "ready", label: "Ready to Pay", group: "Payments" },
  { key: "stmt", label: "Pay Statements", group: "Payments" },
  { key: "exposure", label: "Exposure", group: "Payments" },
  { key: "paid", label: "Payment Records", group: "Payments" },
  { key: "hold", label: "On Hold", group: "Payments" },
  { key: "advances", label: "Advances", group: "Payments" },
  { key: "dealer", label: "Dealer Rates", group: "Rate cards" },
  { key: "rep", label: "Sales Rep Rates", group: "Rate cards" },
  { key: "logic", label: "Payout Logic", group: "Rate cards" },
  { key: "push", label: "Manual Payments", group: "Operations" },
  { key: "review", label: "Open Items", group: "Operations" },
  { key: "tickets", label: "Tickets", group: "Operations" },
  { key: "users", label: "User Management", group: "Admin" },
  { key: "access", label: "Access Control", group: "Admin" },
];

export const PAGE_KEYS = PAGES.map((p) => p.key);
export const PAGE_LABEL = Object.fromEntries(PAGES.map((p) => [p.key, p.label]));

export const ROLES = ["super_admin", "admin", "ops", "approver", "auditor"];
export const ROLE_LABEL = {
  super_admin: "Super admin", admin: "Admin", ops: "Operations",
  approver: "Approver", auditor: "Auditor",
};
export const ROLE_BLURB = {
  super_admin: "Everything, including access control. Cannot be locked out.",
  admin: "Everything except access control.",
  ops: "Day-to-day payment work. No rate cards.",
  approver: "Approves advances and manual payments only.",
  auditor: "Read-only across the money and the rate cards.",
};

/**
 * Default pages per role. super_admin is deliberately not listed — it is
 * granted everything unconditionally below, so a bad edit here can never lock
 * the last administrator out of Access Control.
 */
export const ROLE_PAGES = {
  admin: PAGE_KEYS.filter((k) => k !== "access"),
  ops: ["pipeline", "pending", "ready", "stmt", "exposure", "paid", "hold", "advances", "logic", "push", "review", "tickets"],
  approver: ["advances", "push", "tickets"],
  auditor: ["pipeline", "pending", "ready", "stmt", "exposure", "paid", "hold", "dealer", "rep", "logic", "tickets"],
};

/** The seed account, until the backend exists. */
const SEED_USERS = [
  { email: "admin@gmail.com", password: "1234", name: "Admin", role: "super_admin", status: "active" },
];

const read = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
};
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  // A browser that used an earlier build still holds users and grants for
  // roles that no longer exist. Reconcile on load rather than leaving someone
  // signed in with a role nothing grants — which reads as "no pages" and looks
  // like the app is broken.
  const [users, setUsers] = useState(() =>
    read(USERS_KEY, SEED_USERS).map((u) => ROLES.includes(u.role) ? u : { ...u, role: "ops" }));
  const [session, setSession] = useState(() => read(SESSION_KEY, null));
  // Per-role page grants, overridable from Access Control. Keys for removed
  // roles are dropped; a role added since is seeded from its default.
  const [grants, setGrants] = useState(() => {
    const saved = read("ac.grants", {});
    return Object.fromEntries(
      ROLES.filter((r) => r !== "super_admin")
        .map((r) => [r, saved[r] ?? ROLE_PAGES[r] ?? []])
    );
  });

  useEffect(() => { write(USERS_KEY, users); }, [users]);
  useEffect(() => { write("ac.grants", grants); }, [grants]);
  useEffect(() => {
    if (session) write(SESSION_KEY, session);
    else { try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } }
  }, [session]);

  /** Resolves against the in-browser user list. Returns an error string rather
   *  than throwing, so the form can show it inline. */
  const signIn = useCallback((email, password) => {
    const e = String(email || "").trim().toLowerCase();
    const u = users.find((x) => x.email.toLowerCase() === e);
    // One message for both cases — saying "no such user" tells an attacker
    // which addresses are real.
    if (!u || u.password !== password) return "That email and password do not match.";
    if (u.status === "suspended") return "This account is suspended. An administrator can restore it.";
    setSession({ email: u.email, at: new Date().toISOString() });
    return null;
  }, [users]);

  const signOut = useCallback(() => setSession(null), []);

  const me = useMemo(
    () => (session ? users.find((u) => u.email.toLowerCase() === session.email.toLowerCase()) || null : null),
    [session, users]
  );

  /** Pages this user may see. super_admin bypasses the matrix entirely. */
  const allowed = useMemo(() => {
    if (!me) return [];
    if (me.role === "super_admin") return PAGE_KEYS;
    return grants[me.role] || [];
  }, [me, grants]);

  const can = useCallback((page) => allowed.includes(page), [allowed]);

  const value = useMemo(() => ({
    me, session, users, setUsers, grants, setGrants,
    signIn, signOut, allowed, can,
    isAdmin: me?.role === "super_admin" || me?.role === "admin",
    canManageAccess: me?.role === "super_admin",
  }), [me, session, users, grants, signIn, signOut, allowed, can]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
