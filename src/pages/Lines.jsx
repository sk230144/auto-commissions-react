import { useMemo, useState } from "react";
import { Search, Download } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { moneyC, csvDownload, trunc, toCents, today } from "../lib/fmt.js";
import { useApi, useDebounced } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { Badge, Async, TableSkeleton, Pager, Confirm, Modal } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";
import FilterPanel, { apiFacet } from "../components/FilterPanel.jsx";
import ProjectDrawer from "../components/ProjectDrawer.jsx";

const LIMIT = 25;
const BLANK = { dealers: [], states: [], kinds: [], dateFrom: "", dateTo: "" };

const HINT = {
  pending_approval: "Priced but not yet approved, plus anything whose amount changed after approval. Approving stores a snapshot of the amount.",
  ready_to_pay: "Approved with a balance still owing. Settling records a real payment — it is append-only, so a correction is a new negative entry.",
  payment_records: "Approved and fully settled. The figure shown is what was actually paid.",
  on_hold: "Held or denied, with a reason. Nothing is paid while a line sits here. Reopening returns it to Pending — approval is deliberately not restored.",
};

/** The server owns which tab a line belongs to; the client never re-derives it. */
export default function Lines({ tab, title, eyebrow }) {
  const { eco, say, me } = useStore();
  const [sel, setSel] = useState(() => new Set());
  const [open, setOpen] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [settleFor, setSettleFor] = useState(null);
  const [holdFor, setHoldFor] = useState(null);
  const [zeros, setZeros] = useState(false);
  const [allDates, setAllDates] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState(BLANK);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);

  const search = useDebounced(q, 350);

  const apiFilter = {
    dealers: filter.dealers, states: filter.states, kinds: filter.kinds,
    date_from: filter.dateFrom, date_to: filter.dateTo,
  };
  const common = { party_type: eco, search, show_zeros: zeros, show_all_dates: allDates, filter: apiFilter };
  const key = JSON.stringify({ ...common, tab });

  const rowsQ = useApi(
    (signal) => api.paymentLines({ ...common, tab, limit: LIMIT, offset }, { signal }),
    [key, offset]
  );
  const sumQ = useApi((signal) => api.paymentSummary(common, { signal }), [JSON.stringify(common)]);

  const rows = rowsQ.data?.payments || [];
  const stat = sumQ.data?.tabs?.[tab];
  // The lines call carries its own row count; the summary supplies the money.
  const total = rowsQ.data?.total ?? 0;
  const hidden = sumQ.data?.hidden ?? 0;

  const reload = () => { rowsQ.reload(); sumQ.reload(); };
  const resetPage = (fn) => (v) => { fn(v); setOffset(0); setSel(new Set()); };

  const groups = useMemo(() => [
    { key: "dealers", label: "Payee", options: apiFacet(sumQ.data?.facets?.dealers) },
    { key: "states", label: "State", options: apiFacet(sumQ.data?.facets?.states, { sort: "value" }) },
    { key: "kinds", label: "Kind", options: apiFacet(sumQ.data?.facets?.kinds) },
  ], [sumQ.data]);

  const filterCount = filter.dealers.length + filter.states.length + filter.kinds.length
    + (filter.dateFrom || filter.dateTo ? 1 : 0);

  // Only lines the server would accept can be selected.
  const selectable = rows.filter((l) => !l.needs_rate && l.amount_cents !== 0);
  const allOn = selectable.length > 0 && selectable.every((l) => sel.has(l.line_key));
  const toggle = (k) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const canBatch = tab === "pending_approval" || tab === "ready_to_pay";

  /**
   * Runs an action, then reports what the server actually did. Refusals are
   * per-line and named — never collapse them into "some lines failed", because
   * the reason is the thing the operator has to act on.
   */
  async function act(fn, okMsg) {
    setBusy(true);
    try {
      const res = await fn();
      const refused = res?.refused || res?.rejected || {};
      const names = Object.keys(refused);
      if (names.length) {
        const first = `${names[0].split("|")[0]}: ${refused[names[0]]}`;
        say(names.length === 1 ? first : `${first} (+${names.length - 1} more refused)`, true);
      } else {
        say(okMsg);
      }
      setSel(new Set());
      reload();
    } catch (e) {
      say(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  function batchApprove() {
    const keys = [...sel];
    const sum = rows.filter((l) => sel.has(l.line_key)).reduce((s, l) => s + l.amount_cents, 0);
    setConfirm({
      title: "Approve selected lines?",
      body: <>Approve <b>{keys.length}</b> line{keys.length === 1 ? "" : "s"} totalling <b>{moneyC(sum)}</b>?
        <div style={{ marginTop: 10, color: "var(--ink-2)", fontSize: 12.5, lineHeight: 1.6 }}>
          Approval stores a snapshot of the amount. If the figure changes afterwards the line
          drops back to Pending flagged <b>changed</b> and has to be re-approved.
        </div></>,
      confirmLabel: "Approve " + keys.length,
      onYes: () => { setConfirm(null); act(() => api.approveLines(keys, me), `${keys.length} line(s) approved`); },
    });
  }

  function exportCsv() {
    const header = ["OUR#", "Payee", "Dealer", "Kind", "Milestone", "Date", "Amount", "Settled", "Balance", "Tab"];
    const body = rows.map((l) => [l.our_reference, l.party, l.dealer, l.kind, l.trigger, l.trigger_date || "",
      (l.amount_cents / 100).toFixed(2), (l.settled_cents / 100).toFixed(2), (l.balance_cents / 100).toFixed(2), l.tab]);
    csvDownload(`${eco} ${tab}`, header, body)
      ? say(`Exported ${rows.length} rows (this page)`)
      : say("Nothing to export", true);
  }

  const countLine = rowsQ.loading || sumQ.loading ? "loading…"
    : rowsQ.error ? "—"
    : `${total.toLocaleString()} lines`
      + (sumQ.error ? "" : ` · ${moneyC(stat?.total_cents ?? 0)}`);

  return (
    <>
      <PageHead eyebrow={eyebrow} title={title} count={countLine}>
        <button className="btn" onClick={exportCsv} disabled={!rows.length}>
          <Download size={14} strokeWidth={2} />Export CSV
        </button>
        {tab === "pending_approval" && (
          <button className="btn pri" disabled={!sel.size || busy} onClick={batchApprove}>
            Approve{sel.size ? ` ${sel.size} selected` : " selected"}
          </button>
        )}
        {tab === "ready_to_pay" && (
          <button className="btn pri" disabled={!sel.size || busy}
            onClick={() => setSettleFor(rows.filter((l) => sel.has(l.line_key)))}>
            Settle{sel.size ? ` ${sel.size} selected` : " selected"}
          </button>
        )}
      </PageHead>

      <div className="pagebody">
        <div className="sub">
          {HINT[tab]}
          {hidden > 0 && <> <b>{hidden.toLocaleString()} hidden</b> (recorded $0 or before the cutoff date).</>}
        </div>

        <div className="card">
          <div className="card-h">
            <div className="search" style={{ width: 230 }}>
              <span className="mag"><Search size={14} strokeWidth={2} /></span>
              <input placeholder="OUR#, payee, amount…" value={q} onChange={(e) => resetPage(setQ)(e.target.value)} />
            </div>
            <FilterPanel groups={groups} dateRange={{ key: "date", label: "Milestone date" }}
              value={filter} onApply={resetPage(setFilter)} count={filterCount} />
            <div className="sp" />
            {tab === "pending_approval" && <>
              <button className={"btn sm" + (zeros ? " pri" : "")} onClick={() => resetPage(setZeros)(!zeros)}>
                {zeros ? "Showing" : "Show"} $0
              </button>
              <button className={"btn sm" + (allDates ? " pri" : "")} onClick={() => resetPage(setAllDates)(!allDates)}>
                {allDates ? "All dates" : "Since cutoff"}
              </button>
            </>}
          </div>

          <div className="card-b flush">
            <Async q={rowsQ} what="these lines" isEmpty={!rows.length}
              skeleton={<TableSkeleton cols={canBatch ? 9 : 8} />}
              empty={search || filterCount ? "No lines match those filters." : "No lines in this queue."}>
              <div className={"tblwrap" + (rowsQ.refreshing || busy ? " refreshing" : "")}>
                <table>
                  <thead>
                    <tr>
                      {canBatch && <th style={{ width: 38 }}>
                        <input type="checkbox" style={{ width: "auto", margin: 0 }} checked={allOn}
                          onChange={() => setSel(allOn ? new Set() : new Set(selectable.map((l) => l.line_key)))} />
                      </th>}
                      <th>OUR#</th>
                      <th>Payee</th>
                      <th>Kind</th>
                      <th className="r">Amount</th>
                      {tab !== "pending_approval" && <><th className="r">Settled</th><th className="r">Balance</th></>}
                      <th>{tab === "payment_records" ? "Settled on" : "Milestone"}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((l) => (
                      <tr key={l.line_key}>
                        {canBatch && <td>
                          {!l.needs_rate && l.amount_cents !== 0 && (
                            <input type="checkbox" style={{ width: "auto", margin: 0 }}
                              checked={sel.has(l.line_key)} onChange={() => toggle(l.line_key)} />
                          )}
                        </td>}
                        <td className="id">
                          <a href="#" onClick={(e) => { e.preventDefault(); setOpen(l.our_reference); }}>{l.our_reference}</a>
                        </td>
                        <td>
                          <span title={l.party}>{trunc(l.party, 24)}</span>
                          {/* On an override the payee is not the dealer whose deal it is. */}
                          {l.dealer && l.dealer !== l.party &&
                            <div className="submeta" title={`Dealer: ${l.dealer}`}>on {trunc(l.dealer, 22)}</div>}
                        </td>
                        <td>
                          {l.kind}
                          {l.changed && <div style={{ marginTop: 3 }}><Badge kind="warn"><span className="pip" />changed</Badge></div>}
                        </td>
                        <td className="r num" style={{ fontWeight: 550, color: l.amount_cents < 0 ? "var(--held)" : undefined }}>
                          {moneyC(l.amount_cents)}
                        </td>
                        {tab !== "pending_approval" && <>
                          <td className="r num">{moneyC(l.settled_cents)}</td>
                          <td className="r num" style={{ fontWeight: 550 }}>{moneyC(l.balance_cents)}</td>
                        </>}
                        <td>
                          {tab === "payment_records"
                            ? (l.settled_on || <span className="gap">not recorded</span>)
                            : <>
                              <div style={{ fontWeight: 550 }}>{l.trigger}</div>
                              <div className="submeta">{l.trigger_date || "no date"}</div>
                            </>}
                        </td>
                        <td className="r">
                          <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 6 }}>
                            {l.needs_rate && <Badge kind="bad"><span className="pip" />needs rate</Badge>}
                            {tab === "pending_approval" && !l.needs_rate && l.amount_cents !== 0 && (
                              <button className="btn sm pri" disabled={busy} onClick={() => setConfirm({
                                title: "Approve this line?",
                                body: <>Approve <b>{moneyC(l.amount_cents)}</b> to <b>{l.party}</b> on {l.our_reference}?</>,
                                confirmLabel: "Approve",
                                onYes: () => { setConfirm(null); act(() => api.approveLines([l.line_key], me), "Approved"); },
                              })}>Approve</button>
                            )}
                            {tab === "ready_to_pay" && (
                              <button className="btn sm" disabled={busy} onClick={() => setSettleFor([l])}>Settle</button>
                            )}
                            {tab === "ready_to_pay" && (
                              <button className="btn sm" disabled={busy} onClick={() => setConfirm({
                                title: "Unapprove this line?",
                                body: <>Return <b>{l.our_reference}</b> to Pending Approval? Nothing is paid until it is approved again.</>,
                                confirmLabel: "Unapprove",
                                onYes: () => { setConfirm(null); act(() => api.unapproveLines([l.line_key]), "Returned to Pending"); },
                              })}>Unapprove</button>
                            )}
                            {(tab === "pending_approval" || tab === "ready_to_pay") && (
                              <button className="btn sm danger" disabled={busy} onClick={() => setHoldFor(l)}>Hold</button>
                            )}
                            {tab === "on_hold" && (
                              <button className="btn sm" disabled={busy} onClick={() => setConfirm({
                                title: "Reopen this line?",
                                body: <>Return <b>{l.our_reference}</b> to Pending Approval. Approval is <b>not</b> restored — it has to be approved again.</>,
                                confirmLabel: "Reopen",
                                onYes: () => { setConfirm(null); act(() => api.reopenLines([l.line_key]), "Reopened"); },
                              })}>Reopen</button>
                            )}
                            {tab === "payment_records" && <Badge kind="ok"><span className="pip" />settled</Badge>}
                          </div>
                          {l.deny_reason && <div className="submeta" style={{ color: "var(--held)" }}>{l.deny_reason}</div>}
                          {!l.needs_rate && l.expected_pay && tab === "pending_approval" &&
                            <div className="submeta">pays {l.expected_pay}</div>}
                        </td>
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

      {open && <ProjectDrawer our={open} onClose={() => setOpen(null)} />}
      {confirm && <Confirm {...confirm} onNo={() => setConfirm(null)} />}
      {holdFor && (
        <HoldDialog line={holdFor} busy={busy} onCancel={() => setHoldFor(null)}
          onOk={(reason) => { setHoldFor(null); act(() => api.holdLines([holdFor.line_key], me, reason), "Held"); }} />
      )}
      {settleFor && (
        <SettleDialog lines={settleFor} busy={busy} onCancel={() => setSettleFor(null)}
          onOk={(settlements) => { setSettleFor(null); act(() => api.settleLines(me, settlements), "Payment recorded"); }} />
      )}
    </>
  );
}

/** Hold needs a reason — it is what the On Hold tab shows the next person. */
function HoldDialog({ line, onOk, onCancel, busy }) {
  const [reason, setReason] = useState("");
  return (
    <Modal title="Hold this line"
      why="Recorded and reversible. Nothing is paid while a line is held, and the reason is shown on the On Hold tab."
      onClose={onCancel}>
      <div style={{ fontSize: 13, marginBottom: 12, color: "var(--ink-2)" }}>
        {line.our_reference} · {line.party} · {moneyC(line.amount_cents)}
      </div>
      <label className="f">Reason</label>
      <input autoFocus value={reason} placeholder="e.g. checking adders"
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && reason.trim() && onOk(reason.trim())} />
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn danger" disabled={!reason.trim() || busy} onClick={() => onOk(reason.trim())}>Hold</button>
      </div>
    </Modal>
  );
}

/**
 * Settlements are append-only: there is no edit or delete, and a correction is
 * a new negative entry. The amount defaults to the full balance but is
 * editable, because partial payments are normal.
 */
function SettleDialog({ lines, onOk, onCancel, busy }) {
  const [amts, setAmts] = useState(() =>
    Object.fromEntries(lines.map((l) => [l.line_key, (l.balance_cents / 100).toFixed(2)])));
  const [meta, setMeta] = useState({ method: "ACH", txn: "", date: today(), notes: "" });

  const totalC = lines.reduce((s, l) => s + toCents(amts[l.line_key]), 0);
  const bad = lines.some((l) => {
    const c = toCents(amts[l.line_key]);
    return !Number.isFinite(c) || c === 0 || Math.abs(c) > Math.abs(l.balance_cents);
  });

  const submit = () => onOk(lines.map((l) => ({
    line_key: l.line_key,
    amount_cents: toCents(amts[l.line_key]),
    method: meta.method, txn: meta.txn, date: meta.date, notes: meta.notes,
  })));

  return (
    <Modal wide title={lines.length === 1 ? "Record a payment" : `Record ${lines.length} payments`}
      why="Payments are append-only — there is no edit or delete, so a correction is a new offsetting entry."
      onClose={onCancel}
      footer={<>
        {/* The running total stays visible while the amounts scroll — it is
            the figure being committed. */}
        <span style={{ fontSize: 13, color: "var(--ink-2)", marginRight: "auto" }}>
          Total <b>{moneyC(totalC)}</b>
          {bad && <span className="submeta" style={{ color: "var(--held)", display: "block" }}>
            Each amount must be non-zero and no more than the line's balance.
          </span>}
        </span>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn pri" disabled={bad || busy || !meta.date} onClick={submit}>Record payment</button>
      </>}>
      {/* No inner maxHeight — the modal body is the scroll area now, and a
          nested one would trap the wheel. */}
      <div className="tblwrap" style={{ marginBottom: 14 }}>
        <table>
          <thead><tr><th>OUR#</th><th>Payee</th><th className="r">Balance</th><th className="r" style={{ width: 130 }}>Pay now</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.line_key}>
                <td className="id">{l.our_reference}</td>
                <td title={l.party}>{trunc(l.party, 20)}</td>
                <td className="r num">{moneyC(l.balance_cents)}</td>
                <td className="r">
                  <input type="number" step="0.01" value={amts[l.line_key]}
                    style={{ textAlign: "right" }}
                    onChange={(e) => setAmts({ ...amts, [l.line_key]: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid">
        <div><label className="f">Method</label>
          <select value={meta.method} onChange={(e) => setMeta({ ...meta, method: e.target.value })}>
            <option>ACH</option><option>Check</option><option>Wire</option><option>Other</option>
          </select></div>
        <div><label className="f">Reference / txn</label>
          <input value={meta.txn} placeholder="TX-991" onChange={(e) => setMeta({ ...meta, txn: e.target.value })} /></div>
        <div><label className="f">Date paid</label>
          <input type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} /></div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label className="f">Notes</label>
        <input value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} />
      </div>
    </Modal>
  );
}
