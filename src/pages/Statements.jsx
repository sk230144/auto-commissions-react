import { useState } from "react";
import { Search, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/store.jsx";
import { moneyC, csvDownload } from "../lib/fmt.js";
import { useApi, useDebounced } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { Async, TableSkeleton, Pager } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";

const LIMIT = 25;
const STALE_MS = 24 * 3600 * 1000;

/**
 * Pay Statements — earned, settled and net due per party, straight from
 * /payments/balances. `totals` covers the whole set (never just this page) and
 * `engine_run` is the provenance line: which run produced these figures.
 */
export default function Statements() {
  const { eco, say } = useStore();
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const nav = useNavigate();

  const search = useDebounced(q, 350);

  const q1 = useApi(
    (signal) => api.paymentBalances(
      { party_type: eco, search, sort_by: "net_due", sort_dir: "desc", limit: LIMIT, offset },
      { signal }),
    [eco, search, offset]
  );

  const rows = q1.data?.parties || [];
  const total = q1.data?.total ?? 0;
  const t = q1.data?.totals;
  const run = q1.data?.engine_run;

  const staleRun = run?.run_at && (Date.now() - Date.parse(run.run_at)) > STALE_MS;

  function exportCsv() {
    const header = [eco === "rep" ? "Rep" : "Dealer", "Jobs", "Earned", "Settled", "Net due"];
    const body = rows.map((g) => [g.party, g.jobs, (g.earned_cents / 100).toFixed(2),
      (g.settled_cents / 100).toFixed(2), (g.net_due_cents / 100).toFixed(2)]);
    csvDownload(`${eco} statements`, header, body)
      ? say(`Exported ${rows.length} rows (this page)`)
      : say("Nothing to export", true);
  }

  const countLine = q1.loading ? "loading…" : q1.error ? "—"
    : `${(t?.jobs ?? 0).toLocaleString()} jobs · net due ${moneyC(t?.net_due_cents ?? 0)}`;

  return (
    <>
      <PageHead eyebrow={eco === "rep" ? "Sales Rep Pay" : "Dealer Pay"} title="Pay Statements"
        count={countLine}>
        <button className="btn" onClick={exportCsv} disabled={!rows.length}>
          <Download size={14} strokeWidth={2} />Export CSV
        </button>
      </PageHead>

      <div className="pagebody">
        <div className="sub">
          Earned minus settled is the net due. A negative net due means the party owes OWE —
          usually a deduction or a project that regressed after payment.
          {run && <>
            {" "}Engine run {String(run.run_at).slice(0, 10)} · {(run.lines ?? 0).toLocaleString()} lines · {run.source}.
            {staleRun && <b style={{ color: "var(--pend)" }}> This run is over a day old — figures may be stale.</b>}
          </>}
        </div>

        <div className="card">
          <div className="card-h">
            <h2>By {eco === "rep" ? "rep" : "dealer"}</h2>
            <div className="sp" />
            <div className="search" style={{ width: 240 }}>
              <span className="mag"><Search size={14} strokeWidth={2} /></span>
              <input placeholder="Name or amount…" value={q}
                onChange={(e) => { setQ(e.target.value); setOffset(0); }} />
            </div>
          </div>

          <div className="card-b flush">
            <Async q={q1} what="pay statements" isEmpty={!rows.length}
              skeleton={<TableSkeleton cols={5} />}
              empty={search ? "No parties match that search." : "No balances to show."}>
              <div className={"tblwrap" + (q1.refreshing ? " refreshing" : "")}>
                <table>
                  <thead>
                    <tr>
                      <th>{eco === "rep" ? "Rep" : "Dealer"}</th>
                      <th className="r">Jobs</th><th className="r">Earned</th>
                      <th className="r">Settled</th><th className="r">Net due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((g) => (
                      <tr key={g.party}>
                        <td>
                          <a href={`/stmt/${encodeURIComponent(g.party)}`}
                            onClick={(e) => { e.preventDefault(); nav(`/stmt/${encodeURIComponent(g.party)}`); }}>
                            {g.party}
                          </a>
                        </td>
                        <td className="r num">{g.jobs.toLocaleString()}</td>
                        <td className="r num">{moneyC(g.earned_cents)}</td>
                        <td className="r num">{moneyC(g.settled_cents)}</td>
                        <td className="r num">
                          <b style={{ color: g.net_due_cents < 0 ? "var(--held)" : undefined }}>{moneyC(g.net_due_cents)}</b>
                        </td>
                      </tr>
                    ))}
                    {/* Totals are the whole set, not this page — labelled so. */}
                    {t && (
                      <tr>
                        <td><b>All {(total || 0).toLocaleString()} parties</b></td>
                        <td className="r num"><b>{(t.jobs ?? 0).toLocaleString()}</b></td>
                        <td className="r num"><b>{moneyC(t.earned_cents)}</b></td>
                        <td className="r num"><b>{moneyC(t.settled_cents)}</b></td>
                        <td className="r num"><b>{moneyC(t.net_due_cents)}</b></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Pager total={total} limit={LIMIT} offset={offset} onOffset={setOffset} busy={q1.refreshing} />
            </Async>
          </div>
        </div>

      </div>

    </>
  );
}
