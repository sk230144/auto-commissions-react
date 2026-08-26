import { useMemo, useState } from "react";
import { Search, Download, Plus } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { csvDownload, today, trunc } from "../lib/fmt.js";
import { useApi, useDebounced } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { Badge, Async, TableSkeleton, Modal } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";

const MICRO = 1000000; // 1 USD = 1,000,000 micro-USD

const GROUP_TITLE = { DEALER: "Dealer Rates", REP: "Sales Rep Rates" };
const GROUP_SUB = {
  DEALER: "The redline each dealer is priced against, and the milestone schedule that releases it. A deal is priced by the card in force on its sale date.",
  REP: "The rate cards that price sales-rep pay. Same in-force rule: the card that was live on the sale date is the one that applies.",
};

/** $/W from micro-USD, shown to the precision the rate actually carries. */
const rateUsd = (micro) => micro == null ? null : micro / MICRO;
const fmtRate = (micro) => micro == null ? "—" : `$${rateUsd(micro).toFixed(3)}/W`;

/**
 * Rate cards — this service's own pricing records, and what the Pipeline's
 * "needs rate" check resolves against.
 *
 * Scope: the reference app also browses a much larger settings registry (Pay
 * Schedule, Loan Fees, Rep Pay Settings, …). That registry has no API yet, so
 * this page covers only the rate-card endpoints that exist and says so rather
 * than showing empty tables that look like missing data.
 */
export default function Settings({ group }) {
  const party_type = group === "REP" ? "rep" : "dealer";
  const { say } = useStore();
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const search = useDebounced(q, 350);

  // The endpoint filters by exact payee_id only, so the free-text box filters
  // client-side over the returned set.
  const cardsQ = useApi((signal) => api.rateCards({ party_type }, { signal }), [party_type]);
  const all = cardsQ.data || [];

  const rows = useMemo(() => {
    let out = showAll ? all : all.filter((c) => c.in_force);
    if (search.trim()) {
      const s = search.toLowerCase();
      out = out.filter((c) => [c.payee_id, c.state, fmtRate(c.redline_rate_micro_usd)]
        .join(" ").toLowerCase().includes(s));
    }
    return out;
  }, [all, showAll, search]);

  function exportCsv() {
    const header = ["payee_id", "state", "redline $/W", "effective_from", "effective_to", "in_force", "stages"];
    const body = rows.map((c) => [c.payee_id, c.state || "(all)",
      rateUsd(c.redline_rate_micro_usd)?.toFixed(3) ?? "", c.effective_from, c.effective_to || "",
      c.in_force ? "yes" : "no", (c.schedule || []).length]);
    csvDownload(`${party_type} rate cards`, header, body) ? say("Exported") : say("Nothing to export", true);
  }

  async function save() {
    const rate = Number(form.rate);
    if (!form.payee_id.trim()) return say("Payee is required", true);
    if (!form.effective_from) return say("Effective from is required", true);
    if (!Number.isFinite(rate) || rate < 0) return say("Redline must be a number", true);
    setBusy(true);
    try {
      await api.createRateCard({
        party_type,
        payee_id: form.payee_id.trim(),
        state: form.state.trim(),
        redline_rate_micro_usd: Math.round(rate * MICRO),
        schedule: [],
        effective_from: form.effective_from,
      });
      setForm(null);
      say("Rate card created");
      cardsQ.reload();
    } catch (e) {
      say(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead eyebrow="Rate cards" title={GROUP_TITLE[group]}
        count={cardsQ.loading ? "loading…" : cardsQ.error ? "—" : `${rows.length} of ${all.length} cards`}>
        <button className="btn" onClick={exportCsv} disabled={!rows.length}>
          <Download size={14} strokeWidth={2} />Export CSV
        </button>
        <button className="btn pri" onClick={() => setForm({ payee_id: "", state: "", rate: "", effective_from: today() })}>
          <Plus size={14} strokeWidth={2} />New rate card
        </button>
      </PageHead>

      <div className="pagebody">
        <div className="sub">{GROUP_SUB[group]}</div>

        <div className="card">
          <div className="card-h">
            <h2>Rate cards</h2>
            <div className="sp" />
            <label className="row" style={{ gap: 5, fontSize: 12.5, color: "var(--ink-3)" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)} />
              show all (incl. expired)
            </label>
            <div className="search" style={{ width: 220 }}>
              <span className="mag"><Search size={14} strokeWidth={2} /></span>
              <input placeholder="Payee or state…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          <div className="card-b flush">
            <Async q={cardsQ} what="rate cards" isEmpty={!rows.length}
              skeleton={<TableSkeleton cols={6} />}
              empty={search ? "No rate cards match that search."
                : showAll ? "No rate cards recorded." : "No rate cards currently in force."}>
              <div className="tblwrap">
                <table>
                  <thead>
                    <tr>
                      <th>Payee</th><th>State</th><th className="r">Redline</th>
                      <th>Effective from</th><th>Effective to</th><th>Stages</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id}>
                        <td title={c.payee_id}><b>{trunc(c.payee_id, 28)}</b></td>
                        {/* No state means the card applies everywhere — not that it is missing. */}
                        <td>{c.state || <span style={{ color: "var(--ink-3)" }}>all states</span>}</td>
                        <td className="r num">{fmtRate(c.redline_rate_micro_usd)}</td>
                        <td>{c.effective_from || <span className="gap">—</span>}</td>
                        <td>{c.effective_to || <span style={{ color: "var(--ink-3)" }}>open-ended</span>}</td>
                        <td className="num">{(c.schedule || []).length || <span style={{ color: "var(--ink-3)" }}>—</span>}</td>
                        <td>
                          <Badge kind={c.in_force ? "ok" : "mut"}>
                            {c.in_force && <span className="pip" />}{c.in_force ? "in force" : "not in force"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Async>
          </div>
        </div>

        {/* Stated rather than silently omitted: an absent screen should not look
            like an empty one. */}
        <div className="card">
          <div className="card-h"><h2>Settings registry</h2></div>
          <div className="card-b">
            <div className="sub" style={{ margin: 0 }}>
              The reference app also browses Pay Schedule, Loan Fees, Rep Pay Settings and the rest of
              the settings registry. <b>That registry has no API yet</b> — only the rate-card endpoints
              above exist, so those tables are deliberately not shown here rather than rendered empty.
            </div>
          </div>
        </div>
      </div>

      {form && (
        <Modal title="New rate card"
          why="Cards are never edited in place — a rate change is a new card with a later effective date. The card in force on a deal's sale date is the one that prices it."
          onClose={() => setForm(null)}>
          <div className="grid">
            <div>
              <label className="f">Payee *</label>
              <input autoFocus value={form.payee_id} placeholder="UNTD"
                onChange={(e) => setForm({ ...form, payee_id: e.target.value })} />
            </div>
            <div>
              <label className="f">State</label>
              <input value={form.state} placeholder="blank = all states"
                onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
            <div>
              <label className="f">Redline $/W *</label>
              <input type="number" step="0.001" value={form.rate} placeholder="2.500"
                onChange={(e) => setForm({ ...form, rate: e.target.value })} />
            </div>
            <div>
              <label className="f">Effective from *</label>
              <input type="date" value={form.effective_from}
                onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
            </div>
          </div>
          <div className="submeta" style={{ marginTop: 10 }}>
            The payee must match the tape's spelling exactly, or coverage will never match and
            every deal for them will show as <b>needs rate</b>.
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn pri" disabled={busy} onClick={save}>Create card</button>
          </div>
        </Modal>
      )}
    </>
  );
}
