import { useState } from "react";
import { useStore } from "../lib/store.jsx";
import { money } from "../lib/fmt.js";
import { Badge, Empty, Modal, Confirm, Ask } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";
import FilterPanel, { facet, activeCount, passesFilter } from "../components/FilterPanel.jsx";

const FILTER_GROUPS = [
  { key: "party", label: "Payee", field: "party" },
  { key: "party_type", label: "Payee type", field: "party_type" },
  { key: "status", label: "Status", field: "status" },
];

const PAYBACK = {
  cents_per_watt: (r) => `${r}¢/W`,
  per_install: (r) => `$${r}/install`,
  pct_commission: (r) => `${r}% of commission`,
};

export default function Advances() {
  const { advances, dispatch, say, me } = useStore();
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [ask, setAsk] = useState(null);

  const [filter, setFilter] = useState({ party: [], party_type: [], status: [] });

  const pending = advances.filter((a) => a.status === "pending");
  const liveAll = advances.filter((a) => a.status !== "pending");
  const live = liveAll.filter((a) => passesFilter(a, filter, FILTER_GROUPS));

  const filterGroupsWithOptions = FILTER_GROUPS.map((g) => ({ ...g, options: facet(liveAll, g.field) }));
  const filterCount = activeCount(filter, FILTER_GROUPS);

  const bal = (a) => a.principal - a.repaid;

  function approve(a) {
    // Four-eyes: the creator cannot approve, and the second signature must differ.
    if (a.created_by === me) return say("The creator cannot approve their own advance", true);
    if (a.sign1_by === me) return say("The second sign-off must be a different approver", true);
    dispatch({ type: "advance-approve", id: a.id });
    say(a.sign1_by ? "Approved — principal paid out" : "First approval recorded");
  }

  return (
    <>
      <PageHead title="Advances" count={`${live.filter((a) => a.status === "active").length} active`}>
        <button className="btn pri" onClick={() => setForm({
          code: "", party: "", party_type: "rep", principal: "", payback_type: "cents_per_watt", payback_rate: "", notes: "",
        })}>New advance</button>
      </PageHead>

      <div className="pagebody">
      <div className="sub">
        Principal paid up front and recovered over pay cycles. Requires two distinct
        approvals, and the creator cannot be either of them. The authoritative balance is
        principal minus the sum of deductions — the stored balance is only a cache.
      </div>

      <div className="card">
          <div className="card-h"><h2>Awaiting approval</h2></div>
          <div className="card-b">
        {pending.length === 0 ? <Empty>Nothing awaiting approval.</Empty> : (
          <div className="tblwrap">
            <table>
              <thead><tr><th>Code</th><th>Payee</th><th>Type</th><th className="r">Principal</th><th>Payback</th><th>Signatures</th><th /></tr></thead>
              <tbody>
                {pending.map((a) => (
                  <tr key={a.id}>
                    <td>{a.code}</td>
                    <td>{a.party}</td>
                    <td>{a.party_type}</td>
                    <td className="r num">{money(a.principal)}</td>
                    <td>{PAYBACK[a.payback_type]?.(a.payback_rate)}</td>
                    <td style={{ fontSize: 11.5 }}>
                      {a.sign1_by ? <Badge kind="ok">1st ✓</Badge> : <Badge kind="mut">1st —</Badge>}{" "}
                      {a.sign2_by ? <Badge kind="ok">2nd ✓</Badge> : <Badge kind="mut">2nd —</Badge>}
                    </td>
                    <td className="r">
                      <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        <button className="btn sm pri" onClick={() => approve(a)}>Approve</button>
                        <button className="btn sm danger" onClick={() => setConfirm({
                          title: "Cancel this advance?", body: "It has not been paid out, so nothing is recovered.",
                          confirmLabel: "Cancel advance", danger: true,
                          onYes: () => { dispatch({ type: "advance-cancel", id: a.id }); setConfirm(null); say("Cancelled"); },
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
            <h2>Active and closed</h2>
            <div className="sp" />
            <FilterPanel groups={filterGroupsWithOptions} value={filter} onApply={setFilter} count={filterCount} />
          </div>
          <div className="card-b">
        {live.length === 0 ? <Empty /> : (
          <div className="tblwrap">
            <table>
              <thead><tr><th>Code</th><th>Payee</th><th>Payback</th><th className="r">Starting</th><th className="r">Repaid</th><th className="r">Balance</th><th>Status</th><th /></tr></thead>
              <tbody>
                {live.map((a) => (
                  <tr key={a.id}>
                    <td>{a.code}</td>
                    <td>{a.party}<div style={{ fontSize: 11, color: "var(--ink-3)" }}>{a.party_type}</div></td>
                    <td>{PAYBACK[a.payback_type]?.(a.payback_rate)}</td>
                    <td className="r num">{money(a.principal)}</td>
                    <td className="r num">{money(a.repaid)}</td>
                    <td className="r num"><b>{money(bal(a))}</b></td>
                    <td>
                      <Badge kind={a.status === "active" ? "blue" : a.status === "repaid" ? "ok" : "mut"}>
                        {a.status === "repaid" ? "repaid ✓" : a.status}
                      </Badge>
                    </td>
                    <td className="r">
                      {a.status === "active" && (
                        <button className="btn sm" onClick={() => setAsk({
                          title: "Close this advance",
                          why: "Closing halts future paybacks. The outstanding balance stays on record.",
                          label: "Reason",
                          onOk: (v) => { dispatch({ type: "advance-close", id: a.id, reason: v }); setAsk(null); say("Closed"); },
                        })}>Close</button>
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
        <Modal title="New advance" why="Paid out only after two distinct approvals." onClose={() => setForm(null)}>
          <div className="grid">
            <div><label className="f">Code</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="ADV-2026-012" /></div>
            <div><label className="f">Payee</label><input value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} /></div>
            <div><label className="f">Payee type</label>
              <select value={form.party_type} onChange={(e) => setForm({ ...form, party_type: e.target.value })}>
                <option value="rep">Sales Rep</option><option value="setter">Setter</option>
                <option value="dealer">Dealer-Partner</option><option value="override">Override</option>
              </select></div>
            <div><label className="f">Principal $</label><input type="number" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} /></div>
            <div><label className="f">Payback</label>
              <select value={form.payback_type} onChange={(e) => setForm({ ...form, payback_type: e.target.value })}>
                <option value="cents_per_watt">¢ per watt</option>
                <option value="per_install">$ per install</option>
                <option value="pct_commission">% of commissions</option>
              </select></div>
            <div><label className="f">Rate</label><input type="number" value={form.payback_rate} onChange={(e) => setForm({ ...form, payback_rate: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="f">Notes</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn pri"
              disabled={!form.party || !(Number(form.principal) > 0) || !(Number(form.payback_rate) > 0)}
              onClick={() => {
                dispatch({ type: "advance-create", row: { ...form, principal: Number(form.principal), payback_rate: Number(form.payback_rate), rail: form.party_type === "rep" || form.party_type === "setter" ? "rep" : "dealer" } });
                setForm(null); say("Advance created — awaiting approval");
              }}>Create</button>
          </div>
        </Modal>
      )}

      {confirm && <Confirm {...confirm} onNo={() => setConfirm(null)} />}
      {ask && <Ask {...ask} onCancel={() => setAsk(null)} />}
      </div>
    </>
  );
}
