/**
 * The one place that talks to the commission API.
 *
 * Every base-URL / prefix / token decision lives here and comes from .env, so
 * moving the API is a one-line env change and nothing else in the app moves.
 *
 * Conventions the server enforces, mirrored here:
 *   · everything is POST with a JSON body unless a call is marked GET
 *   · money crosses the wire as integer CENTS, signed
 *   · unknown JSON fields are a 400 — so request builders below send only
 *     fields the doc lists, and omit rather than send undefined/empty
 *   · responses are enveloped {status, message, data}; callers get `data`
 */

const BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const PREFIX = import.meta.env.VITE_API_PREFIX || "/api/commission/v1";
const TOKEN = import.meta.env.VITE_API_TOKEN || "";
const TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT_MS) || 20000;

export const USE_DUMMY = String(import.meta.env.VITE_USE_DUMMY_DATA) === "true";

/**
 * The API sends no CORS headers, so a browser cannot call it directly from
 * another origin — only a same-origin proxy works. Both environments provide
 * one at the same path:
 *   · dev  — Vite's server.proxy   (vite.config.js)
 *   · prod — Vercel's rewrite      (vercel.json)
 *
 * So requests go to /__api by default. The absolute URL is used only when
 * VITE_USE_PROXY is explicitly "false" — i.e. once the API sends CORS headers.
 */
const USE_PROXY = String(import.meta.env.VITE_USE_PROXY ?? "true") !== "false";
export const API_ROOT = (USE_PROXY ? "/__api" : BASE) + PREFIX;

/** Thrown for any non-2xx. `status` lets callers tell 400 (our bug, show the
 *  server's wording) from 500 (their bug, show something generic). */
export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Drop keys the server would reject or that mean "not filtering". Empty
 *  strings and empty arrays are absence, not a value — sending them would
 *  either 400 or filter everything out. */
export function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) { if (v.length) out[k] = v; continue; }
    if (typeof v === "object") { const c = clean(v); if (Object.keys(c).length) out[k] = c; continue; }
    out[k] = v;
  }
  return out;
}

