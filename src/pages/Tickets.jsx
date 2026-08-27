import { useState } from "react";
import { Search, Plus } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { csvDownload, trunc } from "../lib/fmt.js";
import { useApi, useDebounced } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { Badge, Async, TableSkeleton, Modal, Tip } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";

const STATUS = {
  open: ["blue", "Open"], building: ["blue", "Building"], blocked: ["bad", "Blocked"],
  shipped: ["ok", "Shipped"], wont_do: ["mut", "Won't do"],
};
const WAITING = ["", "caleb", "claude", "team"];
const WAITING_LABEL = { "": "Not decided", caleb: "Caleb", claude: "Claude", team: "Someone else" };
const AREAS = ["Pay", "Rates", "Data", "Access", "Reporting"];

/**
 * Tickets — what a PERSON reported about this tool. (Open Items is what the
 * system raised about itself.) A request stops living in a chat thread: who
 * asked, what was done, and whether it is finished.
 */
export default function Tickets() {
  const { say, me } = useStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [waiting, setWaiting] = useState("");
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const search = useDebounced(q, 350);

  const listQ = useApi(
    (signal) => api.tickets({ q: search, status, waiting_on: waiting }, { signal }),
    [search, status, waiting]
  );

  const d = listQ.data;
  const rows = d?.tickets || [];
  const counts = d?.counts || {};
  const waitingCounts = d?.waiting || {};
  const canAct = d?.can_act !== false;

  async function save(body) {
    setBusy(true);
    try {
      if (body.id) await api.ticketUpdate(body.id, { ...body, actor: me });
      else await api.ticketCreate({ ...body, actor: me });
      say(body.id ? "Ticket updated" : "Ticket raised");
      setForm(null);
      listQ.reload();
    } catch (e) {
      say(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const header = ["#", "Title", "Raised by", "Area", "Status", "Waiting on", "What was done", "Blocked on", "Created"];
    const body = rows.map((t) => [t.id, t.title, t.raised_by || "", t.area || "", t.status,
      t.waiting_on || "", t.solution || "", t.blocked_on || "", (t.created_at || "").slice(0, 10)]);
    csvDownload("tickets", header, body) ? say("Exported") : say("Nothing to export", true);
  }

  const live = (counts.open || 0) + (counts.building || 0) + (counts.blocked || 0);

  return (
    <>
      <PageHead title="Tickets"
        count={listQ.loading ? "loading…" : listQ.error ? "—"
          : `${rows.length.toLocaleString()} shown · ${live.toLocaleString()} live`}>
        <button className="btn" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
        {canAct && (
          <button className="btn pri" onClick={() => setForm({
            title: "", detail: "", raised_by: "", area: "Pay",
            status: "open", waiting_on: "", solution: "", blocked_on: "",
          })}>
            <Plus size={14} strokeWidth={2} />Raise a ticket
          </button>
        )}
      </PageHead>

      <div className="pagebody">
        <div className="sub">
          What the team has raised about this tool, and what came of it. A request stops living in
          a chat thread — who asked, what was done, and whether it is finished.
          {waitingCounts.unassigned > 0 && <> <b>{waitingCounts.unassigned}</b> have nobody assigned.</>}
        </div>

        <div className="card">
          <div className="card-h">
            <div className="seg">
              <button className={status === "" ? "on" : ""} onClick={() => setStatus("")}>
                All<span className="segn">{Object.values(counts).reduce((a, b) => a + b, 0)}</span>
              </button>
              {Object.keys(STATUS).map((s) => (
                <button key={s} className={status === s ? "on" : ""} onClick={() => setStatus(s)}>
                  {STATUS[s][1]}<span className="segn">{counts[s] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="sp" />
            <select style={{ width: 150 }} value={waiting} onChange={(e) => setWaiting(e.target.value)}>
              <option value="">Anyone</option>
              {WAITING.filter(Boolean).map((w) => (
                <option key={w} value={w}>{WAITING_LABEL[w]} ({waitingCounts[w] ?? 0})</option>
              ))}
            </select>
            <div className="search" style={{ width: 210 }}>
              <span className="mag"><Search size={14} strokeWidth={2} /></span>
              <input placeholder="Search tickets…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          <div className="card-b flush">
            <Async q={listQ} what="tickets" isEmpty={!rows.length}
              skeleton={<TableSkeleton cols={6} />}
              empty={search || status || waiting
                ? "No tickets match."
                : "No tickets yet — the first one is the hardest."}>
              <div className={"tblwrap" + (listQ.refreshing ? " refreshing" : "")}>
                <table>
                  <thead>
                    <tr><th>#</th><th>Title</th><th>Raised by</th><th>Area</th>
                      <th>Waiting on</th><th>Status</th><th /></tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => {
                      const [kind, label] = STATUS[t.status] || ["mut", t.status];
                      return (
                        <tr key={t.id}>
                          <td className="num">{t.id}</td>
                          <td style={{ maxWidth: 420 }}>
                            <b>{t.title}</b>
                            {t.detail && (
                              <div style={{ color: "var(--ink-3)", fontSize: 12, marginTop: 2 }}>
                                {t.detail.length > 110 ? <Tip text={t.detail}>{trunc(t.detail, 110)}</Tip> : t.detail}
                              </div>
                            )}
                            {t.solution && (
                              <div style={{ color: "var(--due)", fontSize: 12, marginTop: 3 }}>✓ {trunc(t.solution, 90)}</div>
                            )}
                            {t.blocked_on && (
                              <div style={{ color: "var(--held)", fontSize: 12, marginTop: 3 }}>Blocked on {trunc(t.blocked_on, 60)}</div>
                            )}
                          </td>
                          <td>{t.raised_by || <span className="gap">—</span>}</td>
                          <td>{t.area ? trunc(t.area, 22) : <span className="gap">—</span>}</td>
                          <td>
                            {t.waiting_on
                              ? <Badge kind={t.waiting_on === "caleb" ? "bad" : "mut"}>{WAITING_LABEL[t.waiting_on] || t.waiting_on}</Badge>
                              : <span className="gap">not decided</span>}
                          </td>
                          <td><Badge kind={kind}><span className="pip" />{label}</Badge></td>
                          <td className="r">
                            {canAct && (
                              <button className="btn sm" onClick={() => setForm({ ...t, waiting_on: t.waiting_on || "" })}>
                                Update
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Async>
          </div>
        </div>
      </div>

      {form && <TicketDialog form={form} setForm={setForm} busy={busy} onSave={save} />}
    </>
  );
}

function TicketDialog({ form, setForm, onSave, busy }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal title={form.id ? `Ticket #${form.id}` : "Raise a ticket"}
      why={form.id ? "Every field stays editable — the journal keeps what changed."
        : "Say what you saw. Somebody will pick it up."}
      onClose={() => setForm(null)}>
      <div style={{ marginBottom: 10 }}>
        <label className="f">Title *</label>
        <input value={form.title} placeholder="What was asked for" onChange={set("title")} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label className="f">Detail</label>
        <textarea rows={3} value={form.detail || ""} placeholder="In their words, if you have them"
          onChange={set("detail")} />
      </div>
      <div className="grid">
        <div><label className="f">Raised by</label>
          <input value={form.raised_by || ""} placeholder="Who asked" onChange={set("raised_by")} /></div>
        <div><label className="f">Area</label>
          <input list="ticket-areas" value={form.area || ""} onChange={set("area")} />
          <datalist id="ticket-areas">{AREAS.map((a) => <option key={a} value={a} />)}</datalist></div>
        <div><label className="f">Status</label>
          <select value={form.status || "open"} onChange={set("status")}>
            {Object.keys(STATUS).map((s) => <option key={s} value={s}>{STATUS[s][1]}</option>)}
          </select></div>
        <div><label className="f">Who has to move it?</label>
          <select value={form.waiting_on || ""} onChange={set("waiting_on")}>
            {WAITING.map((w) => <option key={w} value={w}>{WAITING_LABEL[w]}</option>)}
          </select></div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label className="f">What was done</label>
        <textarea rows={2} value={form.solution || ""} placeholder="The actual outcome, or why not"
          onChange={set("solution")} />
      </div>
      <div style={{ marginTop: 10 }}>
        <label className="f">Waiting on</label>
        <textarea rows={2} value={form.blocked_on || ""}
          placeholder="Only when blocked — what it needs and from whom" onChange={set("blocked_on")} />
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn" onClick={() => setForm(null)}>Cancel</button>
        <button className="btn pri" disabled={!form.title?.trim() || busy}
          onClick={() => onSave({
            ...(form.id ? { id: form.id } : {}),
            title: form.title.trim(), detail: form.detail || "", raised_by: form.raised_by || "",
            area: form.area || "", status: form.status || "open", waiting_on: form.waiting_on || "",
            solution: form.solution || "", blocked_on: form.blocked_on || "",
          })}>
          {form.id ? "Save" : "Raise"}
        </button>
      </div>
    </Modal>
  );
}
