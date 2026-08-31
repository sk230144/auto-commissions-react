import { useState } from "react";
import { Download, ChevronRight, ChevronDown } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { moneyC, money, csvDownload, trunc, num } from "../lib/fmt.js";
import { useApi } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { Badge, Async, TableSkeleton, Modal, ErrorState, SortTh } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";
import ProjectDrawer from "../components/ProjectDrawer.jsx";
import { useSortState, sortRows } from "../lib/sort.js";

const SEVERITY = { high: "bad", medium: "warn", low: "mut" };

/**
 * Open Items — the reconciliation queue: problems the SYSTEM raised about
 * itself. (A ticket is what a person reported.) Rows arrive from seeders; this
 * screen only resolves and reopens, and nothing is ever deleted.
 *
 * Each item is rendered as the full case, not a table row. These are money
 * rulings — the person deciding needs the diagnosis, the options and the
 * verification in front of them, and a truncated summary is not something you
 * can responsibly rule on.
 */
export default function Review() {
  const { say, me } = useStore();
  const [resolveFor, setResolveFor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);

  const q = useApi((signal) => api.openItems({ signal }), []);
  const d = q.data;
  const groups = d?.groups || [];
  const resolved = d?.resolved || [];
  const orphans = d?.orphans;
  const canAct = d?.can_act !== false;

  const atStake = groups.reduce((s, g) => s + (g.at_stake_cents || 0), 0);

  async function act(fn, okMsg) {
    setBusy(true);
    try { await fn(); say(okMsg); q.reload(); }
    catch (e) { say(e.message, true); }
    finally { setBusy(false); }
  }

  function exportCsv() {
    const header = ["Kind", "Severity", "Item", "OUR#", "Party", "Dealer", "ST", "Amount", "Question"];
    const body = groups.flatMap((g) => g.items.map((i) => [g.label, i.detail?.severity || "",
      i.title, i.our || "", i.party || "", i.dealer || "", i.state || "",
      i.amount_cents == null ? "" : (i.amount_cents / 100).toFixed(2),
      i.detail?.question || ""]));
    csvDownload("open items", header, body) ? say("Exported") : say("Nothing to export", true);
  }

  return (
    <>
      <PageHead title="Open Items"
        count={q.loading ? "loading…" : q.error ? "—"
          : `${num(d?.open ?? 0)} open · ${moneyC(atStake)} at stake`}>
        <button className="btn" onClick={exportCsv} disabled={!groups.length}>
          <Download size={14} strokeWidth={2} />Export CSV
        </button>
      </PageHead>

      <div className="pagebody">
        <div className="sub">
          What the engine is holding on, and why. Each group is different work for a different
          person — a price, a performer, a measurement — so they are not collapsed into one list.
          Resolving records a ruling; nothing is ever deleted.
        </div>

        {q.loading && <div className="card"><div className="card-b"><TableSkeleton rows={5} cols={2} /></div></div>}
        {q.error && <div className="card"><ErrorState error={q.error} onRetry={q.reload} what="open items" /></div>}

        {d && groups.length === 0 && (
          <div className="card"><div className="stub">Nothing open. Every item has been ruled on.</div></div>
        )}

        {orphans?.show_card && <OrphanCard orphans={orphans} />}

        {groups.map((g) => (
          <div key={g.kind} style={{ marginBottom: 26 }}>
            <div className="grp-head">
              <h2>{g.label}</h2>
              <span className="count">{num(g.count)} open</span>
              {g.at_stake_cents > 0 && <span className="count">{moneyC(g.at_stake_cents)} at stake</span>}
            </div>
            {g.items.map((i) => (
              <ItemCard key={i.id} item={i} canAct={canAct} busy={busy}
                onResolve={() => setResolveFor(i)} onOpen={setOpen} />
            ))}
          </div>
        ))}

        {resolved.length > 0 && <ResolvedCard rows={resolved} canAct={canAct} busy={busy}
          onReopen={(id) => act(() => api.reopenOpenItem(id, { actor: me }), "Reopened")} />}
      </div>

      {resolveFor && (
        <ResolveDialog item={resolveFor} busy={busy} onCancel={() => setResolveFor(null)}
          onOk={(resolution) => {
            const it = resolveFor; setResolveFor(null);
            act(() => api.resolveOpenItem(it.id, { resolution, actor: me }), "Ruling recorded");
          }} />
      )}

      {open && <ProjectDrawer our={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/**
 * One item, in full. The order matters: what is at stake, then the diagnosis,
 * then the choices, then the evidence — so a reader reaches the decision with
 * the reasoning already behind them.
 */
function ItemCard({ item, canAct, busy, onResolve, onOpen }) {
  const [showVerified, setShowVerified] = useState(false);
  const det = item.detail || {};
  const sev = det.severity;

  return (
    <div className="card oi-card">
      <div className="card-b">
        <div className="oi-top">
          <div className="oi-head">
            <h3 className="oi-title">{item.title}</h3>
            <div className="oi-chips">
              {det.subkind && <Badge kind="mut">{det.subkind}</Badge>}
              {sev && <Badge kind={SEVERITY[sev] || "mut"}><span className="pip" />{sev}</Badge>}
              {det.lens && <Badge kind="mut">{det.lens}</Badge>}
            </div>
          </div>
          <div className="oi-side">
            {/* Who this concerns. A semicolon-joined list is many dealers, so it
                is broken up rather than run together as one long line. */}
            {item.dealer && (
              <div className="oi-parties">
                {item.dealer.split(";").map((p) => p.trim()).filter(Boolean).map((p) => (
                  <span key={p} className="oi-party">{p}</span>
                ))}
              </div>
            )}
            <div className="oi-facts">
              {item.our && <span><b>{item.our}</b></span>}
              {item.party && <span>{item.party}</span>}
              {item.state && <span className="mono">{item.state}</span>}
              {/* null ≠ 0 — a null amount means no dollar figure applies. */}
              {item.amount_cents != null && (
                <span className="oi-stake">{moneyC(item.amount_cents)} at stake</span>
              )}
            </div>
          </div>
        </div>

        {det.diagnosis && <p className="oi-body">{det.diagnosis}</p>}
        {det.question && <p className="oi-body">{det.question}</p>}
        {det.hint && <p className="oi-body oi-hint">{det.hint}</p>}
        {det.fix && <p className="oi-body"><b>Fix:</b> {det.fix}</p>}

        {det.last_known && Object.keys(det.last_known).length > 0 && (
          <div className="oi-kv">
            {Object.entries(det.last_known).map(([k, v]) => (
              <div key={k}><div className="k">{k.replace(/_/g, " ")}</div><div className="v">{String(v)}</div></div>
            ))}
          </div>
        )}

        {det.active_rows && Object.keys(det.active_rows).length > 0 && (
          <div className="oi-kv">
            {Object.entries(det.active_rows).map(([k, v]) => (
              <div key={k || "blank"}>
                <div className="k">{k === "" ? "(unset)" : k}</div>
                <div className="v">{v}</div>
              </div>
            ))}
          </div>
        )}

        {Array.isArray(det.jobs) && det.jobs.length > 0 && <JobsTable jobs={det.jobs} onOpen={onOpen} />}
        {Array.isArray(det.payments) && det.payments.length > 0 && <PaymentsTable payments={det.payments} onOpen={onOpen} />}

        <div className="oi-foot">
          {det.verified && (
            <button className="oi-disc" onClick={() => setShowVerified((v) => !v)}>
              {showVerified ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              How this was verified
            </button>
          )}
          <div className="sp" />
          {canAct && (
            <button className="btn pri" disabled={busy} onClick={onResolve}>Resolve</button>
          )}
        </div>

        {showVerified && det.verified && <p className="oi-verified">{det.verified}</p>}
      </div>
    </div>
  );
}

function JobsTable({ jobs, onOpen }) {
  const cols = [...new Set(jobs.flatMap((j) => Object.keys(j)))];
  const [sort, onSort] = useSortState();
  const rows = sortRows(jobs, sort);
  return (
    <>
      <div className="sect">Jobs ({jobs.length})</div>
      <div className="tblwrap" style={{ maxHeight: 240 }}>
        <table>
          <thead><tr>{cols.map((c) => (
            <SortTh key={c} k={c} sort={sort} onSort={onSort}>{c.replace(/_/g, " ")}</SortTh>
          ))}</tr></thead>
          <tbody>
            {rows.map((j, i) => (
              <tr key={j.our || i}>
                {cols.map((c) => (
                  <td key={c} className={c === "our" ? "id" : undefined}>
                    {j[c] == null || j[c] === "" ? <span className="gap">—</span>
                      : c === "our"
                        ? <a href="#" onClick={(e) => { e.preventDefault(); onOpen(j.our); }}>{j.our}</a>
                        : String(j[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** These `amount` values are DOLLARS, not cents — the field has no _cents
 *  suffix, and the suffix is the unit contract. */
function PaymentsTable({ payments, onOpen }) {
  const [sort, onSort] = useSortState();
  const rows = sortRows(payments, sort);
  return (
    <>
      <div className="sect">Payments already out ({payments.length})</div>
      <div className="tblwrap" style={{ maxHeight: 240 }}>
        <table>
          <thead>
            <tr>
              <SortTh k="our" sort={sort} onSort={onSort}>OUR#</SortTh>
              <SortTh k="date" sort={sort} onSort={onSort}>Date</SortTh>
              <SortTh k="kind" sort={sort} onSort={onSort}>Kind</SortTh>
              <SortTh k="amount" sort={sort} onSort={onSort} className="r">Amount</SortTh>
              <SortTh k="by" sort={sort} onSort={onSort}>Entered by</SortTh>
              <SortTh k="target_status" sort={sort} onSort={onSort}>Target status</SortTh></tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={`${p.our}-${i}`}>
                <td className="id"><a href="#" onClick={(e) => { e.preventDefault(); onOpen(p.our); }}>{p.our}</a></td>
                <td>{p.date || <span className="gap">—</span>}</td>
                <td>{p.kind}</td>
                <td className="r num">{money(p.amount)}</td>
                <td>{p.by ? trunc(p.by, 22) : <span className="gap">—</span>}</td>
                <td>{p.target_status ? <Badge kind="mut">{p.target_status}</Badge> : <span className="gap">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function OrphanCard({ orphans }) {
  const [sort, onSort] = useSortState();
  const rows = sortRows(orphans.parties, sort).slice(0, 50);
  return (
    <div className="card">
      <div className="card-h">
        <h2>Payments with no ledger line</h2>
        <div className="sp" />
        <span className="count">
          {num(orphans.payments)} payments · {moneyC(orphans.amount_cents)}
        </span>
      </div>
      <div className="card-b">
        <div className="sub" style={{ margin: "0 0 10px" }}>
          Money that has been paid out but cannot be matched to a commission line.
          {orphans.filed_items > 0 && <> <b>{orphans.filed_items}</b> already filed as items below.</>}
          {orphans.show_approvals_note && orphans.approvals > 0 &&
            <> <b>{orphans.approvals}</b> carry approvals.</>}
        </div>
        <div className="tblwrap" style={{ maxHeight: 260 }}>
          <table>
            <thead><tr>
              <SortTh k="party" sort={sort} onSort={onSort}>Party</SortTh>
              <SortTh k="payments" sort={sort} onSort={onSort} className="r">Payments</SortTh>
              <SortTh k="amount_cents" sort={sort} onSort={onSort} className="r">Amount</SortTh>
            </tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.party}>
                  <td title={p.party}>{trunc(p.party, 44)}</td>
                  <td className="r num">{p.payments}</td>
                  <td className="r num">{moneyC(p.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {orphans.parties.length > 50 && (
          <div className="submeta" style={{ marginTop: 8 }}>
            Showing the 50 largest of {num(orphans.parties.length)} parties.
          </div>
        )}
      </div>
    </div>
  );
}

function ResolvedCard({ rows: rowsIn, canAct, busy, onReopen }) {
  const [sort, onSort] = useSortState();
  const rows = sortRows(rowsIn, sort);
  return (
    <div className="card">
      <div className="card-h">
        <h2>Resolved</h2>
        <div className="sp" />
        <span className="count">{num(rows.length)}</span>
      </div>
      <div className="card-b flush">
        <div className="tblwrap" style={{ maxHeight: 420 }}>
          <table>
            <thead><tr>
              <SortTh k="kind" sort={sort} onSort={onSort}>Type</SortTh>
              <SortTh k="title" sort={sort} onSort={onSort}>Item</SortTh>
              <SortTh k="resolution" sort={sort} onSort={onSort}>Ruling</SortTh>
              <SortTh k="resolved_by" sort={sort} onSort={onSort}>By</SortTh>
              <th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Badge kind="mut">{r.kind}</Badge></td>
                  <td style={{ maxWidth: 340 }}>{r.title}</td>
                  <td style={{ color: "var(--ink-3)", maxWidth: 260 }}>{r.resolution}</td>
                  <td style={{ fontSize: 11.5 }}>
                    {r.resolved_by?.split("@")[0] || "—"}
                    {r.resolved_at && <div className="submeta">{String(r.resolved_at).slice(0, 10)}</div>}
                  </td>
                  <td className="r">
                    {canAct && (
                      <button className="btn sm" disabled={busy} onClick={() => onReopen(r.id)}>reopen</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * The ruling. Where the engine supplied `options`, they are offered as buttons
 * — those are the decisions it recognises — but the text stays editable,
 * because a real ruling usually needs a sentence of context that a canned
 * option cannot carry.
 */
function ResolveDialog({ item, onOk, onCancel, busy }) {
  const [text, setText] = useState("");
  const det = item.detail || {};
  const options = Array.isArray(det.options) ? det.options : [];

  return (
    <Modal wide title="Resolve this item"
      why="The ruling is kept as a permanent journal entry — it explains, later, why this was closed."
      onClose={onCancel}
      footer={<>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn pri" disabled={!text.trim() || busy} onClick={() => onOk(text.trim())}>
          Record ruling
        </button>
      </>}>
      <div style={{ fontSize: 13.5, marginBottom: 10, lineHeight: 1.55, fontWeight: 550 }}>{item.title}</div>
      {item.amount_cents != null && (
        <div className="submeta" style={{ marginBottom: 14 }}>At stake: <b>{moneyC(item.amount_cents)}</b></div>
      )}
      {det.hint && <div className="sub" style={{ margin: "0 0 14px" }}>{det.hint}</div>}

      {options.length > 0 && (
        <>
          <label className="f">Recognised rulings</label>
          <div className="row" style={{ gap: 7, marginBottom: 12, flexWrap: "wrap" }}>
            {options.map((o) => (
              <button key={o} className={"btn sm" + (text === o ? " pri" : "")}
                onClick={() => setText(o)}>{o}</button>
            ))}
          </div>
        </>
      )}

      <label className="f">Ruling *</label>
      <textarea autoFocus rows={4} value={text} onChange={(e) => setText(e.target.value)}
        placeholder="What was decided, and on what basis" />
    </Modal>
  );
}
