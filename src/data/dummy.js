/**
 * DUMMY DATA — shaped to match what apps/auto-commissions actually produces.
 *
 * Swap this file for API calls later; every page reads from here and nothing else.
 * The shapes below mirror the real `due_ledger` row plus the derived fields the
 * Worker's /api/lines adds (balance, releasable, readyBal, scheduled, cls).
 */

// ── Line classes, in the cascade order the Worker evaluates them ──────────────
//   onhold → notdue → pending → ready → scheduled → paid
export const CLS = ["pending", "ready", "scheduled", "paid", "onhold", "notdue"];

export const TAB_HINT = {
  pending: "Post-7/1 pay-milestone events — installs (commission), NTP draws, sale/jeopardy/hold — awaiting approval. Lines flagged 'changed' dropped back here because the data shifted after approval.",
  ready: "Approved & snapshot-matched — record a settlement (append-only).",
  paid: "Fully settled lines. Settlements are append-only; a clawback is a new negative row, never an edit.",
  onhold: "Held out with a recorded reason — reversible.",
};

const money = (n) => Math.round(n * 100) / 100;

/** Build one ledger line with the derived fields /api/lines would add. */
function mkLine(o) {
  const amount = money(o.amount || 0);
  const settled = money(o.settled || 0);
  const balance = money(amount - settled);
  const norate = o.status === "NO-SETTINGS";
  const rel = o.releasable == null ? null : money(o.releasable);
  const readyBal = rel == null ? balance : money(Math.min(amount, rel) - settled);
  const scheduled = rel == null ? 0 : money(amount - Math.min(amount, rel));
  let cls;
  if (o.denied) cls = "onhold";
  else if (o.status !== "DUE" && !norate) cls = "notdue";
  else if (!o.approved || o.changed || norate) cls = "pending";
  else if (Math.abs(readyBal) > 0.005) cls = "ready";
  else if (scheduled > 0.005) cls = "scheduled";
  else cls = "paid";
  return { ...o, amount, settled, balance, readyBal, scheduled, norate, cls };
}

