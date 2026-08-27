import { useState } from "react";
import { Download } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { moneyC, csvDownload, trunc } from "../lib/fmt.js";
import { useApi } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { Badge, Async, TableSkeleton, Modal, Tip, ErrorState } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";

/**
 * Open Items — the reconciliation queue: problems the SYSTEM raised about
 * itself. (A ticket is what a person reported.) Rows arrive from seeders; this
 * screen only resolves and reopens them, and nothing is ever deleted — every
 * row is a permanent journal entry.
 *
 * Groups arrive pre-ordered, most actionable first, so the server's order is
 * rendered as-is rather than re-sorted here.
 */
export default function Review() {
  const { say, me } = useStore();
  const [resolveFor, setResolveFor] = useState(null);
  const [busy, setBusy] = useState(false);

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
    const header = ["Kind", "Item", "OUR#", "Party", "Dealer", "ST", "Amount"];
    const body = groups.flatMap((g) => g.items.map((i) => [g.label, i.title, i.our || "",
      i.party || "", i.dealer || "", i.state || "",
      i.amount_cents == null ? "" : (i.amount_cents / 100).toFixed(2)]));
    csvDownload("open items", header, body) ? say("Exported") : say("Nothing to export", true);
  }

  return (
    <>
      <PageHead title="Open Items"
        count={q.loading ? "loading…" : q.error ? "—"
          : `${(d?.open ?? 0).toLocaleString()} open · ${moneyC(atStake)} at stake`}>
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

        {q.loading && <div className="card"><TableSkeleton cols={6} /></div>}
        {q.error && <div className="card"><ErrorState error={q.error} onRetry={q.reload} what="open items" /></div>}

        {d && groups.length === 0 && (
          <div className="card"><div className="stub">Nothing open. Every item has been ruled on.</div></div>
        )}

        {/* Payments with no ledger line to attach to — money already out. */}
        {orphans?.show_card && (
          <div className="card">
            <div className="card-h">
              <h2>Payments with no ledger line</h2>
              <div className="sp" />
              <span className="count">
                {orphans.payments.toLocaleString()} payments · {moneyC(orphans.amount_cents)}
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
                  <thead><tr><th>Party</th><th className="r">Payments</th><th className="r">Amount</th></tr></thead>
                  <tbody>
                    {orphans.parties.slice(0, 50).map((p) => (
                      <tr key={p.party}>
                        <td title={p.party}>{trunc(p.party, 40)}</td>
                        <td className="r num">{p.payments}</td>
                        <td className="r num">{moneyC(p.amount_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {orphans.parties.length > 50 && (
                <div className="submeta" style={{ marginTop: 8 }}>
                  Showing the 50 largest of {orphans.parties.length.toLocaleString()} parties.
                </div>
              )}
            </div>
          </div>
        )}

        {groups.map((g) => (
          <div className="card" key={g.kind}>
            <div className="card-h">
              <h2>{g.label}</h2>
              <div className="sp" />
              <span className="count">
                {g.count.toLocaleString()}
                {g.at_stake_cents ? ` · ${moneyC(g.at_stake_cents)}` : ""}
              </span>
            </div>
            <div className="card-b flush">
              <div className="tblwrap">
                <table>
                  <thead>
                    <tr><th>Item</th><th>OUR#</th><th>Party</th><th>ST</th>
                      <th className="r">Amount</th><th /></tr>
                  </thead>
                  <tbody>
                    {g.items.map((i) => (
                      <tr key={i.id}>
                        <td style={{ maxWidth: 460 }}>
                          {i.title.length > 90 ? <Tip text={i.title}>{trunc(i.title, 90)}</Tip> : i.title}
                          {i.dealer && <div className="submeta">{trunc(i.dealer, 60)}</div>}
                        </td>
                        <td className="id">{i.our || <span className="gap">—</span>}</td>
                        <td>{i.party ? trunc(i.party, 20) : <span className="gap">—</span>}</td>
                        <td className="mono">{i.state || <span className="gap">—</span>}</td>
                        {/* null ≠ 0 — no dollar figure applies, so render nothing. */}
                        <td className="r num">{i.amount_cents == null ? <span className="gap">—</span> : moneyC(i.amount_cents)}</td>
                        <td className="r">
                          {canAct && (
                            <button className="btn sm pri" disabled={busy} onClick={() => setResolveFor(i)}>Resolve</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}

        {resolved.length > 0 && (
          <div className="card">
            <div className="card-h">
              <h2>Resolved</h2>
              <div className="sp" />
              <span className="count">{resolved.length.toLocaleString()}</span>
            </div>
            <div className="card-b flush">
              <div className="tblwrap" style={{ maxHeight: 420 }}>
                <table>
                  <thead><tr><th>Type</th><th>Item</th><th>Ruling</th><th>By</th><th /></tr></thead>
                  <tbody>
                    {resolved.map((r) => (
                      <tr key={r.id}>
                        <td><Badge kind="mut">{r.kind}</Badge></td>
                        <td style={{ maxWidth: 320 }}>
                          {r.title?.length > 70 ? <Tip text={r.title}>{trunc(r.title, 70)}</Tip> : r.title}
                        </td>
                        <td style={{ color: "var(--ink-3)", maxWidth: 260 }}>{trunc(r.resolution, 70)}</td>
                        <td style={{ fontSize: 11.5 }}>
                          {r.resolved_by?.split("@")[0] || "—"}
                          {r.resolved_at && <div className="submeta">{String(r.resolved_at).slice(0, 10)}</div>}
                        </td>
                        <td className="r">
                          {canAct && (
                            <button className="btn sm" disabled={busy}
                              onClick={() => act(() => api.reopenOpenItem(r.id, { actor: me }), "Reopened")}>
                              reopen
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {resolveFor && (
        <ResolveDialog item={resolveFor} busy={busy} onCancel={() => setResolveFor(null)}
          onOk={(resolution) => {
            const it = resolveFor; setResolveFor(null);
            act(() => api.resolveOpenItem(it.id, { resolution, actor: me }), "Ruling recorded");
          }} />
      )}
    </>
  );
}

function ResolveDialog({ item, onOk, onCancel, busy }) {
  const [text, setText] = useState("");
  return (
    <Modal title="Resolve this item"
      why="The ruling is kept as a permanent journal entry — it explains, later, why this was closed."
      onClose={onCancel}>
      <div style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.55 }}>{item.title}</div>
      {item.amount_cents != null && (
        <div className="submeta" style={{ marginBottom: 12 }}>At stake: <b>{moneyC(item.amount_cents)}</b></div>
      )}
      <label className="f">Ruling *</label>
      <textarea autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)}
        placeholder="What was decided, and on what basis" />
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn pri" disabled={!text.trim() || busy} onClick={() => onOk(text.trim())}>
          Record ruling
        </button>
      </div>
    </Modal>
  );
}
