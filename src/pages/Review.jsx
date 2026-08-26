import { useState } from "react";
import { Download } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { money, csvDownload } from "../lib/fmt.js";
import { Badge, Empty, Ask } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";

/** The reconciliation queue. The engine seeds items it is HOLDING on, so a list of
 *  reasons is a worklist — a list of projects would only be a mystery. */
const KIND_TITLE = {
  "money-review": "Money already out or frozen",
  "rate-gap": "Can't price — rate or mapping missing",
  leiby: "Rep inactive at install (Leiby)",
  "missing-settings": "Missing rep rates",
  "data-quality": "Source data missing",
  "orphan-payment": "Payments with no ledger line",
  "roster-mismatch": "Rep-pay roster vs rate card",
  question: "Policy question",
};
const ORDER = ["money-review", "rate-gap", "leiby", "missing-settings", "data-quality", "orphan-payment", "roster-mismatch", "question"];

export default function Review() {
  const { review, dispatch, say } = useStore();
  const [ask, setAsk] = useState(null);

  const open = review.filter((r) => r.status === "open");
  const done = review.filter((r) => r.status === "resolved");
  const atStake = open.reduce((s, i) => s + Math.abs(Number(i.amount) || 0), 0);

  const kinds = [...new Set(open.map((r) => r.kind))]
    .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));

  function exportCsv() {
    const header = ["Kind", "Item", "OUR#", "Party", "Dealer", "ST", "Amount"];
    const body = open.map((r) => [r.kind, r.title, r.our || "", r.party || "", r.dealer || "", r.state || "", r.amount ?? ""]);
    csvDownload("open items", header, body) ? say("Exported") : say("Nothing to export", true);
  }

  return (
    <>
      <PageHead title="Open Items" count={`${open.length} open · ${money(atStake)} at stake`}>
        <button className="btn" onClick={exportCsv}><Download size={14} strokeWidth={2} />Export CSV</button>
      </PageHead>

      <div className="pagebody">
      <div className="sub">
        What the engine is holding on, and why. Each group is different work for a
        different person — a price, a performer, a measurement — so they are not collapsed
        into one list.
      </div>

      {open.length === 0 && <div className="card"><Empty>Nothing open. Every item has been ruled on.</Empty></div>}

      {kinds.map((k) => (
        <div className="card" key={k}>
          <div className="card-h"><h2>{KIND_TITLE[k] || k}</h2></div>
          <div className="card-b">
          <div className="tblwrap">
            <table>
              <thead><tr><th>Item</th><th>OUR#</th><th>Party</th><th>ST</th><th className="r">Amount</th><th /></tr></thead>
              <tbody>
                {open.filter((r) => r.kind === k).map((r) => (
                  <tr key={r.id}>
                    <td>{r.title}</td>
                    <td>{r.our || "—"}</td>
                    <td>{r.party || "—"}</td>
                    <td>{r.state || "—"}</td>
                    <td className="r num">{r.amount == null ? "—" : money(r.amount)}</td>
                    <td className="r">
                      <button className="btn sm pri" onClick={() => setAsk({
                        title: "Resolve this item",
                        why: r.title,
                        label: "Ruling",
                        onOk: (v) => { dispatch({ type: "review-resolve", id: r.id, resolution: v }); setAsk(null); say("Resolved"); },
                      })}>Resolve</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      ))}

      {done.length > 0 && (
        <div className="card">
          <div className="card-h"><h2>Resolved</h2></div>
          <div className="card-b">
          <div className="tblwrap">
            <table>
              <thead><tr><th>Type</th><th>Item</th><th>Ruling</th><th>By</th><th /></tr></thead>
              <tbody>
                {done.map((r) => (
                  <tr key={r.id}>
                    <td><Badge kind="mut">{r.kind}</Badge></td>
                    <td>{r.title}</td>
                    <td style={{ color: "var(--ink-3)" }}>{r.resolution}</td>
                    <td style={{ fontSize: 11.5 }}>{r.resolved_by?.split("@")[0] || "—"}</td>
                    <td className="r">
                      <button className="btn sm" onClick={() => { dispatch({ type: "review-reopen", id: r.id }); say("Reopened"); }}>reopen</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      )}

      {ask && <Ask {...ask} onCancel={() => setAsk(null)} okLabel="Resolve" />}
      </div>
    </>
  );
}