// ── due_ledger ────────────────────────────────────────────────────────────────
export const LINES = [
  mkLine({
    line_key: "OUR106312|dealer|Unity Home Improvements",
    our: "OUR106312", home_owner: "", dealer: "Unity Home Improvements",
    party_type: "dealer", party: "Unity Home Improvements",
    kind: "commission", amount: 2794.5, basis: "install-commission",
    trigger: "Install", trigger_date: "2026-07-25", status: "DUE",
    state: "AZ", sale_date: "2026-06-20", approved: false, changed: false, denied: false,
    calc: {
      contract: 36934.1, watts: 9315, rl: 1.8, redline: 16767, adders: 10000,
      adder_share: 1, pot: 10167.1, financier: "LightReach",
      sale_type: "LEASE: Battery (DC)", milestone: "Install",
      result: "commission", rep_share: 7372.6, amount: 2794.5,
      formula: "dealer = pot − rep share",
    },
  }),
  mkLine({
    line_key: "OUR106312|rep|Adan Frisby",
    our: "OUR106312", home_owner: "", dealer: "Unity Home Improvements",
    party_type: "rep", party: "Adan Frisby",
    kind: "commission", amount: 7372.6, settled: 2000, basis: "rep-epc",
    trigger: "Install", trigger_date: "2026-07-25", status: "DUE",
    state: "AZ", sale_date: "2026-06-20", approved: true, changed: false, denied: false,
    calc: {
      rep: "Adan Frisby", n_reps: 1, pay_scale: "REP-EPC", position: "ADJ+600",
      result: "rep-pay", base_rl: 2.7, pos_adj: 600, rep_rl: 2.1, loan_fee: 0,
      net_epc: 2.8915, margin: 0.7915, mult: 1, share: 1, amount: 7372.6,
      formula: "RepPay = (NetEPC − RepRL) × W × share",
    },
  }),
  mkLine({
    line_key: "OUR104474|dealer|A.O Enterprise LLC",
    our: "OUR104474", home_owner: "", dealer: "A.O Enterprise LLC",
    party_type: "dealer", party: "A.O Enterprise LLC",
    kind: "commission", amount: 9857.8, settled: 9857.8, basis: "install-commission",
    trigger: "Install", trigger_date: "2026-07-20", status: "DUE",
    state: "TX", sale_date: "2026-04-24", approved: true, changed: false, denied: false,
    calc: {
      contract: 38379.8, watts: 7380, rl: 1.9, redline: 14022, adders: 14500,
      adder_share: 1, pot: 9857.8, financier: "LightReach",
      sale_type: "LEASE: Battery (DC)", milestone: "Install",
      result: "commission", amount: 9857.8, formula: "pot = contract − RL·W − adders",
    },
  }),
  mkLine({
    line_key: "OUR104474|override|Alpha Electric",
    our: "OUR104474", home_owner: "", dealer: "A.O Enterprise LLC",
    party_type: "override", party: "Alpha Electric",
    kind: "dlr-ovrd", amount: 442.8, settled: 442.8, basis: "dealer-override",
    trigger: "Install", trigger_date: "2026-07-20", status: "DUE",
    state: "TX", sale_date: "2026-04-24", approved: true, changed: false, denied: false,
    calc: {
      result: "override", milestone: "Install", sub_dealer: "A.O Enterprise LLC",
      pay_rate: 0.06, watts: 7380, rate_row: "0.06/W from 2026-01-01",
      amount: 442.8, formula: "override = $/W × W",
    },
  }),
  mkLine({
    line_key: "OUR105880|dealer|Sunforce Solar",
    our: "OUR105880", home_owner: "", dealer: "Sunforce Solar",
    party_type: "dealer", party: "Sunforce Solar",
    kind: "commission", amount: 0, basis: "install (no rate card match)",
    trigger: "Install", trigger_date: "2026-07-28", status: "NO-SETTINGS",
    state: "NV", sale_date: "2026-05-11", approved: false, changed: false, denied: false,
    calc: {
      contract: 41200, watts: 8800, rl: null, redline: null, adders: 3200,
      adder_share: 1, pot: null, financier: "Sunnova", sale_type: "LOAN",
      milestone: "Install", result: "no-rate",
      note: "No matching rate card (dealer × financier × state × sale-type × date)",
    },
  }),
  mkLine({
    line_key: "OUR105114|dealer|Honey Bee Solar",
    our: "OUR105114", home_owner: "", dealer: "Honey Bee Solar",
    party_type: "dealer", party: "Honey Bee Solar",
    kind: "draw", amount: 1840.25, basis: "ntp-draw",
    trigger: "NTP", trigger_date: "2026-07-14", status: "DUE",
    state: "AZ", sale_date: "2026-07-02", approved: true, changed: true, denied: false,
    calc: {
      contract: 29500, watts: 7200, rl: 1.65, redline: 11880, adders: 5000,
      adder_share: 1, pot: 12620, financier: "LightReach", sale_type: "LEASE: Solar Only (DC)",
      milestone: "NTP", result: "draw", draw_pct: 0.2, draw_max: 2500,
      amount: 1840.25, formula: "draw = min(pot × draw%, draw max)",
    },
  }),
  mkLine({
    line_key: "OUR103236|dealer|Y.E.G Solar Solutions LLC",
    our: "OUR103236", home_owner: "", dealer: "Y.E.G Solar Solutions LLC",
    party_type: "dealer", party: "Y.E.G Solar Solutions LLC",
    kind: "adjustment", amount: -6840.7, settled: -6840.7, basis: "manual-push",
    trigger: "Manual", trigger_date: "2026-07-24", status: "DUE",
    state: "MD", sale_date: "2026-04-29", approved: true, changed: false, denied: false,
    calc: { result: "manual", note: "Adjustment recorded 2026-07-24" },
  }),
  mkLine({
    line_key: "OUR102030|rep|Marcus Webb",
    our: "OUR102030", home_owner: "", dealer: "Peak Power Group",
    party_type: "rep", party: "Marcus Webb",
    kind: "commission", amount: 4120, basis: "rep-epc",
    trigger: "Install", trigger_date: "2026-07-18", status: "DUE",
    state: "CO", sale_date: "2026-06-02", approved: false, denied: true,
    deny_reason: "Awaiting confirmation the second array was energised",
    calc: {
      rep: "Marcus Webb", n_reps: 1, pay_scale: "REP-EPC", position: "ADJ+450",
      result: "rep-pay", base_rl: 2.65, pos_adj: 450, rep_rl: 2.2,
      net_epc: 2.72, margin: 0.52, mult: 1, share: 1, amount: 4120,
      formula: "RepPay = (NetEPC − RepRL) × W × share",
    },
  }),
  mkLine({
    line_key: "OUR106801|setter|Dana Ruiz",
    our: "OUR106801", home_owner: "", dealer: "Unity Home Improvements",
    party_type: "setter", party: "Dana Ruiz",
    kind: "commission", amount: 300, basis: "setter-flat",
    trigger: "Install", trigger_date: "2026-07-30", status: "DUE",
    state: "AZ", sale_date: "2026-07-05", approved: true, changed: false, denied: false,
    calc: { result: "setter", milestone: "Install", rate: 300, note: "Flat APPT SETTERS rate per sale" },
  }),
  // A line with an M1/M2/M3 milestone plan — only part is releasable today.
  mkLine({
    line_key: "OUR107220|dealer|Trueform Energy",
    our: "OUR107220", home_owner: "", dealer: "Trueform Energy",
    party_type: "dealer", party: "Trueform Energy",
    kind: "commission", amount: 12500, releasable: 10000, basis: "install-commission",
    trigger: "Install", trigger_date: "2026-07-22", status: "DUE",
    state: "IL", sale_date: "2026-06-14", approved: true, changed: false, denied: false,
    calc: {
      contract: 52000, watts: 11000, rl: 1.75, redline: 19250, adders: 20250,
      adder_share: 1, pot: 12500, financier: "Solrite", sale_type: "Solrite PV + BESS (EC)",
      milestone: "Install", result: "commission", amount: 12500,
      plan: {
        stages: [
          { stage: "M1", label: "NTP advance", trigger: "NTP", date: "2026-06-28", cum_target: 2000, pay: 2000 },
          { stage: "M2", label: "Install", trigger: "Install", date: "2026-07-22", cum_target: 10000, pay: 8000 },
          { stage: "M3", label: "PTO + 30d", trigger: "PTO", date: null, cum_target: 12500, pay: 2500 },
        ],
        releasable: 10000, holdback: 0,
        m1_amount: 2000, m2_pct: 0.8, m3_pct: 0.2, m3_lag_days: 30,
      },
    },
  }),
];

