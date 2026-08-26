import { useRef } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { moneyC } from "../lib/fmt.js";
import { useApi } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { Badge, Async, TableSkeleton } from "./ui.jsx";

const dayAge = (d) => Math.max(0, Math.round((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(d)) / 86400000));

/** The pre-install stages the tape records. The API's project row does not
 *  carry a timeline, so we render the known stages and mark the two dates it
 *  does give us — an absent date reads as "No Data", never as "not happened". */
const STAGES = ["Site Survey", "CAD Design", "Permitting", "Roofing", "Install", "Inspection", "PTO"];

/**
 * Project drawer — opens from a Pipeline row. Unlike LineDrawer (which explains
 * one ledger line's math), this shows the whole project: identity, the
 * pre-install stage timeline, and every commission line tied to the OUR#.
 *
 * Takes an API project row (/pipeline/projects) as-is and fetches the money
 * itself, so the parent never has to pre-join anything.
 */
export default function ProjectDrawer({ project, onClose }) {
  const scrollRef = useRef(null);
  if (!project) return null;

  const p = project;
  const our = p.our_reference;
  const age = p.sale_date ? dayAge(p.sale_date) : null;
  const preNtp = !p.ntp_date;
  const kw = p.system_size_watts > 0 ? p.system_size_watts / 1000 : 0;

  // Every line on this project, both rails, whatever tab it currently sits in.
  const linesQ = useApi(
    (signal) => api.paymentLines({ search: our, tab: "", show_zeros: true, show_all_dates: true, limit: 100 }, { signal }),
    [our]
  );
  // The search is a broad text match, so keep only true matches on this OUR#.
  const lines = (linesQ.data?.payments || []).filter((l) => l.our_reference === our);
  const paid = lines.filter((l) => l.settled_cents > 0);

  const timeline = STAGES.map((stage) => ({
    stage,
    date: stage === "Install" ? p.install_date || null : null,
  }));

  const scrollTimeline = (dir) => scrollRef.current?.scrollBy({ left: dir * 160, behavior: "smooth" });

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-h">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow">Project</div>
            <h3>{our}</h3>
            <div style={{ color: "var(--ink-2)", fontSize: 13, marginTop: 3 }}>{p.customer_name}</div>
          </div>
          <button className="btn gho" onClick={onClose}><X size={16} strokeWidth={2} /></button>
        </div>
        <div className="drawer-b">

          <div className="dr-facts">
            <div><div className="k">Dealer</div><div className="v">{p.dealer || <span className="gap">no record</span>}</div></div>
            <div><div className="k">Sales rep</div><div className="v">{p.rep || <span className="gap">no record</span>}</div></div>
            <div><div className="k">State</div><div className="v">{p.state || "—"}</div></div>
            <div><div className="k">System size</div><div className="v">{kw > 0 ? `${kw.toFixed(2)} kW` : <span className="gap">not set</span>}</div></div>
            <div><div className="k">Status</div><div className="v">{p.project_status}</div></div>
            <div><div className="k">Contract</div><div className="v">{p.contract_amount_cents != null ? moneyC(p.contract_amount_cents) : <span className="gap">not set</span>}</div></div>
            <div><div className="k">Sale</div><div className="v">{p.sale_date || "—"}</div></div>
            <div>
              <div className="k">NTP</div>
              <div className="v">
                {p.ntp_date || "—"}
                {p.ntp_date && <> · <Badge kind="ok">✓ NTP</Badge></>}
                {/* ntp_status only means something once NTP has actually fired. */}
                {!p.ntp_date && p.ntp_status && <div style={{ marginTop: 3 }}><Badge kind="warn">{p.ntp_status}</Badge></div>}
              </div>
            </div>
            <div><div className="k">Milestone</div><div className="v">{p.milestone || "—"}</div></div>
            <div>
              <div className="k">Rate card</div>
              <div className="v">
                {p.rate_covered ? <Badge kind="ok"><span className="pip" />in force</Badge>
                  : <Badge kind="bad"><span className="pip" />{p.rate_gap || "no rate"}</Badge>}
              </div>
            </div>
          </div>

          <div className="sect" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span>Project timeline</span>
            <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 700, color: "var(--ink-2)", fontSize: 12.5 }}>
              {age != null ? `Project age: ${age} day${age === 1 ? "" : "s"}` : ""}
            </span>
          </div>
          <div className="timeline-wrap">
            <button className="tl-arrow" onClick={() => scrollTimeline(-1)} aria-label="Scroll earlier stages"><ChevronLeft size={16} /></button>
            <div className="timeline-strip" ref={scrollRef}>
              {timeline.map((s, i) => (
                <div className="tl-stage" key={s.stage}>
                  <div className="tl-name">{s.stage}</div>
                  <div className={"tl-chip" + (s.date ? " done" : "")}>{s.date || "No Data"}</div>
                  {i < timeline.length - 1 && <div className="tl-line" />}
                </div>
              ))}
            </div>
            <button className="tl-arrow" onClick={() => scrollTimeline(1)} aria-label="Scroll later stages"><ChevronRight size={16} /></button>
          </div>

          <div className="sect">Commission breakdown</div>
          <Async q={linesQ} what="the commission lines" isEmpty={!lines.length}
            skeleton={<TableSkeleton rows={2} cols={5} />}
            empty={preNtp
              ? "Sale recorded — no pay trigger until NTP/Install."
              : "No commission lines recorded for this project yet."}>
            <div className="tblwrap">
              <table>
                <thead><tr><th>Party</th><th>Kind</th><th>Milestone</th><th className="r">Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.line_key}>
                      <td>{l.party}<div style={{ fontSize: 11, color: "var(--ink-3)" }}>{l.party_type}</div></td>
                      <td>{l.kind}</td>
                      <td>{l.trigger}<div className="submeta">{l.trigger_date || "—"}</div></td>
                      <td className="r num">{moneyC(l.amount_cents)}</td>
                      <td><TabBadge tab={l.tab} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Async>

          <div className="sect">Payments</div>
          {linesQ.loading ? <TableSkeleton rows={2} cols={4} />
            : paid.length === 0 ? (
              <div className="stub">No payments recorded yet — draw, install &amp; PTO payments appear here with the date each was paid.</div>
            ) : (
              <div className="tblwrap">
                <table>
                  <thead><tr><th>Date paid</th><th>Party</th><th>Kind</th><th className="r">Settled</th></tr></thead>
                  <tbody>
                    {paid.map((l) => (
                      <tr key={l.line_key}>
                        <td>{l.settled_on || <span className="gap">—</span>}</td>
                        <td>{l.party}</td><td>{l.kind}</td>
                        <td className="r num">{moneyC(l.settled_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

        </div>
      </div>
    </>
  );
}

const TAB_LOOK = {
  payment_records: ["ok", "paid"],
  on_hold: ["bad", "on hold"],
  ready_to_pay: ["blue", "ready"],
  pending_approval: ["mut", "pending"],
};
function TabBadge({ tab }) {
  const [kind, label] = TAB_LOOK[tab] || ["mut", tab || "—"];
  return <Badge kind={kind}>{label}</Badge>;
}
