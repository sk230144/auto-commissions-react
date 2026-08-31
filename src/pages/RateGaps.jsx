import { useState } from "react";
import { Download } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { csvDownload, num } from "../lib/fmt.js";
import { useApi } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { Async, TableSkeleton, SortTh, Badge } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";
import ProjectDrawer from "../components/ProjectDrawer.jsx";
import { useSortState, sortRows } from "../lib/sort.js";

/**
 * Rate Gaps — every dealer × financier × sale-type × state combination with
 * recent projects but NO pay-schedule row in force, i.e. deals that will hit
 * install and immediately jam in Pending as "needs rate".
 *
 * One combo is one row, because one rate-card row fixes every project under
 * it — the fix count is the row count, not the project count.
 */
export default function RateGaps() {
  const { say } = useStore();
  const [open, setOpen] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());

  const q = useApi((signal) => api.rateGaps({ signal }), []);
  const d = q.data;
  // The whole payload arrives in one response, so this sort is complete.
  const [sort, onSort] = useSortState();
  const gaps = sortRows(d?.gaps || [], sort);

  const affected = (d?.gaps || []).reduce((s, g) => s + (g.projects || 0), 0);
  const rowKey = (g) => [g.dealer, g.financier, g.sale_type, g.state].join("|");
  const toggle = (k) => setExpanded((s) => {
    const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n;
  });

  function exportCsv() {
    const header = ["Dealer", "Financier", "Sale type", "ST", "Projects", "OUR#s"];
    const body = gaps.map((g) => [g.dealer, g.financier, g.sale_type, g.state,
      g.projects, (g.ours || []).join(" ")]);
    csvDownload("rate gaps", header, body) ? say("Exported") : say("Nothing to export", true);
  }

  return (
    <>
      <PageHead eyebrow="Operations" title="Rate Gaps"
        count={q.loading ? "loading…" : q.error ? "—"
          : `${gaps.length} gap${gaps.length === 1 ? "" : "s"} · ${num(affected)} projects affected`}>
        <button className="btn" onClick={exportCsv} disabled={!gaps.length}>
          <Download size={14} strokeWidth={2} />Export CSV
        </button>
      </PageHead>

      <div className="pagebody">
        <div className="sub">
          Combinations with recent sales but <b>no pay-schedule row in force</b> — these deals will
          reach install and jam in Pending Approval as "needs rate". One rate-card row fixes every
          project under its combo, so the work here is {q.loading ? "…" : gaps.length} rows, not{" "}
          {q.loading ? "…" : num(affected)} projects.
          {d && <> Checked <b>{num(d.checked ?? 0)}</b> projects
            {d.window_days ? <> from the last <b>{d.window_days}</b> days</> : null}
            {d.cutoff ? <> (since {d.cutoff})</> : null}.</>}
          {d?.truncated && <b style={{ color: "var(--pend)" }}> The list was truncated — fix these and re-check for more.</b>}
        </div>

        <div className="card">
          <div className="card-h"><h2>Missing combinations</h2></div>
          <div className="card-b flush">
            <Async q={q} what="rate gaps" isEmpty={!gaps.length}
              skeleton={<TableSkeleton cols={6} />}
              empty="No gaps — every recent combination has a rate card in force.">
              <div className="tblwrap">
                <table>
                  <thead>
                    <tr>
                      <SortTh k="dealer" sort={sort} onSort={onSort}>Dealer</SortTh>
                      <SortTh k="financier" sort={sort} onSort={onSort}>Financier</SortTh>
                      <SortTh k="sale_type" sort={sort} onSort={onSort}>Sale type</SortTh>
                      <SortTh k="state" sort={sort} onSort={onSort}>ST</SortTh>
                      <SortTh k="projects" sort={sort} onSort={onSort} className="r">Projects</SortTh>
                      <th>OUR#s</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gaps.map((g) => {
                      const k = rowKey(g);
                      const ours = g.ours || [];
                      const isOpen = expanded.has(k);
                      const shown = isOpen ? ours : ours.slice(0, 3);
                      return (
                        <tr key={k}>
                          <td><b>{g.dealer}</b></td>
                          <td>{g.financier || <span className="gap">—</span>}</td>
                          <td>{g.sale_type || <span className="gap">—</span>}</td>
                          <td className="mono">{g.state || <span className="gap">—</span>}</td>
                          <td className="r num">
                            <Badge kind={g.projects >= 10 ? "bad" : "warn"}>{g.projects}</Badge>
                          </td>
                          <td>
                            <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>
                              {shown.map((our) => (
                                <a key={our} href="#" className="mono" style={{ fontSize: 12 }}
                                  onClick={(e) => { e.preventDefault(); setOpen(our); }}>{our}</a>
                              ))}
                              {ours.length > 3 && (
                                <button className="btn sm gho" onClick={() => toggle(k)}>
                                  {isOpen ? "show fewer" : `+${ours.length - 3} more`}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Async>
          </div>
        </div>
      </div>

      {open && <ProjectDrawer our={open} onClose={() => setOpen(null)} />}
    </>
  );
}