// ── Pipeline: pre-install projects, live from Baseplate. NO dollar amounts. ────
/** The project timeline strip on the drawer — every stage a job passes through
 *  pre-install. `date` null renders as "No Data" rather than being omitted, so
 *  a missing stage reads as absence, not as "not applicable". */
const STAGE_NAMES = ["Site Survey", "CAD Design", "Permitting", "Roofing", "Install", "Inspection", "PTO"];
function mkTimeline(dates = {}) {
  return STAGE_NAMES.map((name) => ({ stage: name, date: dates[name] || null }));
}

export const PIPELINE = [
  { our: "OUR107401", customer: "Cheryl Hall", dealer: "Unity Home Improvements", rep: "Adan Frisby", setter: "Devon Reyes", state: "AZ", kw: 9.31, contract: 38240.5, sale_date: "2026-07-18", ntp_date: "2026-07-22", install_date: null, ntp_status: "✔ NTP", status: "ACTIVE", bucket: "active", coverage: { covered: true, gaps: [] },
    timeline: mkTimeline({ "Site Survey": "2026-07-19", "CAD Design": "2026-07-24", Permitting: "2026-08-02" }) },
  { our: "OUR107455", customer: "Miguel Santos", dealer: "Sunforce Solar", rep: "Lea Ortiz", setter: "", state: "NV", kw: 8.80, contract: 34112.0, sale_date: "2026-07-20", ntp_date: null, install_date: null, ntp_status: null, status: "ACTIVE", bucket: "active", coverage: { covered: false, gaps: [] },
    timeline: mkTimeline({ "Site Survey": "2026-07-23" }) },
  { our: "OUR107499", customer: "Barbara Nolan", dealer: "Peak Power Group", rep: "Marcus Webb", setter: "Ines Duarte", state: "CO", kw: 12.40, contract: 48950.0, sale_date: "2026-07-24", ntp_date: "2026-07-29", install_date: null, ntp_status: "Pending NTP - Change Order", status: "JEOPARDY", bucket: "jeopardy", coverage: { covered: true, gaps: ["system size"] },
    timeline: mkTimeline({ "Site Survey": "2026-07-26" }) },
  { our: "OUR107510", customer: "Derek Whitfield", dealer: "Trueform Energy", rep: "Sam Okafor", setter: "", state: "IL", kw: 11.00, contract: 42200.0, sale_date: "2026-07-26", ntp_date: "2026-08-01", install_date: null, ntp_status: "✔ NTP", status: "ACTIVE", bucket: "active", coverage: { covered: true, gaps: [] },
    timeline: mkTimeline({ "Site Survey": "2026-07-29", "CAD Design": "2026-08-04", Permitting: "2026-08-12", Roofing: "2026-08-18" }) },
  { our: "OUR107533", customer: "Alicia Moreno", dealer: "Honey Bee Solar", rep: "Tom Reeve", setter: "Priya Nair", state: "AZ", kw: 7.20, contract: 29875.0, sale_date: "2026-07-28", ntp_date: null, install_date: null, ntp_status: null, status: "HOLD", bucket: "hold", coverage: { covered: true, gaps: [] },
    timeline: mkTimeline({}) },
  { our: "OUR107588", customer: "Priya Raman", dealer: "A.O Enterprise LLC", rep: "Aaron Omid", setter: "", state: "TX", kw: 10.15, contract: 39980.0, sale_date: "2026-08-01", ntp_date: "2026-08-04", install_date: null, ntp_status: "✔ NTP", status: "ACTIVE", bucket: "active", coverage: { covered: true, gaps: [] },
    timeline: mkTimeline({ "Site Survey": "2026-08-05" }) },
  // A project with no system size recorded — renders as a gap, not as "0.00 kW".
  { our: "OUR107601", customer: "Hector Ruiz", dealer: "DRIVIN", rep: "Juan Martinez", setter: "", state: "AZ", kw: 13.94, contract: 46586.2, sale_date: "2026-08-22", ntp_date: "2026-08-23", install_date: null, ntp_status: "✔ NTP", status: "ACTIVE", bucket: "active", coverage: { covered: true, gaps: ["system size"] },
    timeline: mkTimeline({}) },
  { our: "OUR107644", customer: "Yusuf Adeyemi", dealer: "WhyGen Solar", rep: "Noel Barrett", setter: "", state: "TX", kw: 13.94, contract: 51100.0, sale_date: "2026-08-05", ntp_date: "2026-08-09", install_date: null, ntp_status: "Pending NTP - Change Order", status: "JEOPARDY", bucket: "jeopardy", coverage: { covered: false, gaps: [] },
    timeline: mkTimeline({ "Site Survey": "2026-08-08" }) },
  // No dealer at all — excluded from the list, and the count is reported rather than dropped.
  { our: "OUR107650", customer: "Unassigned record", dealer: "", rep: "", setter: "", state: "NM", kw: 0, contract: 0, sale_date: "2026-08-06", ntp_date: null, install_date: null, ntp_status: null, status: "ACTIVE", bucket: "active", coverage: null,
    timeline: mkTimeline({}) },
];

