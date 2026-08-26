/**
 * Payout Logic — a static reference. Two tables: what pays at each milestone, and
 * where each input comes from. This is the page people read to understand the money.
 */
import { PageHead } from "../App.jsx";

export default function Logic() {
  return (
    <>
      <PageHead title="Payout Logic">
        
      </PageHead>

      <div className="pagebody">
      <div className="sub">
        How a sale becomes a payment. Every figure is computed once, server-side, and
        stored — the screens display it, they never re-derive it.
      </div>

      <div className="card">
          <div className="card-h"><h2>What pays, and when</h2></div>
          <div className="card-b">
        <div className="tblwrap">
          <table>
            <thead><tr><th>Milestone</th><th>Dealer line</th><th>Sales-rep line</th><th>Amount basis</th></tr></thead>
            <tbody>
              <tr>
                <td><b>Sale</b></td><td>$0 — recorded</td><td>$0 — recorded</td>
                <td>No pay trigger until NTP</td>
              </tr>
              <tr>
                <td><b>NTP</b></td><td>Draw</td><td>Draw</td>
                <td>pot × draw%, capped at draw max. A flat M1 on the rep's own row wins over the percentage.</td>
              </tr>
              <tr>
                <td><b>Install</b></td><td>Commission</td><td>Commission</td>
                <td>The full amount. Battery-only deals pay on the battery completion date instead.</td>
              </tr>
              <tr>
                <td><b>Jeopardy / Hold</b></td><td>$0 — held</td><td>$0 — held</td>
                <td>Frozen pending a decision</td>
              </tr>
            </tbody>
          </table>
        </div>
        </div>
      </div>

      <div className="card">
          <div className="card-h"><h2>The formulas</h2></div>
          <div className="card-b">
        <pre className="pre">
{`DEALER
  redline = rl × watts                     rl from the Pay Schedule rate card
  pot     = contract − redline − adders × dealer_share
  dealer  = pot − rep share                if the rate card says Rep Pay = YES
          = pot                            otherwise

REP  (a separate rate card — not a share of the pot)
  rep_rl  = base_rl − position_adj / 1000  adjustment is $/kW, redline is $/W
  net_epc = (contract − loan_fee − adders × adder_share) / watts
  margin  = net_epc − rep_rl               then clamped by min/max, floored at $0
  pay     = margin × watts × mult × share  mult 0.8 on the 80/20 scales

OVERRIDE   pay_rate × watts                flat and additive — never chained
SETTER     flat rate per sale              Install only

MILESTONE RELEASE — cumulative, never additive
  M1 pays  min(m1_amount, C)
  M2 pays  (m2_pct × C) − M1
  M3 pays  ((m2_pct + m3_pct) × C) − M2    released PTO + lag days`}
        </pre>
        </div>
      </div>

      <div className="card">
          <div className="card-h"><h2>Where the data comes from</h2></div>
          <div className="card-b">
        <div className="tblwrap">
          <table>
            <thead><tr><th>Data</th><th>Source</th><th>Notes</th></tr></thead>
            <tbody>
              <tr><td>Contract, system size, adders</td><td>Tape / OWEDB</td><td>Live per lookup</td></tr>
              <tr><td>Sale, NTP, install, PTO dates</td><td>Tape / OWEDB</td><td>Install prefers the install workspace over the summary view</td></tr>
              <tr><td>Dealer, rep, setter</td><td>Tape / OWEDB</td><td>Names normalised before matching</td></tr>
              <tr><td>Redline, draw %, Rep Pay flag</td><td>Pay Schedule</td><td>Entered by hand — the commercial terms</td></tr>
              <tr><td>Rep base redline</td><td>Commission Rates</td><td>Keyed on pay scale, not the rep's name</td></tr>
              <tr><td>Position adjustment, clamps</td><td>Rate Adjustments</td><td>Stored in $/kW</td></tr>
              <tr><td>Which scale and position a rep is on</td><td>Rep Pay Settings</td><td>Resolved at the sale date</td></tr>
              <tr><td>Parent override rate</td><td>Dealer Override</td><td>$/W, not a percentage</td></tr>
              <tr><td>Google Sheets / DATA_ENTRY</td><td>— not used —</td><td>Replaced by this system</td></tr>
            </tbody>
          </table>
        </div>
        </div>
      </div>

      <div className="card">
          <div className="card-h"><h2>Rules worth knowing</h2></div>
          <div className="card-b">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.2, lineHeight: 1.75, color: "var(--ink-3)" }}>
          <li>Every rate is <b>date-effective</b>. A job is priced by its <b>sale date</b>, never by today — so re-running last year's payroll reproduces last year's numbers.</li>
          <li>A rate change means <b>end-dating the old row and inserting a new one</b>, never editing in place.</li>
          <li>Milestone targets are <b>cumulative</b>. Treating them as additive overpays — that mistake cost 115% in a sibling system.</li>
          <li>A <b>$0 redline</b> means no redline is subtracted, so the whole contract becomes commission.</li>
          <li>The redline can be <b>negative</b> for some financiers. That is intentional and the sign is preserved.</li>
          <li>Overrides are <b>flat and additive</b> across parents — never compounded down a chain.</li>
          <li>Approval stores a <b>snapshot</b> of the amount. If the figure later changes, the line drops back to Pending.</li>
        </ul>
        </div>
      </div>
      </div>
    </>
  );
}
