import { useState } from "react";
import { Search, Plus, ChevronRight, ChevronDown } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { moneyC, toCents, trunc, today } from "../lib/fmt.js";
import { useApi, useDebounced } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { Badge, Async, TableSkeleton, Pager, Modal, Confirm } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";

const LIMIT = 25;
const STATUSES = ["", "pending", "active", "repaid", "closed", "cancelled"];
const STATUS_LOOK = {
  pending: ["warn", "pending"], active: ["blue", "active"], repaid: ["ok", "repaid ✓"],
  closed: ["mut", "closed"], cancelled: ["mut", "cancelled"],
};

const PAYBACK_LABEL = {
  cents_per_watt: (r) => `${r}¢/W`,
  per_install: (r) => `$${r}/install`,
  pct_commission: (r) => `${r}% of commission`,
};
const payback = (a) => PAYBACK_LABEL[a.payback_type]?.(a.payback_rate) ?? `${a.payback_type} ${a.payback_rate}`;

/**
 * Advances — money paid out before it is earned, then recovered from installs.
 *
 *   create → pending → sign-off ×2 (distinct people) → active → weekly run
 *
 * The principal payout and every weekly payback show up on the Payments screens
 * automatically as `manual|…|ADV<id>` lines, so nothing is wired for that here.
 */
