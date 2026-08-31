import { useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "../lib/store.jsx";
import { moneyC, csvDownload, num } from "../lib/fmt.js";
import { useApi } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { Async, TableSkeleton, Pager, Badge, SortTh } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";
import ProjectDrawer from "../components/ProjectDrawer.jsx";
import { useSortState } from "../lib/sort.js";

const LIMIT = 25;

const TAB_LOOK = {
  payment_records: ["ok", "paid"],
  on_hold: ["bad", "on hold"],
  ready_to_pay: ["blue", "ready"],
  pending_approval: ["mut", "pending"],
};

/**
 * One party's ledger lines — the drill-down from Pay Statements.
 *
 * A page rather than an inline expander: these lists run to hundreds of rows
 * (DRIVIN alone has 176), which is far too much to unfold underneath a table
 * you are still trying to read, and a real URL means a party's statement can
 * be linked to and reloaded.
 */
export default function StatementDetail() {
  const { party: raw } = useParams();
  const party = decodeURIComponent(raw || "");
  const nav = useNavigate();
  const { eco, say } = useStore();
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(null);
  const [sort, onSortRaw] = useSortState();
  const onSort = (k) => { onSortRaw(k); setOffset(0); };

  // Shared filter. `tab` is deliberately NOT in here: /payments/summary rejects
  // it as an unknown field (400), while /payments/lines needs it to mean
  // "every queue". Only the lines call adds it.
  const req = {
    party_type: eco, filter: { dealers: [party] },
    show_zeros: true, show_all_dates: true,
  };

  const linesQ = useApi(
    (signal) => api.paymentLines(
      { ...req, tab: "", sort_by: sort?.k, sort_dir: sort?.dir, limit: LIMIT, offset }, { signal }),
    [eco, party, offset, JSON.stringify(sort)]
  );

  // The money split across queues, for the header. Row count comes from the
  // lines call's own `total`.
  const sumQ = useApi((signal) => api.paymentSummary(req, { signal }), [eco, party]);
  const tabs = sumQ.data?.tabs;
  const earned = tabs ? Object.values(tabs).reduce((s, t) => s + (t.total_cents || 0), 0) : 0;

  const rows = linesQ.data?.payments || [];
  const total = linesQ.data?.total ?? 0;

  function exportCsv() {
    const header = ["OUR#", "Kind", "Milestone", "Date", "Amount", "Settled", "Balance", "Status"];
    const body = rows.map((l) => [l.our_reference, l.kind, l.trigger, l.trigger_date || "",
      (l.amount_cents / 100).toFixed(2), (l.settled_cents / 100).toFixed(2),
      (l.balance_cents / 100).toFixed(2), l.tab]);
    csvDownload(`${party} lines`, header, body)
      ? say(`Exported ${rows.length} rows (this page)`)
      : say("Nothing to export", true);
  }

  const countLine = linesQ.loading || sumQ.loading ? "loading…"
    : linesQ.error ? "—"
    : `${num(total)} line${total === 1 ? "" : "s"}`
      + (sumQ.error ? "" : ` · ${moneyC(earned)} outstanding`);

  return (
    <>
      <PageHead eyebrow={eco === "rep" ? "Sales Rep Pay · Statement" : "Dealer Pay · Statement"}
        title={party} count={countLine}>
        <button className="btn" onClick={() => nav("/stmt")}>
          <ArrowLeft size={14} strokeWidth={2} />Back to statements
        </button>
        <button className="btn" onClick={exportCsv} disabled={!rows.length}>
          <Download size={14} strokeWidth={2} />Export CSV
        </button>
      </PageHead>

      <div className="pagebody">
        <div className="sub">
          Every ledger line for this {eco === "rep" ? "rep" : "dealer"}, across all four queues.
          The outstanding figure is what is still owed — amount minus what has been settled.
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Ledger lines</h2>
            <div className="sp" />
          </div>
          <div className="card-b flush">
            <Async q={linesQ} what={`lines for ${party}`} isEmpty={!rows.length}
              skeleton={<TableSkeleton cols={8} />}
              empty="No lines recorded for this party.">
              <div className={"tblwrap" + (linesQ.refreshing ? " refreshing" : "")}>
                <table>
                  <thead>
                    <tr>
                      <SortTh k="our_reference" sort={sort} onSort={onSort}>OUR#</SortTh>
                      <SortTh k="kind" sort={sort} onSort={onSort}>Kind</SortTh>
                      <th>Milestone</th>
                      <SortTh k="trigger_date" sort={sort} onSort={onSort}>Date</SortTh>
                      <SortTh k="amount" sort={sort} onSort={onSort} className="r">Amount</SortTh>
                      <SortTh k="settled" sort={sort} onSort={onSort} className="r">Settled</SortTh>
                      <SortTh k="balance" sort={sort} onSort={onSort} className="r">Balance</SortTh>
                      <SortTh k="tab" sort={sort} onSort={onSort}>Status</SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((l) => {
                      const [kind, label] = TAB_LOOK[l.tab] || ["mut", l.tab?.replace(/_/g, " ")];
                      return (
                        <tr key={l.line_key}>
                          <td className="id">
                            <a href="#" onClick={(e) => { e.preventDefault(); setOpen(l.our_reference); }}>{l.our_reference}</a>
                          </td>
                          <td>{l.kind}</td>
                          <td>{l.trigger}</td>
                          <td>{l.trigger_date || <span className="gap">—</span>}</td>
                          <td className="r num">{moneyC(l.amount_cents)}</td>
                          <td className="r num">{moneyC(l.settled_cents)}</td>
                          <td className="r num" style={{ fontWeight: 550 }}>{moneyC(l.balance_cents)}</td>
                          <td><Badge kind={kind}>{label}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager total={total} limit={LIMIT} offset={offset} onOffset={setOffset} busy={linesQ.refreshing} />
            </Async>
          </div>
        </div>
      </div>

      {open && <ProjectDrawer our={open} onClose={() => setOpen(null)} />}
    </>
  );
}