// ── review_items ──────────────────────────────────────────────────────────────
export const REVIEW = [
  { id: 1, key: "leiby|OUR105280|Travis Green", kind: "leiby", title: "Rep settings end-dated before install — held for review", our: "OUR105280", party: "Travis Green", dealer: "Peak Power Group", state: "CO", amount: 3180.4, status: "open", detail: { setting_end: "2026-06-30", install: "2026-07-15" } },
  { id: 2, key: "missing-settings|OUR106044|Ivy Chan", kind: "missing-settings", title: "No Rep Pay Settings row active at sale date", our: "OUR106044", party: "Ivy Chan", dealer: "Sunforce Solar", state: "NV", amount: null, status: "open", detail: {} },
  { id: 3, key: "rate-gap|Sunforce Solar|Sunnova|LOAN|NV", kind: "rate-gap", title: "No rate card row — Sunforce Solar · Sunnova · LOAN · NV", our: "OUR105880", party: "Sunforce Solar", dealer: "Sunforce Solar", state: "NV", amount: 0, status: "open", detail: { projects: 4 } },
  { id: 4, key: "orphan-payment|Y.E.G Solar Solutions LLC", kind: "orphan-payment", title: "Payment with no ledger line", our: "OUR104828", party: "Y.E.G Solar Solutions LLC", dealer: "Y.E.G Solar Solutions LLC", state: "MD", amount: 500, status: "open", detail: {} },
  { id: 5, key: "question|battery-override-policy", kind: "question", title: "Should overrides pay on cancelled projects?", our: null, party: null, dealer: null, state: null, amount: null, status: "resolved", resolution: "No — install only. Confirmed 2026-08-08.", resolved_by: "cantonucci@ourworldenergy.com", detail: {} },
  // money-review sorts first: money that has already moved is the most urgent kind.
  { id: 6, key: "money-review|OUR104474|A.O Enterprise LLC", kind: "money-review", title: "Paid in full, then the project regressed to Cancelled", our: "OUR104474", party: "A.O Enterprise LLC", dealer: "A.O Enterprise LLC", state: "AZ", amount: 9857.8, status: "open", detail: { paid_on: "2026-07-20", regressed_on: "2026-08-14" } },
  { id: 7, key: "money-review|OUR105102|Marcus Hale", kind: "money-review", title: "Advance balance outstanding on a closed rep", our: "OUR105102", party: "Marcus Hale", dealer: "Peak Power Group", state: "CO", amount: 2400, status: "open", detail: { advance: "ADV-2026-004" } },
  { id: 8, key: "data-quality|OUR106310", kind: "data-quality", title: "No system size on an installed project — cannot be priced", our: "OUR106310", party: "Bright Path Energy", dealer: "Bright Path Energy", state: "IL", amount: null, status: "open", detail: { missing: "kw" } },
  { id: 9, key: "data-quality|OUR106422", kind: "data-quality", title: "Contract value missing at install", our: "OUR106422", party: "Sunforce Solar", dealer: "Sunforce Solar", state: "NV", amount: null, status: "open", detail: { missing: "contract" } },
  { id: 10, key: "roster-mismatch|Peak Power Group", kind: "roster-mismatch", title: "Rate card says Rep Pay = YES but no rep is on the roster", our: null, party: "Peak Power Group", dealer: "Peak Power Group", state: "CO", amount: null, status: "open", detail: { projects: 3 } },
];