export default function Advances() {
  const { say, me } = useStore();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState(() => new Set());
  const [form, setForm] = useState(null);
  const [closeFor, setCloseFor] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [runOpen, setRunOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const search = useDebounced(q, 350);

  const listQ = useApi(
    (signal) => api.advancesList(
      { status, search, sort_by: "id", sort_dir: "desc", limit: LIMIT, offset }, { signal }),
    [status, search, offset]
  );
  const rows = listQ.data?.advances || [];
  const total = listQ.data?.total ?? 0;

  const reset = (fn) => (v) => { fn(v); setOffset(0); };
  const toggleRow = (id) => setExpanded((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  async function act(fn, okMsg) {
    setBusy(true);
    try {
      const res = await fn();
      say(typeof okMsg === "function" ? okMsg(res) : okMsg);
      listQ.reload();
    } catch (e) {
      // Four-eyes refusals come back as plain messages — show them verbatim.
      say(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  /** One button; the response says which signature just landed. */
  const approve = (a) => act(
    () => api.advanceApprove(a.id, me),
    (res) => res?.stage === "active"
      ? "Approved — principal paid out"
      : "First sign-off recorded — a second, different approver is needed"
  );

  return (
    <>
      <PageHead title="Advances"
        count={listQ.loading ? "loading…" : listQ.error ? "—"
          : `${total.toLocaleString()} advance${total === 1 ? "" : "s"}`}>
        <button className="btn" onClick={() => setRunOpen(true)}>Run payback cycle</button>
        <button className="btn pri" onClick={() => setForm({
          code: "", party: "", party_type: "dealer", principal: "",
          payback_type: "pct_commission", payback_rate: "", notes: "",
        })}>
          <Plus size={14} strokeWidth={2} />New advance
        </button>
      </PageHead>

      <div className="pagebody">
        <div className="sub">
          Principal paid up front and recovered over pay cycles. Two <b>distinct</b> sign-offs are
          required and the creator cannot be either of them — the money only moves on the second
          signature. Expand a row to see what each cycle deducted.
        </div>

        <div className="card">
          <div className="card-h">
            <div className="seg">
              {STATUSES.map((s) => (
                <button key={s || "all"} className={status === s ? "on" : ""} onClick={() => reset(setStatus)(s)}>
                  {s ? s[0].toUpperCase() + s.slice(1) : "All"}
                </button>
              ))}
            </div>
            <div className="sp" />
            <div className="search" style={{ width: 230 }}>
              <span className="mag"><Search size={14} strokeWidth={2} /></span>
              <input placeholder="Code, payee, amount…" value={q} onChange={(e) => reset(setQ)(e.target.value)} />
            </div>
          </div>

          <div className="card-b flush">
            <Async q={listQ} what="advances" isEmpty={!rows.length}
              skeleton={<TableSkeleton cols={8} />}
              empty={search || status ? "No advances match." : "No advances recorded."}>
              <div className={"tblwrap" + (listQ.refreshing || busy ? " refreshing" : "")}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 30 }} />
                      <th>Code</th><th>Payee</th><th>Payback</th>
                      <th className="r">Starting</th><th className="r">Repaid</th><th className="r">Balance</th>
                      <th>Status</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => {
                      const [kind, label] = STATUS_LOOK[a.status] || ["mut", a.status];
                      const isOpen = expanded.has(a.id);
                      const deds = a.deductions || [];
                      return (
                        <>
                          <tr key={a.id}>
                            <td>
                              {deds.length > 0 && (
                                <button className="btn gho sm" style={{ padding: 3 }}
                                  onClick={() => toggleRow(a.id)}
                                  aria-label={isOpen ? "Hide payback history" : "Show payback history"}>
                                  {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                </button>
                              )}
                            </td>
                            <td className="id">{a.code}</td>
                            <td title={a.party}>
                              {trunc(a.party, 24)}
                              <div className="submeta">{a.party_type} · {a.rail} rail</div>
                            </td>
                            <td>{payback(a)}</td>
                            <td className="r num">{moneyC(a.principal_cents)}</td>
                            <td className="r num">{moneyC(a.repaid_cents)}</td>
                            <td className="r num" style={{ fontWeight: 600 }}>{moneyC(a.balance_cents)}</td>
                            <td>
                              <Badge kind={kind}><span className="pip" />{label}</Badge>
                              {a.status === "pending" && (
                                <div className="submeta">
                                  {a.sign1_by ? `1st ✓ ${a.sign1_by.split("@")[0]}` : "awaiting 1st"}
                                </div>
                              )}
                              {a.close_reason && <div className="submeta">{trunc(a.close_reason, 26)}</div>}
                            </td>
                            <td className="r">
                              <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 6 }}>
                                {a.status === "pending" && <>
                                  <button className="btn sm pri" disabled={busy} onClick={() => approve(a)}>Approve</button>
                                  <button className="btn sm danger" disabled={busy} onClick={() => setConfirm({
                                    title: "Cancel this advance?",
                                    body: <>Cancel <b>{a.code}</b>? It has not been paid out, so nothing is recovered.</>,
                                    confirmLabel: "Cancel advance", danger: true,
                                    onYes: () => { setConfirm(null); act(() => api.advanceCancel(a.id, me), "Cancelled"); },
                                  })}>Cancel</button>
                                </>}
                                {(a.status === "active" || a.status === "repaid") && (
                                  <button className="btn sm" disabled={busy} onClick={() => setCloseFor(a)}>Close</button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isOpen && deds.map((x, i) => (
                            <tr key={`${a.id}-d${i}`} style={{ background: "var(--panel-2)" }}>
                              <td />
                              <td colSpan={3} style={{ fontSize: 12, color: "var(--ink-2)" }}>
                                {x.cycle_start} → {x.cycle_end}
                                <div className="submeta">{x.basis}</div>
                              </td>
                              <td />
                              <td className="r num" style={{ fontSize: 12 }}>{moneyC(x.amount_cents)}</td>
                              <td colSpan={3} />
                            </tr>
                          ))}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager total={total} limit={LIMIT} offset={offset} onOffset={setOffset} busy={listQ.refreshing} />
            </Async>
          </div>
        </div>
      </div>

      {form && <CreateDialog form={form} setForm={setForm} busy={busy} onSave={(body) =>
        act(() => api.advanceCreate({ ...body, actor: me }), "Created — awaiting two sign-offs")
          .then(() => setForm(null))} />}

      {closeFor && <CloseDialog advance={closeFor} busy={busy} onCancel={() => setCloseFor(null)}
        onOk={(reason) => { const a = closeFor; setCloseFor(null); act(() => api.advanceClose(a.id, me, reason), "Closed"); }} />}

      {runOpen && <RunDialog busy={busy} onCancel={() => setRunOpen(false)}
        onOk={(body) => { setRunOpen(false); act(() => api.advanceRun({ ...body, actor: me }), (res) => {
          const n = res?.applied?.length || 0, s = res?.skipped?.length || 0;
          return `Cycle ${res?.cycle || ""}: ${n} charged, ${s} skipped`;
        }); }} />}

      {confirm && <Confirm {...confirm} onNo={() => setConfirm(null)} />}
    </>
  );
}

function CreateDialog({ form, setForm, onSave, busy }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const cents = toCents(form.principal);
  const rate = Number(form.payback_rate);
  const ok = form.party.trim() && cents > 0 && Number.isFinite(rate) && rate > 0;

  return (
    <Modal title="New advance"
      why="No money moves yet — the advance stays pending until two different people sign it off."
      onClose={() => setForm(null)}
      footer={<>
        <button className="btn" onClick={() => setForm(null)}>Cancel</button>
        <button className="btn pri" disabled={!ok || busy}
          onClick={() => onSave({
            code: form.code, party: form.party.trim(), party_type: form.party_type,
            principal_cents: cents, payback_type: form.payback_type,
            payback_rate: rate, notes: form.notes,
          })}>Create</button>
      </>}>
      <div className="grid">
        <div><label className="f">Code</label>
          <input value={form.code} placeholder="ADV-2026-014" onChange={set("code")} /></div>
        <div><label className="f">Payee *</label>
          <input value={form.party} onChange={set("party")} /></div>
        <div><label className="f">Payee type</label>
          <select value={form.party_type} onChange={set("party_type")}>
            <option value="dealer">Dealer</option><option value="rep">Sales rep</option>
            <option value="setter">Setter</option><option value="override">Override</option>
          </select></div>
        <div><label className="f">Principal $ *</label>
          <input type="number" step="0.01" value={form.principal} onChange={set("principal")} /></div>
        <div><label className="f">Payback</label>
          <select value={form.payback_type} onChange={set("payback_type")}>
            <option value="cents_per_watt">¢ per watt</option>
            <option value="per_install">$ per install</option>
            <option value="pct_commission">% of commission</option>
          </select></div>
        <div><label className="f">Rate *</label>
          <input type="number" step="0.01" value={form.payback_rate} onChange={set("payback_rate")} /></div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label className="f">Notes</label>
        <textarea rows={2} value={form.notes} onChange={set("notes")} />
      </div>
    </Modal>
  );
}

function CloseDialog({ advance, onOk, onCancel, busy }) {
  const [reason, setReason] = useState("");
  return (
    <Modal title="Close this advance"
      why="Closing halts future paybacks. Any outstanding balance stays on record."
      onClose={onCancel}>
      <div style={{ fontSize: 13, marginBottom: 12, color: "var(--ink-2)" }}>
        {advance.code} · {advance.party} · balance {moneyC(advance.balance_cents)}
      </div>
      <label className="f">Reason *</label>
      <input autoFocus value={reason} placeholder="e.g. settled offline"
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && reason.trim() && onOk(reason.trim())} />
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn pri" disabled={!reason.trim() || busy} onClick={() => onOk(reason.trim())}>Close</button>
      </div>
    </Modal>
  );
}

/** The weekly cycle. Idempotent server-side — a repeated cycle is skipped, not double-charged. */
function RunDialog({ onOk, onCancel, busy }) {
  const [v, setV] = useState({ party_type: "dealer", cycle_start: "", cycle_end: today() });
  const ok = v.cycle_start && v.cycle_end && v.cycle_start <= v.cycle_end;
  return (
    <Modal title="Run the payback cycle"
      why="Charges every active advance on this rail against its payee's installs inside the window. Running the same cycle twice is skipped, never double-charged."
      onClose={onCancel}>
      <div className="grid">
        <div><label className="f">Rail</label>
          <select value={v.party_type} onChange={(e) => setV({ ...v, party_type: e.target.value })}>
            <option value="dealer">Dealer</option><option value="rep">Sales rep</option>
          </select></div>
        <div><label className="f">Cycle start *</label>
          <input type="date" value={v.cycle_start} onChange={(e) => setV({ ...v, cycle_start: e.target.value })} /></div>
        <div><label className="f">Cycle end *</label>
          <input type="date" value={v.cycle_end} onChange={(e) => setV({ ...v, cycle_end: e.target.value })} /></div>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn pri" disabled={!ok || busy} onClick={() => onOk(v)}>Run cycle</button>
      </div>
    </Modal>
  );
}
