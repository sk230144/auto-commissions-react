import { useState } from "react";
import { useStore } from "../lib/store.jsx";
import { money } from "../lib/fmt.js";
import { Badge, Empty, Modal, Confirm } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";
import FilterPanel, { facet, activeCount, passesFilter } from "../components/FilterPanel.jsx";

const FILTER_GROUPS = [
  { key: "party", label: "Payee", field: "party" },
  { key: "kind", label: "Kind", field: "kind" },
  { key: "status", label: "Status", field: "status" },
];

const KINDS = [
  ["other", "Other payment"], ["dealer-funded", "Dealer-funded rep payment"],
  ["bonus", "Bonus"], ["advance", "Advance"], ["adjustment", "Adjustment"],
  ["deduction", "Deduction (−)"], ["clawback", "Clawback (−)"],
];

export default function Pushes() {
  const { pushes, dispatch, say, me, eco } = useStore();
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const [filter, setFilter] = useState({ party: [], kind: [], status: [] });

  const pending = pushes.filter((p) => p.status === "pending");
  const historyAll = pushes.filter((p) => p.status !== "pending");
  const history = historyAll.filter((p) => passesFilter(p, filter, FILTER_GROUPS));

  const filterGroupsWithOptions = FILTER_GROUPS.map((g) => ({ ...g, options: facet(historyAll, g.field) }));
  const filterCount = activeCount(filter, FILTER_GROUPS);

  function sign(p) {
    if (p.sign1_by === me) return say("The second sign-off must be a different admin", true);
    dispatch({ type: "push-sign", id: p.id });
    say(p.sign1_by ? "Approved — legs posted to the ledger" : "First sign-off recorded");
  }

  return (
    <>
      <PageHead title="Manual Payments" count={`${pending.length} awaiting sign-off`}>
        <button className="btn pri" onClick={() => setForm({ our: "", party: "", kind: "other", amount: "", reason: "", funded_by: "", rail: eco })}>
          New manual payment
        </button>
      </PageHead>

      <div className="pagebody">
      <div className="sub">
        Off-cycle payments that bypass the normal milestone flow. Every one needs <b>two
        distinct admin sign-offs</b>. A dealer-funded rep payment posts two legs — the rep
        payment and an equal deduction on the funding dealer — so it is net-zero to OWE.
      </div>

      <div className="card">
          <div className="card-h"><h2>Pending sign-off</h2></div>
          <div className="card-b">
        {pending.length === 0 ? <Empty>Nothing awaiting sign-off.</Empty> : (
          <div className="tblwrap">
            <table>
              <thead><tr><th>Payee</th><th>OUR#</th><th>Kind</th><th className="r">Amount</th><th>Reason</th><th>Sign-off</th><th /></tr></thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id}>
                    <td>{p.party}{p.funded_by && <div style={{ fontSize: 11, color: "var(--ink-3)" }}>funded by {p.funded_by}</div>}</td>
                    <td>{p.our || "—"}</td>
                    <td>{p.kind}</td>
                    <td className="r num" style={{ color: p.amount < 0 ? "var(--bad)" : undefined }}>{money(p.amount)}</td>
                    <td style={{ maxWidth: 260, color: "var(--ink-3)" }}>{p.reason}</td>
                    <td style={{ fontSize: 11.5 }}>
                      {p.sign1_by ? <Badge kind="ok">1st ✓</Badge> : <Badge kind="mut">1st —</Badge>}{" "}
                      {p.sign2_by ? <Badge kind="ok">2nd ✓</Badge> : <Badge kind="mut">2nd —</Badge>}
                    </td>
                    <td className="r">
                      <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        <button className="btn sm pri" onClick={() => sign(p)}>Sign off</button>
                        <button className="btn sm danger" onClick={() => setConfirm({
                          title: "Cancel this manual payment?", body: "Nothing is posted. This cannot be undone.",
                          confirmLabel: "Cancel it", danger: true,
                          onYes: () => { dispatch({ type: "push-cancel", id: p.id }); setConfirm(null); say("Cancelled"); },
                        })}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>

      <div className="card">
          <div className="card-h">
            <h2>History</h2>
            <div className="sp" />
            <FilterPanel groups={filterGroupsWithOptions} value={filter} onApply={setFilter} count={filterCount} />
          </div>
          <div className="card-b">
        {history.length === 0 ? <Empty /> : (
          <div className="tblwrap">
            <table>
              <thead><tr><th>Payee</th><th>OUR#</th><th>Kind</th><th className="r">Amount</th><th>Reason</th><th>Status</th></tr></thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.id}>
                    <td>{p.party}</td>
                    <td>{p.our || "—"}</td>
                    <td>{p.kind}</td>
                    <td className="r num" style={{ color: p.amount < 0 ? "var(--bad)" : undefined }}>{money(p.amount)}</td>
                    <td style={{ maxWidth: 260, color: "var(--ink-3)" }}>{p.reason}</td>
                    <td>
                      <Badge kind={p.status === "approved" ? "ok" : "mut"}>{p.status === "approved" ? "paid ✓" : p.status}</Badge>
                      {p.status === "approved" && (
                        <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>
                          {p.sign1_by?.split("@")[0]} + {p.sign2_by?.split("@")[0]}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>

      {form && (
        <Modal title="New manual payment" why="Posts to the ledger only after two distinct admins sign off." onClose={() => setForm(null)}>
          <div className="grid">
            <div><label className="f">OUR#</label><input value={form.our} onChange={(e) => setForm({ ...form, our: e.target.value })} /></div>
            <div><label className="f">Payee</label><input value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} /></div>
            <div><label className="f">Kind</label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></div>
            <div><label className="f">Amount</label><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            {form.kind === "dealer-funded" && (
              <div><label className="f">Funded by (dealer)</label><input value={form.funded_by} onChange={(e) => setForm({ ...form, funded_by: e.target.value })} /></div>
            )}
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="f">Reason</label>
            <textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn pri"
              disabled={(!form.our && !form.party) || !Number(form.amount) || !form.reason.trim() ||
                (form.kind === "dealer-funded" && (!form.funded_by || Number(form.amount) <= 0))}
              onClick={() => {
                dispatch({ type: "push-create", row: { ...form, amount: Number(form.amount) } });
                setForm(null); say("Raised — awaiting two sign-offs");
              }}>Raise</button>
          </div>
        </Modal>
      )}

      {confirm && <Confirm {...confirm} onNo={() => setConfirm(null)} />}
      </div>
    </>
  );
}
