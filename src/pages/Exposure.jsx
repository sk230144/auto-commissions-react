import { useState } from "react";
import { Search, Download } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { moneyC, csvDownload } from "../lib/fmt.js";
import { useApi, useDebounced } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { Async, TableSkeleton, Pager, SortTh } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";
import ProjectDrawer from "../components/ProjectDrawer.jsx";
import { useSortState } from "../lib/sort.js";

const LIMIT = 25;

/**
 * Exposure — money already out, or committed, against work not yet installed.
 * Three independent reads: the cards, the by-party table, and the projects
 * where an advance was paid but the project never completed.
 */
export default function Exposure() {
  const { eco, say } = useStore();
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [incOffset, setIncOffset] = useState(0);
  const [open, setOpen] = useState(null);
  // Two independent tables, two sort states. Server defaults reassert when cleared.
  const [pSort, onPSortRaw] = useSortState();
  const onPSort = (k) => { onPSortRaw(k); setOffset(0); };
  const [iSort, onISortRaw] = useSortState();
  const onISort = (k) => { onISortRaw(k); setIncOffset(0); };

  const search = useDebounced(q, 350);

  const sumQ = useApi((signal) => api.exposureSummary({ party_type: eco }, { signal }), [eco]);
  const partiesQ = useApi(
    (signal) => api.exposureParties(
      { party_type: eco, search, sort_by: pSort?.k || "pipeline_commission",
        sort_dir: pSort?.dir || "desc", limit: LIMIT, offset },
      { signal }),
    [eco, search, offset, JSON.stringify(pSort)]
  );
  const incQ = useApi(
    (signal) => api.exposurePaidIncomplete(
      { party_type: eco, sort_by: iSort?.k || "our_reference", sort_dir: iSort?.dir || "asc",
        limit: LIMIT, offset: incOffset },
      { signal }),
    [eco, incOffset, JSON.stringify(iSort)]
  );

  const t = sumQ.data?.totals;
  const rows = partiesQ.data?.parties || [];
  const total = partiesQ.data?.total ?? 0;
  const inc = incQ.data?.projects || [];
  const incTotal = incQ.data?.total ?? 0;

  function exportCsv() {
    const header = [eco === "rep" ? "Rep" : "Dealer", "Pre-install projects", "Advances paid",
      "Advances due", "Pipeline commission", "Adv %"];
    const body = rows.map((r) => [r.party, r.pre_install_projects,
      (r.advances_paid_cents / 100).toFixed(2), (r.advances_due_cents / 100).toFixed(2),
      (r.pipeline_commission_cents / 100).toFixed(2), r.adv_pct + "%"]);
    csvDownload(`${eco} exposure`, header, body)
      ? say(`Exported ${rows.length} rows (this page)`)
      : say("Nothing to export", true);
  }

  const tiles = [
    { k: "Advances paid — outstanding", v: t && moneyC(t.advances_paid_cents), tone: "held", live: t?.advances_paid_cents > 0 },
    { k: "Advances due (NTP draws)", v: t && moneyC(t.advances_due_cents), tone: "pend", live: t?.advances_due_cents > 0 },
    { k: "Pipeline commission", v: t && moneyC(t.pipeline_commission_cents), tone: "due", live: t?.pipeline_commission_cents > 0 },
    { k: "Exposure % of pipeline", v: t && `${t.adv_pct}%`, tone: "info", live: t?.adv_pct > 0 },
    { k: "Pre-install projects", v: t && (t.pre_install_projects ?? 0).toLocaleString(), tone: "info", live: t?.pre_install_projects > 0 },
  ];

  return (
    <>
      <PageHead eyebrow={eco === "rep" ? "Sales Rep Pay" : "Dealer Pay"} title="Exposure"
        count={partiesQ.loading ? "loading…" : partiesQ.error ? "—" : `${total.toLocaleString()} parties`}>
        <button className="btn" onClick={exportCsv} disabled={!rows.length}>
          <Download size={14} strokeWidth={2} />Export CSV
        </button>
      </PageHead>

      <div className="pagebody">
        <div className={"kpis" + (sumQ.refreshing ? " refreshing" : "")}>
          {tiles.map((x) => (
            <div key={x.k} className={`kpi ${x.tone}` + (x.live ? "" : " quiet")} style={{ cursor: "default" }}>
              <span className="dot" />
              <div className="k">{x.k}</div>
              <div className="v">
                {sumQ.loading ? <span className="sk" style={{ width: 76, height: 15 }} />
                  : sumQ.error ? "—" : x.v}
              </div>
            </div>
          ))}
        </div>
        {sumQ.error && (
          <div className="sub" style={{ color: "var(--held)" }}>
            The exposure totals could not be loaded — {sumQ.error.message}{" "}
            <button className="btn sm" onClick={sumQ.reload} style={{ marginLeft: 6 }}>Retry</button>
          </div>
        )}

        <div className="sub">
          Money already out against work not yet installed — paid advance principal and NTP draws
          still to come, measured against the commission those projects will produce once they do
          install.
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
            <Async q={partiesQ} what="exposure by party" isEmpty={!rows.length}
              skeleton={<TableSkeleton cols={6} />}
              empty={search ? "No parties match that search." : "No pre-install exposure."}>
              <div className={"tblwrap" + (partiesQ.refreshing ? " refreshing" : "")}>
                <table>
                  <thead>
                    <tr>
                      <SortTh k="party" sort={pSort} onSort={onPSort}>{eco === "rep" ? "Rep" : "Dealer"}</SortTh>
                      <SortTh k="pre_install_projects" sort={pSort} onSort={onPSort} className="r">Projects</SortTh>
                      <SortTh k="advances_paid" sort={pSort} onSort={onPSort} className="r">Advances paid</SortTh>
                      <SortTh k="advances_due" sort={pSort} onSort={onPSort} className="r">Advances due</SortTh>
                      <SortTh k="pipeline_commission" sort={pSort} onSort={onPSort} className="r">Pipeline commission</SortTh>
                      <th className="r">Adv %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.party}>
                        <td>{r.party}</td>
                        <td className="r num">{(r.pre_install_projects ?? 0).toLocaleString()}</td>
                        <td className="r num">{moneyC(r.advances_paid_cents)}</td>
                        <td className="r num">{moneyC(r.advances_due_cents)}</td>
                        <td className="r num" style={{ fontWeight: 550 }}>{moneyC(r.pipeline_commission_cents)}</td>
                        <td className="r num">{r.adv_pct != null ? `${r.adv_pct}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager total={total} limit={LIMIT} offset={offset} onOffset={setOffset} busy={partiesQ.refreshing} />
            </Async>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Advance paid, project incomplete</h2>
            <div className="sp" />
            {!incQ.loading && !incQ.error && <span className="count">{incTotal.toLocaleString()}</span>}
          </div>
          <div className="card-b flush">
            <Async q={incQ} what="paid-incomplete projects" isEmpty={!inc.length}
              skeleton={<TableSkeleton rows={4} cols={3} />}
              empty="No advances sitting on incomplete projects.">
              <div className={"tblwrap" + (incQ.refreshing ? " refreshing" : "")}>
                <table>
                  <thead><tr>
                    <SortTh k="our_reference" sort={iSort} onSort={onISort}>OUR#</SortTh>
                    <SortTh k="party" sort={iSort} onSort={onISort}>{eco === "rep" ? "Rep" : "Dealer"}</SortTh>
                    <SortTh k="advance_paid" sort={iSort} onSort={onISort} className="r">Advance paid</SortTh>
                  </tr></thead>
                  <tbody>
                    {inc.map((r) => (
                      <tr key={r.our_reference + r.party}>
                        <td className="id">
                          <a href="#" onClick={(e) => { e.preventDefault(); setOpen(r.our_reference); }}>
                            {r.our_reference}
                          </a>
                        </td>
                        <td>{r.party}</td>
                        <td className="r num">{moneyC(r.advance_paid_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager total={incTotal} limit={LIMIT} offset={incOffset} onOffset={setIncOffset} busy={incQ.refreshing} />
            </Async>
          </div>
        </div>
      </div>

      {open && <ProjectDrawer our={open} onClose={() => setOpen(null)} />}
    </>
  );
}
