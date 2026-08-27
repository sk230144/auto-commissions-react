import { useState } from "react";
import { Search, Plus } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { moneyC, toCents, trunc } from "../lib/fmt.js";
import { useApi, useDebounced } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { Badge, Async, TableSkeleton, Pager, Modal, Confirm } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";

const LIMIT = 50;
const STATUS_LOOK = {
  pending: ["warn", "pending"], approved: ["ok", "paid ✓"], cancelled: ["mut", "cancelled"],
};

/**
 * Manual Payments — off-cycle money the engine never computed. Every one needs
 * two DISTINCT admin sign-offs; the ledger legs only post on the second.
 *
 * A dealer-funded rep payment posts two legs in one transaction — the rep is
 * paid and the funding dealer is deducted the same amount — so it is net-zero
 * to OWE. There is no edit or delete: a correction is a new negative payment.
 */
export default function Pushes() {
  const { say, me, eco } = useStore();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const search = useDebounced(q, 350);

  const listQ = useApi(
    (signal) => api.manualPaymentsList({ rail: eco, status, search, limit: LIMIT, offset }, { signal }),
    [eco, status, search, offset]
  );

  const d = listQ.data;
  // Pending and history are split server-side, so the tables and their badges
  // can never disagree.
  const pending = d?.pending || [];
  const history = d?.history || [];
  const kinds = d?.kinds || [];
  const total = d?.total ?? 0;

  const reset = (fn) => (v) => { fn(v); setOffset(0); };

  async function act(fn, okMsg) {
    setBusy(true);
    try {
      const res = await fn();
      say(typeof okMsg === "function" ? okMsg(res) : okMsg);
      listQ.reload();
    } catch (e) {
      say(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  /** One button; the response's stage says which signature just landed. */
  const signoff = (p) => act(
    () => api.manualPaymentSignoff(p.id, me),
    (res) => res?.stage === "approved"
      ? "Approved — legs posted to the ledger"
      : "First sign-off recorded — a second, different admin is needed"
  );

  return (
    <>
      <PageHead eyebrow={eco === "rep" ? "Sales Rep Pay" : "Dealer Pay"} title="Manual Payments"
        count={listQ.loading ? "loading…" : listQ.error ? "—"
          : `${(d?.pending_count ?? 0).toLocaleString()} awaiting sign-off`}>
        <button className="btn pri" onClick={() => setForm({
          our: "", party: "", kind: "other", amount: "", reason: "", funded_by: "",
        })}>
          <Plus size={14} strokeWidth={2} />New manual payment
        </button>
      </PageHead>

      <div className="pagebody">
        <div className="sub">
          Off-cycle payments that bypass the normal milestone flow. Every one needs <b>two
          distinct admin sign-offs</b>, and the legs only post on the second. A dealer-funded rep
          payment posts two legs — the rep payment and an equal deduction on the funding dealer —
          so it is net-zero to OWE. Payments are append-only: a correction is a new negative entry.
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Awaiting sign-off</h2>
            {d && <span className="count">{(d.pending_count ?? 0).toLocaleString()}</span>}
          </div>
          <div className="card-b flush">
            <Async q={listQ} what="manual payments" isEmpty={!pending.length}
              skeleton={<TableSkeleton rows={3} cols={7} />}
              empty="Nothing awaiting sign-off.">
              <div className={"tblwrap" + (busy ? " refreshing" : "")}>
                <table>
                  <thead>
                    <tr><th>Payee</th><th>OUR#</th><th>Kind</th><th className="r">Amount</th>
                      <th>Reason</th><th>Sign-off</th><th /></tr>
                  </thead>
                  <tbody>
                    {pending.map((p) => (
                      <tr key={p.id}>
                        <td title={p.party}>
                          {trunc(p.party, 22)}
                          {p.funded_by && <div className="submeta">funded by {trunc(p.funded_by, 20)}</div>}
                        </td>
                        <td className="id">{p.our || <span className="gap">—</span>}</td>
                        <td>{p.kind_label || p.kind}</td>
                        <td className="r num" style={{ color: p.amount_cents < 0 ? "var(--held)" : undefined }}>
                          {moneyC(p.amount_cents)}
                        </td>
                        <td style={{ maxWidth: 240, color: "var(--ink-3)" }}>{trunc(p.reason, 60)}</td>
                        {/* Precomputed server-side so the column can't drift. */}
                        <td style={{ fontSize: 11.5 }}>{p.signoff_text}</td>
                        <td className="r">
                          <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 6 }}>
                            <button className="btn sm pri" disabled={busy} onClick={() => signoff(p)}>Sign off</button>
                            <button className="btn sm danger" disabled={busy} onClick={() => setConfirm({
                              title: "Cancel this manual payment?",
                              body: <>Cancel the <b>{moneyC(p.amount_cents)}</b> payment to <b>{p.party}</b>?
                                Nothing has posted, so nothing is reversed.</>,
                              confirmLabel: "Cancel it", danger: true,
                              onYes: () => { setConfirm(null); act(() => api.manualPaymentCancel(p.id, me), "Cancelled"); },
                            })}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Async>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h2>History</h2>
            {d && <span className="count">{(d.history_count ?? 0).toLocaleString()}</span>}
            <div className="sp" />
            <div className="seg">
              {["", "approved", "cancelled"].map((s) => (
                <button key={s || "all"} className={status === s ? "on" : ""} onClick={() => reset(setStatus)(s)}>
                  {s ? s[0].toUpperCase() + s.slice(1) : "All"}
                </button>
              ))}
            </div>
            <div className="search" style={{ width: 210 }}>
              <span className="mag"><Search size={14} strokeWidth={2} /></span>
              <input placeholder="OUR#, payee, reason…" value={q} onChange={(e) => reset(setQ)(e.target.value)} />
            </div>
          </div>
          <div className="card-b flush">
            <Async q={listQ} what="manual payments" isEmpty={!history.length}
              skeleton={<TableSkeleton cols={6} />}
              empty={search || status ? "No payments match." : "No manual payments recorded yet."}>
              <div className={"tblwrap" + (listQ.refreshing ? " refreshing" : "")}>
                <table>
                  <thead>
                    <tr><th>Payee</th><th>OUR#</th><th>Kind</th><th className="r">Amount</th>
                      <th>Reason</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {history.map((p) => {
                      const [kind, label] = STATUS_LOOK[p.status] || ["mut", p.status];
                      return (
                        <tr key={p.id}>
                          <td title={p.party}>
                            {trunc(p.party, 22)}
                            {p.funded_by && <div className="submeta">funded by {trunc(p.funded_by, 20)}</div>}
                          </td>
                          <td className="id">{p.our || <span className="gap">—</span>}</td>
                          <td>{p.kind_label || p.kind}</td>
                          <td className="r num" style={{ color: p.amount_cents < 0 ? "var(--held)" : undefined }}>
                            {moneyC(p.amount_cents)}
                          </td>
                          <td style={{ maxWidth: 240, color: "var(--ink-3)" }}>{trunc(p.reason, 60)}</td>
                          <td>
                            <Badge kind={kind}><span className="pip" />{label}</Badge>
                            {p.status === "approved" && (p.sign1_by || p.sign2_by) && (
                              <div className="submeta">
                                {[p.sign1_by, p.sign2_by].filter(Boolean).map((e) => e.split("@")[0]).join(" + ")}
                              </div>
                            )}
                          </td>
                        </tr>
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

      {form && <CreateDialog form={form} setForm={setForm} kinds={kinds} rail={eco} busy={busy}
        onSave={(body) => act(() => api.manualPaymentCreate({ ...body, actor: me }),
          "Raised — awaiting two sign-offs").then(() => setForm(null))} />}

      {confirm && <Confirm {...confirm} onNo={() => setConfirm(null)} />}
    </>
  );
}

function CreateDialog({ form, setForm, kinds, rail, onSave, busy }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const cents = toCents(form.amount);
  const dealerFunded = form.kind === "dealer-funded";

  // The server's rules, mirrored so the button explains itself before the call.
  const problems = [];
  if (!form.our.trim() && !form.party.trim()) problems.push("an OUR# or a payee is required");
  if (!cents) problems.push("the amount cannot be zero");
  if (!form.reason.trim()) problems.push("a reason is required");
  if (dealerFunded && !form.funded_by.trim()) problems.push("a dealer-funded payment needs a funder");
  if (dealerFunded && cents <= 0) problems.push("a dealer-funded payment must be positive");

  return (
    <Modal title="New manual payment"
      why="Posts to the ledger only after two distinct admins sign off."
      onClose={() => setForm(null)}
      footer={<>
        {/* The reason Raise is disabled belongs beside Raise, not scrolled
            away from it. */}
        {problems.length > 0 && (
          <span className="submeta" style={{ color: "var(--held)", marginRight: "auto" }}>{problems[0]}.</span>
        )}
        <button className="btn" onClick={() => setForm(null)}>Cancel</button>
        <button className="btn pri" disabled={problems.length > 0 || busy}
          onClick={() => onSave({
            our: form.our.trim(), party: form.party.trim(), kind: form.kind,
            amount_cents: cents, reason: form.reason.trim(), rail,
            ...(dealerFunded ? { funded_by: form.funded_by.trim() } : {}),
          })}>Raise</button>
      </>}>
      <div className="grid">
        <div><label className="f">OUR#</label><input value={form.our} onChange={set("our")} /></div>
        <div><label className="f">Payee</label><input value={form.party} onChange={set("party")} /></div>
        <div><label className="f">Kind</label>
          {/* The dropdown comes from the server — never hardcode it. */}
          <select value={form.kind} onChange={set("kind")}>
            {kinds.length
              ? kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)
              : <option value="other">Other payment</option>}
          </select></div>
        <div>
          <label className="f">Amount $</label>
          <input type="number" step="0.01" value={form.amount} onChange={set("amount")} />
          <div className="submeta">Negative for a deduction or clawback.</div>
        </div>
        {dealerFunded && (
          <div><label className="f">Funded by (dealer) *</label>
            <input value={form.funded_by} onChange={set("funded_by")} /></div>
        )}
      </div>
      <div style={{ marginTop: 10 }}>
        <label className="f">Reason *</label>
        <textarea rows={2} maxLength={400} value={form.reason} onChange={set("reason")} />
      </div>
      {dealerFunded && (
        <div className="submeta" style={{ marginTop: 8 }}>
          This posts <b>two legs</b>: the rep is paid and the funding dealer is deducted the same
          amount. It is forced onto the rep rail regardless of the current toggle.
        </div>
      )}
    </Modal>
  );
}
