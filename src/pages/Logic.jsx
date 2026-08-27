import { moneyC } from "../lib/fmt.js";
import { useApi } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { Async, TableSkeleton } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";

/**
 * Payout Logic — how a sale becomes a payment, served by the engine itself.
 *
 * Every formula, rationale and worked example comes from /payout-logic rather
 * than being written into this page. That matters: a formula transcribed into
 * the client is a second source of truth that silently drifts the next time
 * the engine changes, and this is the page people read to understand the money.
 */
export default function Logic() {
  const q = useApi((signal) => api.payoutLogic({ signal }), []);
  const rules = q.data?.rules || [];

  return (
    <>
      <PageHead eyebrow="Rate cards" title="Payout Logic"
        count={q.loading ? "loading…" : q.error ? "—"
          : `${rules.length} rule${rules.length === 1 ? "" : "s"}`} />

      <div className="pagebody">
        <div className="sub">
          How a sale becomes a payment. Every figure is computed once, server-side, and stored —
          the screens display it, they never re-derive it. These rules come from the engine, so
          what you read here is what actually runs.
        </div>

        <Async q={q} what="the payout logic" isEmpty={!rules.length}
          skeleton={<div className="card"><TableSkeleton rows={6} cols={2} /></div>}
          empty="No rules published.">
          {rules.map((r) => (
            <div className="card" key={r.key}>
              <div className="card-h"><h2>{r.title}</h2></div>
              <div className="card-b">
                {/* The formula is code, so it is set in mono and allowed to wrap
                    rather than being clipped — these lines are long. */}
                <div className="pre" style={{ marginBottom: 12, whiteSpace: "pre-wrap" }}>{r.formula}</div>

                {r.rationale && (
                  <div className="sub" style={{ margin: 0, maxWidth: "84ch" }}>{r.rationale}</div>
                )}

                {r.example?.length > 0 && (
                  <>
                    <div className="sect">Worked example</div>
                    <div className="tblwrap">
                      <table className="calc-tbl" style={{ width: "100%" }}>
                        <tbody>
                          {r.example.map((e, i) => {
                            // The engine emits the total as the last row; a
                            // negative amount is a subtraction from the spread.
                            const last = i === r.example.length - 1;
                            const neg = e.amount_cents < 0;
                            return (
                              <tr key={`${r.key}-${i}`} className={last ? "tot" : neg ? "neg" : undefined}>
                                <td>
                                  {e.label}
                                  {e.note && <div className="submeta">{e.note}</div>}
                                </td>
                                <td className="r">
                                  {e.amount_cents == null ? <span className="gap">—</span> : moneyC(e.amount_cents)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </Async>
      </div>
    </>
  );
}
