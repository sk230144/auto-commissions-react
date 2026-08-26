import { moneyC, trunc } from "../lib/fmt.js";
import { useApi } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { Badge, Async, TableSkeleton } from "./ui.jsx";

const TAB_LOOK = {
  payment_records: ["ok", "paid"],
  on_hold: ["bad", "on hold"],
  ready_to_pay: ["blue", "ready to pay"],
  pending_approval: ["mut", "pending approval"],
};

/**
 * One ledger line, and where it sits. The API exposes the stored figures but
 * not the derivation behind them, so this states what is known — amount,
 * settled, balance, basis, trigger, approval — and says plainly that the
 * step-by-step math is not available, rather than recomputing it client-side
 * and risking a number that disagrees with what will actually be paid.
 */
export default function LineDrawer({ line, onClose }) {
  if (!line) return null;
  const our = line.our_reference;

  // Sibling lines on the same project — the other people paid on this deal.
  const peersQ = useApi(
    (signal) => api.paymentLines({ search: our, tab: "", show_zeros: true, show_all_dates: true, limit: 100 }, { signal }),
    [our]
  );
  const peers = (peersQ.data?.payments || [])
    .filter((l) => l.our_reference === our && l.line_key !== line.line_key);

  const [kind, label] = TAB_LOOK[line.tab] || ["mut", line.tab || "—"];

  const statusPill = () => {
    if (line.needs_rate) return <Badge kind="bad"><span className="pip" />needs rate</Badge>;
    if (line.denied) return <Badge kind="bad"><span className="pip" />denied</Badge>;
    if (line.changed) return <Badge kind="warn"><span className="pip" />changed after approval</Badge>;
    return <Badge kind={kind}><span className="pip" />{label}</Badge>;
  };

  const facts = [
    ["Payee", line.party],
    ["Payee type", line.party_type],
    ["Dealer", line.dealer],
    ["Homeowner", line.home_owner],
    ["State", line.state],
    ["Kind", line.kind],
    ["Basis", line.basis],
    ["Milestone", line.trigger ? `${line.trigger}${line.trigger_date ? " · " + line.trigger_date : ""}` : ""],
    ["Sale date", line.sale_date],
    ["Settled on", line.settled_on],
  ];

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-h">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow">Ledger line</div>
            <h3>{our}</h3>
            <div style={{ color: "var(--ink-2)", fontSize: 13, marginTop: 3 }}>{line.party}</div>
          </div>
          <button className="btn gho" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-b">

          <div className="row" style={{ marginBottom: 14, gap: 8 }}>
            {statusPill()}
            {line.approved && <Badge kind="ok">approved{line.approved_by ? ` · ${line.approved_by.split("@")[0]}` : ""}</Badge>}
          </div>

          {line.deny_reason && (
            <div className="errstate" style={{ textAlign: "left", padding: "12px 14px", background: "var(--held-bg)", borderRadius: 10, marginBottom: 16 }}>
              <div className="errstate-h" style={{ marginBottom: 3 }}>Held</div>
              <div className="errstate-m" style={{ margin: 0 }}>{line.deny_reason}</div>
            </div>
          )}

          <div className="sect">The money</div>
          <div className="tblwrap" style={{ marginBottom: 4 }}>
            <table className="calc-tbl">
              <tbody>
                <tr>
                  <td>Amount earned</td>
                  <td className="r num" style={{ fontWeight: 600 }}>{moneyC(line.amount_cents)}</td>
                </tr>
                <tr>
                  <td>Settled so far</td>
                  <td className="r num">− {moneyC(line.settled_cents)}</td>
                </tr>
                <tr style={{ borderTop: "2px solid var(--line-2)" }}>
                  <td style={{ fontWeight: 600 }}>Balance owing</td>
                  <td className="r num" style={{ fontWeight: 700 }}>{moneyC(line.balance_cents)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="submeta" style={{ marginBottom: 18 }}>
            The step-by-step derivation (redline, pot, adder shares) is computed server-side and
            is not exposed by this API — these are the stored figures the pay run will use.
            {line.expected_pay && <> Expected to pay <b>{line.expected_pay}</b>.</>}
          </div>

          <div className="sect">Line facts</div>
          <div className="dr-facts">
            {facts.filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><div className="k">{k}</div><div className="v">{v}</div></div>
            ))}
          </div>
          <div className="submeta" style={{ margin: "8px 0 18px" }}>
            <span className="mono">{line.line_key}</span>
          </div>

          <div className="sect">Others paid on this project</div>
          <Async q={peersQ} what="the other lines" isEmpty={!peers.length}
            skeleton={<TableSkeleton rows={2} cols={4} />}
            empty="This is the only line on this project.">
            <div className="tblwrap">
              <table>
                <thead><tr><th>Payee</th><th>Kind</th><th className="r">Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {peers.map((l) => {
                    const [k2, l2] = TAB_LOOK[l.tab] || ["mut", l.tab];
                    return (
                      <tr key={l.line_key}>
                        <td title={l.party}>{trunc(l.party, 22)}
                          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{l.party_type}</div></td>
                        <td>{l.kind}</td>
                        <td className="r num">{moneyC(l.amount_cents)}</td>
                        <td><Badge kind={k2}>{l2}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Async>

        </div>
      </div>
    </>
  );
}
