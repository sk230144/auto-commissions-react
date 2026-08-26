/**
 * In-memory store. Every mutation the real app performs happens here instead of
 * hitting an API, so the UI is fully exercisable offline.
 *
 * Replacing this with real endpoints is the whole migration: each function below
 * maps 1:1 onto a route in apps/auto-commissions/worker.js.
 */
import { createContext, useContext, useMemo, useReducer, useState } from "react";
import * as D from "../data/dummy.js";

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

const money2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Recompute the derived fields /api/lines adds, after a mutation. */
function reclass(l) {
  const amount = money2(l.amount);
  const settled = money2(l.settled);
  const balance = money2(amount - settled);
  const norate = l.status === "NO-SETTINGS";
  const rel = l.releasable == null ? null : money2(l.releasable);
  const readyBal = rel == null ? balance : money2(Math.min(amount, rel) - settled);
  const scheduled = rel == null ? 0 : money2(amount - Math.min(amount, rel));
  let cls;
  if (l.denied) cls = "onhold";
  else if (l.status !== "DUE" && !norate) cls = "notdue";
  else if (!l.approved || l.changed || norate) cls = "pending";
  else if (Math.abs(readyBal) > 0.005) cls = "ready";
  else if (scheduled > 0.005) cls = "scheduled";
  else cls = "paid";
  return { ...l, amount, settled, balance, readyBal, scheduled, norate, cls };
}