async function request(path, { method = "POST", body, signal } = {}) {
  if (!BASE && !USE_PROXY) throw new ApiError("No API base URL configured — set VITE_API_BASE_URL in .env", 0);

  // Our own timeout, chained to any caller-supplied abort signal so a
  // navigating-away component can still cancel in flight.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new DOMException("timeout", "TimeoutError")), TIMEOUT);
  const onAbort = () => ctl.abort(signal.reason);
  if (signal) { if (signal.aborted) onAbort(); else signal.addEventListener("abort", onAbort); }

  let res;
  try {
    res = await fetch(API_ROOT + path, {
      method,
      headers: {
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
        ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      },
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      signal: ctl.signal,
    });
  } catch (e) {
    if (e?.name === "AbortError" || e?.name === "TimeoutError") {
      // A caller-driven cancel must stay an abort so callers can ignore it.
      if (signal?.aborted) throw e;
      throw new ApiError(`Request timed out after ${Math.round(TIMEOUT / 1000)}s`, 0);
    }
    throw new ApiError("Could not reach the commission API — check the connection and the base URL.", 0);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }

  if (!res.ok) {
    // 400s name the offending field in plain language — the doc says show it
    // verbatim. 500s are generic on purpose.
    const msg = res.status >= 500
      ? "The commission API had a problem completing that request."
      : json?.message || `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, json);
  }
  return json?.data ?? json;
}

const post = (path, body, opts) => request(path, { ...opts, method: "POST", body });
const get = (path, opts) => request(path, { ...opts, method: "GET" });

/** GET query string, skipping absent params. */
const qs = (params) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== "") p.set(k, v);
  const s = p.toString();
  return s ? "?" + s : "";
};

// ── Pipeline ────────────────────────────────────────────────────────────────
export const pipelineProjects = (body, opts) => post("/pipeline/projects", clean(body), opts);
export const pipelineSummary = (body, opts) => post("/pipeline/summary", clean(body), opts);
/** The 5 KPI cards. Accepts ONLY party_type — a body carrying bucket/search/
 *  filter is a 400, because the cards deliberately describe the whole eco. */
export const pipelineCards = (party_type, opts) => post("/pipeline/cards", clean({ party_type }), opts);

// ── Project drawer ──────────────────────────────────────────────────────────
/** Header, timeline, commissions, payments and adders for one OUR#. An unknown
 *  reference is not an error: 200 with header:null and empty arrays. */
export const projectDetail = (our_reference, opts) => post("/projects/detail", { our_reference }, opts);

// ── Payments ────────────────────────────────────────────────────────────────
// show_zeros / show_all_dates are real booleans the server reads, so they are
// passed through `clean` only for the rest of the body — false must survive.
export const paymentLines = (body, opts) => post("/payments/lines", paymentsBody(body), opts);
export const paymentSummary = (body, opts) => post("/payments/summary", paymentsBody(body), opts);
export const paymentBalances = (body, opts) => post("/payments/balances", clean(body), opts);

export const approveLines = (line_keys, actor, opts) => post("/payments/approve", { line_keys, actor }, opts);
export const unapproveLines = (line_keys, opts) => post("/payments/unapprove", { line_keys }, opts);
export const holdLines = (line_keys, actor, reason, opts) => post("/payments/hold", { line_keys, actor, reason }, opts);
export const reopenLines = (line_keys, opts) => post("/payments/reopen", { line_keys }, opts);
export const settleLines = (actor, settlements, opts) => post("/payments/settle", { actor, settlements }, opts);

/** `clean` would strip `false`, but the two hide-toggles must be sent as-is. */
function paymentsBody(body = {}) {
  const { show_zeros, show_all_dates, ...rest } = body;
  const out = clean(rest);
  if (typeof show_zeros === "boolean") out.show_zeros = show_zeros;
  if (typeof show_all_dates === "boolean") out.show_all_dates = show_all_dates;
  return out;
}

// ── Exposure ────────────────────────────────────────────────────────────────
export const exposureSummary = (body, opts) => post("/exposure/summary", clean(body), opts);
export const exposureParties = (body, opts) => post("/exposure/parties", clean(body), opts);
export const exposurePaidIncomplete = (body, opts) => post("/exposure/paid-incomplete", clean(body), opts);

// ── Advances ────────────────────────────────────────────────────────────────
export const advancesList = (body, opts) => post("/advances/list", clean(body), opts);
export const advanceCreate = (body, opts) => post("/advances/create", clean(body), opts);
/** One sign-off per call. The response's `stage` says which one just landed:
 *  "first", or "active" when the second signature paid the principal out. */
export const advanceApprove = (id, actor, opts) => post("/advances/approve", { id, actor }, opts);
export const advanceCancel = (id, actor, opts) => post("/advances/cancel", { id, actor }, opts);
export const advanceClose = (id, actor, reason, opts) => post("/advances/close", { id, actor, reason }, opts);
export const advanceRun = (body, opts) => post("/advances/run", clean(body), opts);

// ── Rate settings registry ──────────────────────────────────────────────────
// Ten date-effective tables per rail, browsed one tab at a time. The column
// schema travels with the rows, so one grid renders every tab.
//
// `all` is a real boolean the server reads (show expired + scheduled rows), so
// it must survive `clean`, which would strip false.
const ratesBody = (body = {}) => {
  const { all, ...rest } = body;
  const out = clean(rest);
  if (typeof all === "boolean") out.all = all;
  return out;
};
export const dealerRates = (body, opts) => post("/dealer-rates", ratesBody(body), opts);
export const salesRepRates = (body, opts) => post("/sales-rep-rates", ratesBody(body), opts);
export const dealerRatesSummary = (opts) => get("/dealer-rates/summary", opts);
export const salesRepRatesSummary = (opts) => get("/sales-rep-rates/summary", opts);
/** One entry point for both rails, so the page is a single component. */
export const ratesFor = (rail) => rail === "rep" ? salesRepRates : dealerRates;
export const ratesSummaryFor = (rail) => rail === "rep" ? salesRepRatesSummary : dealerRatesSummary;

// ── Manual payments ─────────────────────────────────────────────────────────
export const manualPaymentsList = (body, opts) => post("/manual-payments/list", clean(body), opts);
export const manualPaymentCreate = (body, opts) => post("/manual-payments", clean(body), opts);
export const manualPaymentSignoff = (id, actor, opts) => post("/manual-payments/signoff", { id, actor }, opts);
export const manualPaymentCancel = (id, actor, opts) => post("/manual-payments/cancellation", { id, actor }, opts);

// ── Open items ──────────────────────────────────────────────────────────────
export const openItems = (opts) => get("/open-items", opts);
export const resolveOpenItem = (id, body, opts) => post(`/open-items/${id}/resolution`, clean(body), opts);
export const reopenOpenItem = (id, body, opts) => post(`/open-items/${id}/reopening`, clean(body), opts);
export const rateGaps = (opts) => get("/rate-gaps", opts);

// ── Payout logic ────────────────────────────────────────────────────────────
/** The rules behind the money: formula, rationale and a worked example each.
 *  Not in the integration doc, but live — and it beats hardcoding the maths in
 *  the client, where it would drift from what the engine actually does. */
export const payoutLogic = (opts) => get("/payout-logic", opts);

// ── Tickets ─────────────────────────────────────────────────────────────────
export const tickets = (params, opts) => get("/tickets" + qs(params), opts);
export const ticketCreate = (body, opts) => post("/tickets", clean(body), opts);
export const ticketUpdate = (id, body, opts) => post(`/tickets/${id}`, clean(body), opts);
