import { useMemo, useState } from "react";
import { Search, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/store.jsx";
import { money, moneyC, csvDownload, trunc } from "../lib/fmt.js";
import { useApi, useDebounced } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { Badge, Async, TableSkeleton, Pager, Tip } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";
import FilterPanel, { apiFacet } from "../components/FilterPanel.jsx";
import ProjectDrawer from "../components/ProjectDrawer.jsx";

const LIMIT = 25;
const BUCKETS = ["", "active", "jeopardy", "hold"];
const BUCKET_LABEL = { "": "All", active: "Active", jeopardy: "Jeopardy", hold: "Hold" };
const BLANK = { dealers: [], states: [], milestone: [], dateFrom: "", dateTo: "" };

/**
 * Pipeline Overview — pre-install projects, read live from the project tape.
 * Shows NO commission figures by design: nothing is priced until install, at
 * which point the money appears in Payments. What it does show is whether a
 * rate card covers the deal, because that is what blocks pay later.
 *
 * Filtering, search, sorting and paging are all server-side; the facet counts
 * in the "+ Filter" panel come from /pipeline/summary.
 */
export default function Pipeline() {
  const { eco, say } = useStore();
  const [bucket, setBucket] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState(BLANK);
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(null);
  const nav = useNavigate();

  const search = useDebounced(q, 350);

  // The doc allows one milestone, but the panel is multi-select; a single tick
  // is the only meaningful case, so send it only then.
  const milestone = filter.milestone.length === 1 ? filter.milestone[0] : "";
  const apiFilter = {
    dealers: filter.dealers, states: filter.states, milestone,
    date_from: filter.dateFrom, date_to: filter.dateTo,
  };
  const key = JSON.stringify({ eco, bucket, search, apiFilter });

  const rowsQ = useApi(
    (signal) => api.pipelineProjects(
      { party_type: eco, bucket, search, filter: apiFilter, limit: LIMIT, offset },
      { signal }),
    [key, offset]
  );
  const sumQ = useApi(
    (signal) => api.pipelineSummary({ party_type: eco, bucket, search, filter: apiFilter }, { signal }),
    [key]
  );

  const rows = rowsQ.data?.projects || [];
  const total = rowsQ.data?.total ?? 0;
  const s = sumQ.data;

  // Any change to what is being asked for resets to page one.
  const setF = (v) => { setFilter(v); setOffset(0); };
  const setB = (b) => { setBucket(b); setOffset(0); };
  const setSearch = (v) => { setQ(v); setOffset(0); };

  const groups = useMemo(() => [
    { key: "dealers", label: eco === "rep" ? "Rep" : "Dealer", field: "dealer", options: apiFacet(s?.facets?.dealers) },
    { key: "states", label: "State", field: "state", options: apiFacet(s?.facets?.states, { sort: "value" }) },
    { key: "milestone", label: "Milestone", field: "milestone", options: apiFacet(s?.facets?.milestones) },
  ], [s, eco]);

  const filterCount = filter.dealers.length + filter.states.length + filter.milestone.length
    + (filter.dateFrom || filter.dateTo ? 1 : 0);

  const kw = ((s?.total_watts ?? 0) / 1000);
  const countLine = sumQ.loading ? "loading…"
    : sumQ.error ? "—"
    : `${(s?.projects ?? 0).toLocaleString()} projects · ${kw.toLocaleString(undefined, { maximumFractionDigits: 2 })} kW`;

  function exportCsv() {
    const header = ["OUR#", "Customer", eco === "rep" ? "Rep" : "Dealer", "ST", "kW", "Contract", "Stage", "Date", "Status", "Rate ready"];
    const body = rows.map((r) => [
      r.our_reference, r.customer_name, eco === "rep" ? r.rep : r.dealer, r.state,
      r.system_size_watts ? (r.system_size_watts / 1000).toFixed(2) : "",
      r.contract_amount_cents != null ? (r.contract_amount_cents / 100).toFixed(2) : "",
      r.milestone, r.ntp_date || r.sale_date || "", r.project_status,
      r.rate_covered ? "yes" : r.rate_gap || "NO RATE",
    ]);
    csvDownload(`${eco} pipeline`, header, body)
      ? say(`Exported ${rows.length} rows (this page)`)
      : say("Nothing to export", true);
  }

  const rateCell = (r) => r.rate_covered
    ? (
      <Tip text="A rate card is in force for this deal on its sale date.">
        <Badge kind="ok"><span className="pip" />ready</Badge>
      </Tip>
    ) : (
      <Tip
        text={r.rate_gap ? `Cannot be priced — ${r.rate_gap}` : "Cannot be priced — no rate card in force."}>
        <Badge kind="bad"><span className="pip" />{trunc(r.rate_gap || "no rate", 34)}</Badge>
      </Tip>
    );

  const tiles = [
    { k: "Active", v: s?.buckets?.active, tone: "due", b: "active" },
    { k: "Jeopardy", v: s?.buckets?.jeopardy, tone: "pend", b: "jeopardy" },
    { k: "On hold", v: s?.buckets?.hold, tone: "held", b: "hold" },
    { k: "Needs rate", v: s?.needs_rate, tone: "held", sub: "unpriced — blocks pay" },
    { k: "Pre-install projects", v: s?.projects, tone: "info", b: "" },
  ];

  return (
    <>
      <PageHead eyebrow={eco === "rep" ? "Sales Rep Pay" : "Dealer Pay"} title="Pipeline Overview"
        count={countLine}>
        <button className="btn" onClick={exportCsv} disabled={!rows.length}>
          <Download size={14} strokeWidth={2} />Export CSV
        </button>
      </PageHead>

      <div className="pagebody">
        <div className={"kpis" + (sumQ.refreshing ? " refreshing" : "")}>
          {tiles.map((t) => (
            <button key={t.k} className={`kpi ${t.tone}` + (t.v ? "" : " quiet")}
              onClick={() => t.b !== undefined && setB(t.b)} disabled={t.b === undefined}>
              <span className="dot" />
              <div className="k">{t.k}</div>
              <div className="v">{sumQ.loading ? <span className="sk" style={{ width: 54, height: 15 }} />
                : sumQ.error ? "—" : (t.v ?? 0).toLocaleString()}</div>
              {t.sub && <div className="c">{t.v ? t.sub : "nothing here"}</div>}
            </button>
          ))}
        </div>

        <div className="sub">
          Active, jeopardy and hold projects <b>not yet installed</b>. Nothing is priced until
          the install milestone fires, at which point the commission lands in Pending Approval.
          <b> Rate ready</b> says whether a rate card is in force for that deal on its sale date.
          {s?.excluded_no_dealer > 0 && <> <b>{s.excluded_no_dealer}</b> record
            {s.excluded_no_dealer === 1 ? "" : "s"} with no dealer hidden.</>}
          {s?.needs_rate_partial && <> Rate coverage is <b>partially computed</b> — some rows may be unchecked.</>}
        </div>

        <div className="card">
          <div className="card-h">
            <div className="seg">
              {BUCKETS.map((b) => (
                <button key={b} className={bucket === b ? "on" : ""} onClick={() => setB(b)}>
                  {BUCKET_LABEL[b]}
                  <span className="segn">{b === "" ? (s?.projects ?? 0) : (s?.buckets?.[b] ?? 0)}</span>
                </button>
              ))}
            </div>
            <div className="sp" />
            <FilterPanel groups={groups} dateRange={{ key: "date", label: "Milestone date" }}
              value={filter} onApply={setF} count={filterCount} />
            <div className="search" style={{ width: 250 }}>
              <span className="mag"><Search size={14} strokeWidth={2} /></span>
              <input placeholder="OUR#, customer, dealer…" value={q} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          <div className="card-b flush">
            <Async q={rowsQ} what="the pipeline" isEmpty={!rows.length}
              skeleton={<TableSkeleton cols={8} />}
              empty={search || filterCount || bucket
                ? "No projects match those filters."
                : "No pre-install projects."}>
              <div className={"tblwrap" + (rowsQ.refreshing ? " refreshing" : "")}>
                <table>
                  <thead>
                    <tr>
                      <th>OUR#</th><th>Customer</th>
                      {eco === "rep" && <th>Rep</th>}
                      <th>Dealer</th><th>ST</th><th className="r">kW</th>
                      <th className="r">Contract</th>
                      <th>Stage</th><th>Status</th><th>Rate ready</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.our_reference}>
                        <td className="id">
                          <a href="#" onClick={(e) => { e.preventDefault(); setOpen(r); }}>{r.our_reference}</a>
                        </td>
                        <td>
                          {r.customer_name
                            ? <Tip text={r.customer_name}>{trunc(r.customer_name, 20)}</Tip>
                            : <span className="gap">not set</span>}
                        </td>
                        {eco === "rep" && <td><Tip text={r.rep}>{trunc(r.rep, 18)}</Tip></td>}
                        <td><Tip text={r.dealer}>{trunc(r.dealer, 22)}</Tip></td>
                        <td className="mono">{r.state}</td>
                        <td className="r num">
                          {r.system_size_watts > 0 ? (r.system_size_watts / 1000).toFixed(2)
                            : <span className="gap" title="No system size recorded — this blocks pricing">not set</span>}
                        </td>
                        <td className="r num">
                          {r.contract_amount_cents != null ? moneyC(r.contract_amount_cents) : <span className="gap">—</span>}
                        </td>
                        <td>
                          <div style={{ fontWeight: 550 }}>{r.milestone}</div>
                          <div className="submeta">{r.ntp_date || r.sale_date || "no date"}</div>
                          {/* ntp_status is meaningless until NTP has fired. */}
                          {r.milestone !== "Sale" && r.ntp_status &&
                            !/^ntp$|complete|approved|done|✔/i.test(r.ntp_status) &&
                            <div style={{ marginTop: 3 }}>
                              <Tip text={r.ntp_status}><Badge kind="warn">{trunc(r.ntp_status, 22)}</Badge></Tip>
                            </div>}
                        </td>
                        <td>
                          <Badge kind={r.bucket === "jeopardy" ? "warn" : r.bucket === "hold" ? "bad" : "ok"}>
                            <span className="pip" />{r.project_status}
                          </Badge>
                        </td>
                        <td>{rateCell(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager total={total} limit={LIMIT} offset={offset} onOffset={setOffset} busy={rowsQ.refreshing} />
            </Async>
          </div>
        </div>
      </div>

      {open && <ProjectDrawer project={open} onClose={() => setOpen(null)} />}
    </>
  );
}