function reducer(state, a) {
  switch (a.type) {
    case "approve": {
      const keys = new Set(a.keys);
      return { ...state, lines: state.lines.map((l) =>
        keys.has(l.line_key) && !l.norate ? reclass({ ...l, approved: true, changed: false, denied: false }) : l) };
    }
    case "unapprove":
      return { ...state, lines: state.lines.map((l) =>
        l.line_key === a.key ? reclass({ ...l, approved: false }) : l) };
    case "hold":
      return { ...state, lines: state.lines.map((l) =>
        l.line_key === a.key ? reclass({ ...l, approved: false, denied: true, deny_reason: a.reason }) : l) };
    case "reopen":
      return { ...state, lines: state.lines.map((l) =>
        l.line_key === a.key ? reclass({ ...l, denied: false, deny_reason: null }) : l) };
    case "settle": {
      const line = state.lines.find((l) => l.line_key === a.key);
      if (!line) return state;
      const s = {
        id: state.settlements.length + 1, line_key: a.key, our: line.our, party: line.party,
        kind: line.kind, amount: money2(a.amount), method: a.method || "ACH",
        txn: a.txn || "", date: a.date || new Date().toISOString().slice(0, 10),
        entered_by: state.me,
      };
      return {
        ...state,
        settlements: [s, ...state.settlements],
        lines: state.lines.map((l) =>
          l.line_key === a.key ? reclass({ ...l, settled: money2(l.settled + a.amount) }) : l),
      };
    }
    // ── settings CRUD — mirrors /api/settings insert | edit | end_date | void ──
    case "settings-insert": {
      const rows = state.settings[a.table] || [];
      const id = Math.max(0, ...rows.map((r) => r.id || 0)) + 1;
      const row = { id, ...a.row, void: 0 };
      return {
        ...state,
        settings: { ...state.settings, [a.table]: [row, ...rows] },
        log: [{ id: state.log.length + 1, table_name: a.table, row_id: id, action: "insert", changed_by: state.me, changed_at: new Date().toISOString() }, ...state.log],
      };
    }
    case "settings-edit":
      return {
        ...state,
        settings: { ...state.settings, [a.table]: (state.settings[a.table] || []).map((r) => r.id === a.id ? { ...r, ...a.row } : r) },
        log: [{ id: state.log.length + 1, table_name: a.table, row_id: a.id, action: "edit", changed_by: state.me, changed_at: new Date().toISOString() }, ...state.log],
      };
    case "settings-enddate":
      return {
        ...state,
        settings: { ...state.settings, [a.table]: (state.settings[a.table] || []).map((r) => r.id === a.id ? { ...r, end_date: a.end_date } : r) },
        log: [{ id: state.log.length + 1, table_name: a.table, row_id: a.id, action: "end_date", changed_by: state.me, changed_at: new Date().toISOString() }, ...state.log],
      };
    case "settings-void":
      return {
        ...state,
        settings: { ...state.settings, [a.table]: (state.settings[a.table] || []).map((r) => r.id === a.id ? { ...r, void: a.on ? 1 : 0 } : r) },
        log: [{ id: state.log.length + 1, table_name: a.table, row_id: a.id, action: a.on ? "void" : "unvoid", changed_by: state.me, changed_at: new Date().toISOString() }, ...state.log],
      };
    // ── review ────────────────────────────────────────────────────────────────
    case "review-resolve":
      return { ...state, review: state.review.map((r) =>
        r.id === a.id ? { ...r, status: "resolved", resolution: a.resolution, resolved_by: state.me } : r) };
    case "review-reopen":
      return { ...state, review: state.review.map((r) =>
        r.id === a.id ? { ...r, status: "open", resolved_by: null } : r) };
    // ── advances ──────────────────────────────────────────────────────────────
    case "advance-create": {
      const id = Math.max(0, ...state.advances.map((x) => x.id)) + 1;
      return { ...state, advances: [{ id, status: "pending", repaid: 0, sign1_by: null, sign2_by: null, created_by: state.me, ...a.row }, ...state.advances] };
    }
    case "advance-approve":
      return { ...state, advances: state.advances.map((x) => {
        if (x.id !== a.id) return x;
        if (!x.sign1_by) return { ...x, sign1_by: state.me };
        if (x.sign1_by === state.me) return x;           // second must differ
        return { ...x, sign2_by: state.me, status: "active" };
      }) };
    case "advance-cancel":
      return { ...state, advances: state.advances.map((x) => x.id === a.id ? { ...x, status: "cancelled" } : x) };
    case "advance-close":
      return { ...state, advances: state.advances.map((x) => x.id === a.id ? { ...x, status: "closed", close_reason: a.reason } : x) };
    // ── manual pushes ─────────────────────────────────────────────────────────
    case "push-create": {
      const id = Math.max(0, ...state.pushes.map((x) => x.id)) + 1;
      return { ...state, pushes: [{ id, status: "pending", requested_by: state.me, sign1_by: null, sign2_by: null, ...a.row }, ...state.pushes] };
    }
    case "push-sign":
      return { ...state, pushes: state.pushes.map((p) => {
        if (p.id !== a.id) return p;
        if (!p.sign1_by) return { ...p, sign1_by: state.me };
        if (p.sign1_by === state.me) return p;           // two DISTINCT admins
        return { ...p, sign2_by: state.me, status: "approved" };
      }) };
    case "push-cancel":
      return { ...state, pushes: state.pushes.map((p) => p.id === a.id && p.status !== "approved" ? { ...p, status: "cancelled" } : p) };
    // ── tickets ───────────────────────────────────────────────────────────────
    case "ticket-save": {
      if (a.row.id) return { ...state, tickets: state.tickets.map((t) => t.id === a.row.id ? { ...t, ...a.row } : t) };
      const id = Math.max(0, ...state.tickets.map((t) => t.id)) + 1;
      // raised_by falls back to the signed-in user only when left blank — the
      // spread would otherwise let an empty field wipe the default.
      return { ...state, tickets: [{
        id, status: "open", created_at: new Date().toISOString().slice(0, 10),
        ...a.row, raised_by: a.row.raised_by?.trim() || state.me,
      }, ...state.tickets] };
    }
    // ── access ────────────────────────────────────────────────────────────────
    case "user-role":
      return { ...state, users: state.users.some((u) => u.email === a.email)
        ? state.users.map((u) => u.email === a.email ? { ...u, role: a.role } : u)
        : [...state.users, { email: a.email, role: a.role }] };
    case "user-remove":
      return { ...state, users: state.users.filter((u) => u.email !== a.email) };
    case "request-decide":
      return { ...state, requests: state.requests.map((r) => r.id === a.id ? { ...r, status: a.approve ? "approved" : "denied" } : r),
        users: a.approve ? [...state.users, { email: a.email, role: a.role || "ops" }] : state.users };
    default:
      return state;
  }
}

export function StoreProvider({ children }) {
  const [me] = useState("cantonucci@ourworldenergy.com");
  const [state, dispatch] = useReducer(reducer, {
    me,
    lines: D.LINES,
    settlements: D.SETTLEMENTS,
    settings: D.SETTINGS_ROWS,
    log: D.SETTINGS_LOG,
    review: D.REVIEW,
    advances: D.ADVANCES,
    pushes: D.PUSHES,
    tickets: D.TICKETS,
    users: D.USERS,
    requests: D.ACCESS_REQUESTS,
  });

  const [eco, setEco] = useState("dealer");     // "dealer" | "rep"
  const [toast, setToast] = useState(null);
  const say = (msg, bad) => { setToast({ msg, bad }); setTimeout(() => setToast(null), 2600); };

  /** Ecosystem scoping — the toggle re-scopes seven tabs at once. */
  const ecoTypes = eco === "rep" ? ["rep", "setter"] : ["dealer", "override"];
  const lines = useMemo(
    () => state.lines.filter((l) => ecoTypes.includes(l.party_type)),
    [state.lines, eco] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const value = { ...state, lines, allLines: state.lines, eco, setEco, dispatch, toast, say, D };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