// ── advances ──────────────────────────────────────────────────────────────────
export const ADVANCES = [
  { id: 1, code: "ADV-2026-004", party: "Adan Frisby", party_type: "rep", rail: "rep", principal: 6000, payback_type: "cents_per_watt", payback_rate: 5, status: "active", repaid: 1840, notes: "Q3 ramp advance", sign1_by: "ammorrison@ourworldenergy.com", sign2_by: "cantonucci@ourworldenergy.com", created_by: "lsantos@ourworldenergy.com" },
  { id: 2, code: "ADV-2026-007", party: "Trueform Energy", party_type: "dealer", rail: "dealer", principal: 25000, payback_type: "pct_commission", payback_rate: 15, status: "active", repaid: 9400, notes: "Equipment float", sign1_by: "ammorrison@ourworldenergy.com", sign2_by: "cantonucci@ourworldenergy.com", created_by: "lsantos@ourworldenergy.com" },
  { id: 3, code: "ADV-2026-011", party: "Marcus Webb", party_type: "rep", rail: "rep", principal: 4000, payback_type: "per_install", payback_rate: 250, status: "pending", repaid: 0, notes: "Awaiting second signature", sign1_by: "ammorrison@ourworldenergy.com", sign2_by: null, created_by: "lsantos@ourworldenergy.com" },
  { id: 4, code: "ADV-2026-002", party: "Honey Bee Solar", party_type: "dealer", rail: "dealer", principal: 12000, payback_type: "cents_per_watt", payback_rate: 8, status: "repaid", repaid: 12000, notes: "", sign1_by: "ammorrison@ourworldenergy.com", sign2_by: "cantonucci@ourworldenergy.com", created_by: "cantonucci@ourworldenergy.com" },
];

// ── manual pushes ─────────────────────────────────────────────────────────────
export const PUSHES = [
  { id: 1, our: "OUR105114", party: "Honey Bee Solar", kind: "adjustment", amount: -450, reason: "Duplicate adder billed on the July run", rail: "dealer", funded_by: null, status: "pending", requested_by: "lsantos@ourworldenergy.com", sign1_by: "ammorrison@ourworldenergy.com", sign2_by: null },
  { id: 2, our: "OUR106312", party: "Adan Frisby", kind: "dealer-funded", amount: 1200, reason: "Dealer-funded bonus for the battery install", rail: "rep", funded_by: "Unity Home Improvements", status: "approved", requested_by: "cantonucci@ourworldenergy.com", sign1_by: "cantonucci@ourworldenergy.com", sign2_by: "ammorrison@ourworldenergy.com" },
  { id: 3, our: "OUR104474", party: "Alpha Electric", kind: "other", amount: 442.8, reason: "Override posted for the record — paid outside the app", rail: "dealer", funded_by: null, status: "approved", requested_by: "lsantos@ourworldenergy.com", sign1_by: "lsantos@ourworldenergy.com", sign2_by: "cantonucci@ourworldenergy.com" },
];

// ── settlements ───────────────────────────────────────────────────────────────
export const SETTLEMENTS = [
  { id: 1, line_key: "OUR104474|dealer|A.O Enterprise LLC", our: "OUR104474", party: "A.O Enterprise LLC", kind: "install", amount: 9857.8, method: "ACH", txn: "ACH-88214", date: "2026-07-02", entered_by: "lsantos@ourworldenergy.com" },
  { id: 2, line_key: "OUR104474|override|Alpha Electric", our: "OUR104474", party: "Alpha Electric", kind: "dlr-ovrd", amount: 442.8, method: "ACH", txn: "ACH-88410", date: "2026-07-22", entered_by: "lsantos@ourworldenergy.com" },
  { id: 3, line_key: "OUR106312|rep|Adan Frisby", our: "OUR106312", party: "Adan Frisby", kind: "draw", amount: 2000, method: "ACH", txn: "ACH-88099", date: "2026-06-24", entered_by: "lsantos@ourworldenergy.com" },
  { id: 4, line_key: "OUR103236|dealer|Y.E.G Solar Solutions LLC", our: "OUR103236", party: "Y.E.G Solar Solutions LLC", kind: "adjustment", amount: -6840.7, method: "", txn: "", date: "2026-07-24", entered_by: "cantonucci@ourworldenergy.com" },
];

// ── tickets ───────────────────────────────────────────────────────────────────
export const TICKETS = [
  { id: 12, title: "Work order ID missing from the payments view", detail: "Hard to track which payment belongs to which work order when posting.", raised_by: "Loremae Alova", area: "Pay", status: "building", solution: "", blocked_on: "", waiting_on: "claude", created_at: "2026-08-06" },
  { id: 11, title: "Trenching rates showing as Unit instead of Foot", detail: "The settings grid shows Unit for every trenching row.", raised_by: "Francheska Avera", area: "Rates", status: "shipped", solution: "Display now derives the unit from the catalog; pricing was already per foot.", blocked_on: "", waiting_on: "", created_at: "2026-07-31" },
  { id: 10, title: "Cancelled project still showing a payable override", detail: "OUR104828 is CANCEL but paid a $500 override.", raised_by: "Anthony Koga", area: "Pay", status: "open", solution: "", blocked_on: "", waiting_on: "caleb", created_at: "2026-08-04" },
  { id: 9, title: "Approve all shown has no confirmation", detail: "One mis-click can approve a large batch with no count or total shown.", raised_by: "Ryan Love", area: "Pay", status: "open", solution: "", blocked_on: "", waiting_on: "team", created_at: "2026-08-02" },
];

