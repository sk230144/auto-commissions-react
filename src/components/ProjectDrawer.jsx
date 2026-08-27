import { useRef } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { moneyC, trunc } from "../lib/fmt.js";
import { useApi } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { Badge, Async, TableSkeleton, ErrorState } from "./ui.jsx";

const dayAge = (d) => Math.max(0, Math.round(
  (Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(d)) / 86400000));

/**
 * The project drawer every OUR# link opens — one endpoint, one component, the
 * same panel on every screen. It takes only the reference and fetches the rest,
 * so no caller has to pre-join anything.
 *
 * An unknown OUR# is not an error: the server returns header:null with the
 * money arrays still populated, so the drawer renders what it has and says the
 * tape has no record, rather than showing a failure.
 */
export default function ProjectDrawer({ our, onClose }) {
  const scrollRef = useRef(null);
  const q = useApi((signal) => api.projectDetail(our, { signal }), [our]);

  const d = q.data;
  const h = d?.header;
  const kw = h?.system_size_watts > 0 ? h.system_size_watts / 1000 : 0;
  const age = h?.age_from ? dayAge(h.age_from) : null;

  const scrollTimeline = (dir) => scrollRef.current?.scrollBy({ left: dir * 160, behavior: "smooth" });

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-h">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow">Project</div>
            <h3>{our}</h3>
            <div style={{ color: "var(--ink-2)", fontSize: 13, marginTop: 3 }}>
              {q.loading ? <span className="sk" style={{ width: 150 }} /> : h?.customer || ""}
            </div>
          </div>
          <button className="btn gho" onClick={onClose}><X size={16} strokeWidth={2} /></button>
        </div>

        <div className="drawer-b">
          {q.loading && <TableSkeleton rows={5} cols={2} />}
          {q.error && <ErrorState error={q.error} onRetry={q.reload} what="this project" />}

          {d && <>
            {/* Money is recorded here even when the tape has no project row, so
                say that plainly rather than rendering an empty drawer. */}
            {!h && (
              <div className="sub" style={{ color: "var(--pend)" }}>
                The project tape has no record for this reference. Any commission and payment
                rows below are still real.
              </div>
            )}

            {h && (
              <div className="dr-facts">
                <div><div className="k">Dealer</div><div className="v">{h.dealer || <span className="gap">no record</span>}</div></div>
                <div><div className="k">Sales rep</div><div className="v">{h.rep || <span className="gap">no record</span>}</div></div>
                {h.secondary_rep && <div><div className="k">Secondary rep</div><div className="v">{h.secondary_rep}</div></div>}
                {h.setter && <div><div className="k">Setter</div><div className="v">{h.setter}</div></div>}
                <div><div className="k">State</div><div className="v">{h.state || "—"}</div></div>
                <div>
                  <div className="k">System size</div>
                  <div className="v">
                    {kw > 0 ? `${kw.toFixed(2)} kW`
                      : h.battery_only ? <Badge kind="blue">battery only</Badge>
                      : <span className="gap">not set</span>}
                  </div>
                </div>
                <div><div className="k">Status</div><div className="v">{h.status || "—"}</div></div>
                <div>
                  <div className="k">Contract</div>
                  <div className="v">{h.contract_amount_cents != null
                    ? moneyC(h.contract_amount_cents) : <span className="gap">not set</span>}</div>
                </div>
                <div><div className="k">Sale</div><div className="v">{h.sale_date || "—"}</div></div>
                <div>
                  <div className="k">NTP</div>
                  <div className="v">
                    {h.ntp_date || "—"}
                    {h.ntp_status && <div style={{ marginTop: 3 }}>
                      <Badge kind={h.ntp_date ? "ok" : "warn"}>{h.ntp_status}</Badge>
                    </div>}
                  </div>
                </div>
                <div><div className="k">Install</div><div className="v">{h.install_date || "—"}</div></div>
                {h.jeopardy_date && <div>
                  <div className="k">Jeopardy</div>
                  <div className="v"><Badge kind="bad">{h.jeopardy_date}</Badge></div>
                </div>}
              </div>
            )}

            {d.flow?.length > 0 && <>
              <div className="sect" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <span>Project timeline</span>
                <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 700, color: "var(--ink-2)", fontSize: 12.5 }}>
                  {age != null ? `Project age: ${age} day${age === 1 ? "" : "s"}` : ""}
                </span>
              </div>
              <div className="timeline-wrap">
                <button className="tl-arrow" onClick={() => scrollTimeline(-1)} aria-label="Scroll earlier stages">
                  <ChevronLeft size={16} />
                </button>
                <div className="timeline-strip" ref={scrollRef}>
                  {d.flow.map((s, i) => (
                    <div className="tl-stage" key={s.stage}>
                      <div className="tl-name">{s.stage}</div>
                      <div className={"tl-chip" + (s.date ? " done" : "")}>{s.date || "No Data"}</div>
                      {i < d.flow.length - 1 && <div className="tl-line" />}
                    </div>
                  ))}
                </div>
                <button className="tl-arrow" onClick={() => scrollTimeline(1)} aria-label="Scroll later stages">
                  <ChevronRight size={16} />
                </button>
              </div>
            </>}

            <div className="sect">Commission breakdown</div>
            {d.commissions?.length ? (
              <div className="tblwrap">
                <table>
                  <thead><tr><th>Party</th><th>Kind</th><th>Milestone</th><th className="r">Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {d.commissions.map((l, i) => (
                      <tr key={`${l.party}|${l.kind}|${i}`}>
                        <td title={l.party}>
                          {trunc(l.party, 22)}
                          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{l.party_type}</div>
                        </td>
                        <td>{l.kind}<div className="submeta">{l.basis}</div></td>
                        <td>{l.trigger}<div className="submeta">{l.trigger_date || "—"}</div></td>
                        <td className="r num">{moneyC(l.amount_cents)}</td>
                        <td>
                          {l.needs_rate
                            ? <Badge kind="bad"><span className="pip" />needs rate</Badge>
                            : <Badge kind="mut">{l.status}</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="card" style={{ margin: 0, padding: "14px 18px", background: "var(--panel-2)" }}>
                <div style={{ color: "var(--ink-3)", fontSize: 13 }}>
                  {h && !h.install_date
                    ? "Sale recorded — no pay trigger until NTP/Install."
                    : "No commission lines recorded for this project yet."}
                </div>
              </div>
            )}

            <div className="sect">Payments</div>
            {d.payments?.length ? (
              <div className="tblwrap">
                <table>
                  <thead><tr><th>Date paid</th><th>Party</th><th>Kind</th><th className="r">Amount</th><th>Method</th></tr></thead>
                  <tbody>
                    {d.payments.map((p, i) => (
                      <tr key={`${p.party}|${p.date}|${i}`}>
                        <td>{p.date || <span className="gap">—</span>}</td>
                        <td title={p.party}>{trunc(p.party, 20)}</td>
                        <td>{p.kind}</td>
                        <td className="r num">{moneyC(p.amount_cents)}</td>
                        {/* An empty method often means the wording is in notes. */}
                        <td>{p.method || p.txn || (p.notes
                          ? <span style={{ color: "var(--ink-3)" }}>{trunc(p.notes, 24)}</span>
                          : <span className="gap">—</span>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="stub">
                No payments recorded yet — draw, install &amp; PTO payments appear here with the
                date each was paid.
              </div>
            )}

            <div className="sect">Who paid for the adders</div>
            {d.adders?.length ? (
              <>
                <div className="tblwrap">
                  <table>
                    <thead><tr><th>Adder</th><th>Type</th><th className="r">Price</th><th>Partner</th></tr></thead>
                    <tbody>
                      {d.adders.map((a, i) => (
                        <tr key={`${a.name}|${i}`}>
                          <td>{a.name}</td>
                          <td>{a.price_type || "—"}</td>
                          <td className="r num">{moneyC(a.effective_cents)}</td>
                          <td>
                            {a.partner_name || a.partner || <span className="gap">—</span>}
                            {a.partner_effective_cents != null &&
                              <div className="submeta">{moneyC(a.partner_effective_cents)}</div>}
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={2}><b>Total</b></td>
                        <td className="r num"><b>{moneyC(d.adders_total_cents)}</b></td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
                {d.adder_split && (
                  <div className="calc-tbl" style={{ marginTop: 12 }}>
                    <table style={{ width: "100%" }}>
                      <tbody>
                        <tr>
                          <td>Charged to the partner</td>
                          <td className="r num">{moneyC(d.adder_split.sow_cents)}</td>
                        </tr>
                        <tr>
                          {/* OWE-funded adders are never deducted from commission. */}
                          <td>Covered by OWE</td>
                          <td className="r num">{moneyC(d.adder_split.owe_funded_cents)}</td>
                        </tr>
                      </tbody>
                    </table>
                    {d.adder_split.reason && <div className="submeta" style={{ marginTop: 6 }}>{d.adder_split.reason}</div>}
                  </div>
                )}
              </>
            ) : (
              <div className="stub">No adders recorded on this project.</div>
            )}
          </>}
        </div>
      </div>
    </>
  );
}