// ── access ────────────────────────────────────────────────────────────────────
export const ROLES = ["super_admin", "admin", "ops", "approver", "auditor", "dealer", "rep"];
export const ALL_TABS = ["PIPELINE","PENDING","READY","STMT","EXPOSURE","PAID","HOLD","DEALER","REP","LOGIC","PUSH","REVIEW","TICKETS","ADVANCES","ACCESS"];
export const USERS = [
  { email: "cantonucci@ourworldenergy.com", role: "super_admin" },
  { email: "lsantos@ourworldenergy.com", role: "admin" },
  { email: "ammorrison@ourworldenergy.com", role: "approver" },
  { email: "rlove@ourworldenergy.com", role: "ops" },
  { email: "fyavera@ourworldenergy.com", role: "auditor" },
];
export const ACCESS_REQUESTS = [
  { id: 1, email: "akoga@ourworldenergy.com", note: "Need to review partner payouts", requested_at: "2026-08-07", status: "pending" },
];

// ── settings tables ───────────────────────────────────────────────────────────
export const TABLE_LABELS = {
  pay_schedule: "Pay Schedule (RL + draw)", commission_rates: "Commission Rates",
  old_commission_rates: "Old Commission Rates (legacy)", rate_adjustments: "Rate Adjustments",
  adder_responsibility: "Adder Responsibility", adder_credits: "Adder Credits",
  marketing_fees: "Marketing Fees", loan_fees: "Loan Fees", tier_loan_fees: "Tier Loan Fees",
  dealer_tier: "Dealer Tier", dealer_override: "Dealer Override", leader_override: "Leader Override",
  appt_setters: "Appt Setters", rep_pay_settings: "Rep Pay Settings",
  solrite_holdbacks: "Solrite Holdbacks", small_system_fees: "Small System Fees ★",
  rep_split_overrides: "Rep Split Overrides ★", dealer_dba: "Dealer DBA ★",
  dealer_repayment: "Dealer Repayment ★", rep_pay_partners: "Rep-Pay Partners ★",
};

export const SETTINGS_GROUPS = {
  DEALER: ["pay_schedule","loan_fees","tier_loan_fees","dealer_tier","dealer_override","marketing_fees","solrite_holdbacks","small_system_fees","dealer_dba","dealer_repayment"],
  REP: ["rep_pay_settings","rep_pay_partners","commission_rates","old_commission_rates","rate_adjustments","adder_responsibility","adder_credits","appt_setters","leader_override","rep_split_overrides"],
};

export const GROUP_TITLE = { DEALER: "Dealer rate card", REP: "Sales-rep rate card" };
export const GROUP_SUB = {
  DEALER: "Dealer-rail rate card — redlines/draws, loan fees, tiers, overrides, marketing, holdbacks.",
  REP: "Sales-rep rate card — pay scales, commission rates, rate adjustments, adder responsibility, setters, splits.",
};

/** Column list per settings table — mirrors the real TABLE_COLS map. */
export const TABLE_COLS = {
  pay_schedule: ["dealer","finance_partner","installer","sale_type","state","rl","draw_pct","draw_max","rep_draw_pct","rep_draw_max","rep_pay","m1_amount","m2_pct","m3_pct","m3_lag_days","battery_base","battery_override","battery_dealer_pct","start_date","end_date"],
  commission_rates: ["finance_partner","installer","state","sale_type","sale_price","rep_type","rl","rate","start_date","end_date"],
  old_commission_rates: ["finance_partner","installer","state","sale_type","sale_price","rep_type","rl","rate","start_date","end_date"],
  rate_adjustments: ["pay_scale","position","adjustment","min_rate","max_rate","start_date","end_date"],
  adder_responsibility: ["party_type","dealer","pay_scale","percentage","start_date","end_date"],
  adder_credits: ["pay_scale","type","max_dollar","max_pct","start_date","end_date"],
  marketing_fees: ["source","dba","state","fee_rate","chg_dlr","pay_src","notes","start_date","end_date"],
  loan_fees: ["dealer","installer","state","loan_type","owe_cost","dlr_mu","dlr_cost","start_date","end_date"],
  tier_loan_fees: ["dealer_tier","installer","state","finance_type_name","owe_cost","dlr_mu","dlr_cost","start_date","end_date"],
  dealer_tier: ["dealer","tier","start_date","end_date"],
  dealer_override: ["sub_dealer","dealer","pay_rate","state","applies_to","battery_amount","start_date","end_date"],
  leader_override: ["team_name","leader_name","type","term","qual","sales_q","team_kw_q","pay_rate","applies_to","battery_amount","start_date","end_date"],
  appt_setters: ["name","team","pay_rate","start_date","end_date"],
  rep_pay_settings: ["rep_name","state","pay_scale","position","b_e","m1_amount","m1_pct","m2_pct","m3_pct","m3_lag_days","start_date","end_date"],
  solrite_holdbacks: ["sales_partner","installer","finance_partner","holdback_per_watt","state","start_date","end_date"],
  small_system_fees: ["max_kw","amount","state","start_date","end_date"],
  rep_split_overrides: ["unique_id","dealer","rep_name","split_pct","notes","start_date","end_date"],
  dealer_dba: ["entity","dba","notes","start_date","end_date"],
  dealer_repayment: ["dealer","kind","amount","terms","start_date","end_date"],
  rep_pay_partners: ["dealer","notes","start_date","end_date"],
};

/** Seed rows for the settings grids. Tables not listed start empty. */
export const SETTINGS_ROWS = {
  pay_schedule: [
    { id: 1, dealer: "Unity Home Improvements", finance_partner: "LightReach", installer: "OWE", sale_type: "LEASE: Battery (DC)", state: "AZ", rl: 1.8, draw_pct: 0.2, draw_max: 2500, rep_draw_pct: 0.25, rep_draw_max: 3000, rep_pay: "YES", m1_amount: null, m2_pct: null, m3_pct: null, m3_lag_days: null, battery_base: null, battery_override: null, battery_dealer_pct: null, start_date: "2026-01-01", end_date: null, void: 0 },
    { id: 2, dealer: "A.O Enterprise LLC", finance_partner: "LightReach", installer: "OWE", sale_type: "LEASE: Battery (DC)", state: "TX", rl: 1.9, draw_pct: 0.15, draw_max: 2000, rep_draw_pct: null, rep_draw_max: null, rep_pay: "NO", m1_amount: null, m2_pct: null, m3_pct: null, m3_lag_days: null, battery_base: null, battery_override: null, battery_dealer_pct: null, start_date: "2026-01-01", end_date: null, void: 0 },
    { id: 3, dealer: "Trueform Energy", finance_partner: "Solrite", installer: "OWE", sale_type: "Solrite PV + BESS (EC)", state: "IL", rl: 1.75, draw_pct: 0.2, draw_max: 3000, rep_draw_pct: 0.2, rep_draw_max: 2500, rep_pay: "YES", m1_amount: 2000, m2_pct: 0.8, m3_pct: 0.2, m3_lag_days: 30, battery_base: null, battery_override: null, battery_dealer_pct: null, start_date: "2026-03-01", end_date: null, void: 0 },
    { id: 4, dealer: "Honey Bee Solar", finance_partner: "LightReach", installer: "OWE", sale_type: "LEASE: Solar Only (DC)", state: "AZ", rl: 1.65, draw_pct: 0.2, draw_max: 2500, rep_draw_pct: null, rep_draw_max: null, rep_pay: "NO", m1_amount: null, m2_pct: null, m3_pct: null, m3_lag_days: null, battery_base: null, battery_override: null, battery_dealer_pct: null, start_date: "2026-02-15", end_date: null, void: 0 },
    { id: 5, dealer: "Peak Power Group", finance_partner: "Sunnova", installer: "OWE", sale_type: "LOAN", state: "CO", rl: 1.7, draw_pct: 0.15, draw_max: 2000, rep_draw_pct: 0.2, rep_draw_max: 2200, rep_pay: "YES", m1_amount: null, m2_pct: null, m3_pct: null, m3_lag_days: null, battery_base: null, battery_override: null, battery_dealer_pct: null, start_date: "2026-01-15", end_date: "2026-06-30", void: 0 },
  ],
  commission_rates: [
    { id: 1, finance_partner: "LightReach", installer: "OWE", state: "AZ", sale_type: "LEASE: Battery (DC)", sale_price: "~", rep_type: "REP-EPC", rl: "2.70", rate: "~", start_date: "2026-01-01", end_date: null, void: 0 },
    { id: 2, finance_partner: "Sunnova", installer: "OWE", state: "CO", sale_type: "LOAN", sale_price: "~", rep_type: "REP-EPC", rl: "2.65", rate: "~", start_date: "2026-01-01", end_date: null, void: 0 },
    { id: 3, finance_partner: "Solrite", installer: "OWE", state: "~", sale_type: "~", sale_price: "~", rep_type: "REP-EPC", rl: "0.00", rate: "~", start_date: "2026-02-01", end_date: null, void: 0 },
  ],
  rate_adjustments: [
    { id: 1, pay_scale: "REP-EPC", position: "ADJ+000", adjustment: 0, min_rate: "0", max_rate: "∞", start_date: "2026-01-01", end_date: null, void: 0 },
    { id: 2, pay_scale: "REP-EPC", position: "ADJ+450", adjustment: 450, min_rate: "0", max_rate: "∞", start_date: "2026-01-01", end_date: null, void: 0 },
    { id: 3, pay_scale: "REP-EPC", position: "ADJ+600", adjustment: 600, min_rate: "0", max_rate: "∞", start_date: "2026-01-01", end_date: null, void: 0 },
  ],
  rep_pay_settings: [
    { id: 4243, rep_name: "Agustin Garcia", state: "CO", pay_scale: "REP-EPC", position: "ADJ+450", b_e: 0, m1_amount: null, m1_pct: null, m2_pct: null, m3_pct: null, m3_lag_days: null, start_date: "2026-07-09", end_date: null, void: 0 },
    { id: 4244, rep_name: "Adan Frisby", state: "AZ", pay_scale: "REP-EPC", position: "ADJ+600", b_e: 0, m1_amount: 2000, m1_pct: null, m2_pct: null, m3_pct: null, m3_lag_days: null, start_date: "2026-05-01", end_date: null, void: 0 },
    { id: 4245, rep_name: "Marcus Webb", state: "CO", pay_scale: "REP-EPC", position: "ADJ+450", b_e: 0, m1_amount: null, m1_pct: null, m2_pct: null, m3_pct: null, m3_lag_days: null, start_date: "2026-01-01", end_date: null, void: 0 },
    { id: 4246, rep_name: "Travis Green", state: "CO", pay_scale: "REP-EPC", position: "ADJ+300", b_e: 0, m1_amount: null, m1_pct: null, m2_pct: null, m3_pct: null, m3_lag_days: null, start_date: "2026-01-01", end_date: "2026-06-30", void: 0 },
  ],
  dealer_override: [
    { id: 1, sub_dealer: "A.O Enterprise LLC", dealer: "Alpha Electric", pay_rate: 0.06, state: "TX", applies_to: "solar", battery_amount: null, start_date: "2026-01-01", end_date: null, void: 0 },
    { id: 2, sub_dealer: "Y.E.G Solar Solutions LLC", dealer: "Puresun", pay_rate: 0.05, state: "MD", applies_to: "both", battery_amount: 500, start_date: "2026-01-01", end_date: null, void: 0 },
  ],
  dealer_tier: [
    { id: 1, dealer: "Unity Home Improvements", tier: "TIER-1", start_date: "2026-01-01", end_date: null, void: 0 },
    { id: 2, dealer: "A.O Enterprise LLC", tier: "TIER-2", start_date: "2026-01-01", end_date: null, void: 0 },
    { id: 3, dealer: "Trueform Energy", tier: "TIER-1", start_date: "2026-01-01", end_date: null, void: 0 },
  ],
  appt_setters: [
    { id: 1, name: "Dana Ruiz", team: "Phoenix", pay_rate: 300, start_date: "2026-01-01", end_date: null, void: 0 },
    { id: 2, name: "Kyle Brennan", team: "Denver", pay_rate: 250, start_date: "2026-01-01", end_date: null, void: 0 },
  ],
  adder_responsibility: [
    { id: 1, party_type: "rep", dealer: "", pay_scale: "REP-EPC", percentage: 1, start_date: "2026-01-01", end_date: null, void: 0 },
    { id: 2, party_type: "rep", dealer: "", pay_scale: "REP-KWH", percentage: 0.5, start_date: "2026-01-01", end_date: null, void: 0 },
    { id: 3, party_type: "rep", dealer: "", pay_scale: "EMPLOYEE", percentage: 0, start_date: "2026-01-01", end_date: null, void: 0 },
  ],
  small_system_fees: [
    { id: 1, max_kw: 3, amount: 1200, state: "*", start_date: "2018-01-01", end_date: null, void: 0 },
    { id: 2, max_kw: 4, amount: 600, state: "*", start_date: "2018-01-01", end_date: null, void: 0 },
  ],
  dealer_dba: [
    { id: 1, entity: "Orange Solar LLC", dba: "OS Recruiting Partners", notes: "One payee, three names", start_date: "2026-01-01", end_date: null, void: 0 },
  ],
  rep_pay_partners: [
    { id: 1, dealer: "Unity Home Improvements", notes: "OWE processes rep payroll", start_date: "2026-01-01", end_date: null, void: 0 },
    { id: 2, dealer: "Peak Power Group", notes: "", start_date: "2026-01-01", end_date: null, void: 0 },
  ],
};

// ── settings_log ──────────────────────────────────────────────────────────────
export const SETTINGS_LOG = [
  { id: 3, table_name: "pay_schedule", row_id: 5, action: "end_date", changed_by: "cantonucci@ourworldenergy.com", changed_at: "2026-07-01T14:22:10Z" },
  { id: 2, table_name: "rep_pay_settings", row_id: 4243, action: "insert", changed_by: "fyavera@ourworldenergy.com", changed_at: "2026-07-09T09:14:02Z" },
  { id: 1, table_name: "dealer_override", row_id: 2, action: "insert", changed_by: "cantonucci@ourworldenergy.com", changed_at: "2026-06-18T11:05:44Z" },
];

export const ENGINE_RUN = { run_at: "2026-08-08T07:10:00Z", source: "scheduled engine run", lines: 742, note: "" };
