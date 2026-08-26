import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { csvDownload } from "../lib/fmt.js";
import { Badge, Empty, Modal } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";
import FilterPanel, { facet, activeCount, passesFilter } from "../components/FilterPanel.jsx";

const FILTER_GROUPS = [
  { key: "area", label: "Area", field: "area" },
  { key: "raised_by", label: "Raised by", field: "raised_by" },
  { key: "waiting_on", label: "Waiting on", field: (t) => (t.waiting_on === "team" ? "someone else" : t.waiting_on) },
];
const FILTER_DATE = { key: "date", label: "Created", field: "created_at" };

const STATUS = { open: ["Open", "blue"], building: ["Building", "blue"], blocked: ["Blocked", "bad"], shipped: ["Shipped", "ok"], wont_do: ["Won't do", "mut"] };
const LIVE = new Set(["open", "building", "blocked"]);
const AREAS = ["Pay", "Rates", "Data", "Access", "Reporting"];
const WAITING = ["", "caleb", "claude", "team"];
const WAITING_LABEL = { "": "Not decided", caleb: "Caleb", claude: "Claude", team: "Someone else" };

export default function Tickets() {
  const { tickets, dispatch, say } = useStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("live");
  const [form, setForm] = useState(null);
  const [filter, setFilter] = useState({ area: [], raised_by: [], waiting_on: [], dateFrom: "", dateTo: "" });

  const rows = useMemo(() => tickets.filter((t) => {
    if (status === "live" && !LIVE.has(t.status)) return false;
    if (status !== "live" && status !== "all" && t.status !== status) return false;
    if (!passesFilter(t, filter, FILTER_GROUPS, FILTER_DATE)) return false;
    if (!q) return true;
    const hay = [t.id, t.title, t.detail, t.raised_by, t.area, t.solution, t.blocked_on, t.waiting_on].join(" ").toLowerCase();
    return hay.includes(q.toLowerCase());
  }), [tickets, q, status, filter]);

  const filterGroupsWithOptions = useMemo(
    () => FILTER_GROUPS.map((g) => ({ ...g, options: facet(tickets, g.field) })),
    [tickets]
  );
  const filterCount = activeCount(filter, FILTER_GROUPS, FILTER_DATE);

  function exportCsv() {
    const header = ["#", "Title", "Raised by", "Area", "Status", "Waiting on", "What was done", "Blocked on", "Created"];
    const body = rows.map((t) => [t.id, t.title, t.raised_by, t.area, t.status, t.waiting_on || "", t.solution || "", t.blocked_on || "", t.created_at]);
    csvDownload("tickets", header, body) ? say("Exported") : say("Nothing to export", true);
  }

  return (
    <>
      <PageHead title="Tickets" count={`${rows.length} shown`}>
        <button className="btn" onClick={exportCsv}><Download size={14} strokeWidth={2} />Export CSV</button>
        <button className="btn pri" onClick={() => setForm({
          title: "", detail: "", raised_by: "", area: "Pay",
          status: "open", waiting_on: "", solution: "", blocked_on: "",
        })}>Raise a ticket</button>
      </PageHead>

      <div className="pagebody">
      <div className="sub">
        What the team has raised about this tool, and what came of it. A request stops
        living in a chat thread — who asked, what was done, and whether it is finished.
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <input style={{ maxWidth: 280 }} placeholder="Search tickets…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select style={{ width: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="live">Live (open + building + blocked)</option>
          <option value="all">Everything</option>
          {Object.keys(STATUS).map((s) => <option key={s} value={s}>{STATUS[s][0]}</option>)}
        </select>
        <FilterPanel groups={filterGroupsWithOptions} dateRange={FILTER_DATE}
          value={filter} onApply={setFilter} count={filterCount} />
      </div>

      <div className="card">
        {rows.length === 0 ? <Empty>No tickets match.</Empty> : (
          <div className="tblwrap">
            <table>
              <thead><tr><th>#</th><th>Title</th><th>Raised by</th><th>Area</th><th>Waiting on</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td className="num">{t.id}</td>
                    <td>
                      <b>{t.title}</b>
                      {t.detail && <div style={{ color: "var(--ink-3)", fontSize: 12, marginTop: 2 }}>{t.detail}</div>}
                      {t.solution && <div style={{ color: "var(--ok)", fontSize: 12, marginTop: 3 }}>✓ {t.solution}</div>}
                      {t.blocked_on && <div style={{ color: "var(--bad)", fontSize: 12, marginTop: 3 }}>Blocked on {t.blocked_on}</div>}
                    </td>
                    <td>{t.raised_by}</td>
                    <td>{t.area}</td>
                    <td>{t.waiting_on ? <Badge kind={t.waiting_on === "caleb" ? "bad" : "mut"}>{t.waiting_on === "team" ? "someone else" : t.waiting_on}</Badge>
                      : <span style={{ color: "var(--ink-3)", fontStyle: "italic" }}>not decided</span>}</td>
                    <td><Badge kind={STATUS[t.status]?.[1] || "mut"}>{STATUS[t.status]?.[0] || t.status}</Badge></td>
                    <td className="r"><button className="btn sm" onClick={() => setForm({ ...t })}>Update</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form && (
        <Modal title={form.id ? `Ticket #${form.id}` : "Raise a ticket"}
          why={form.id ? "Every field stays editable — the journal keeps what changed." : "Say what you saw. Somebody will pick it up."}
          onClose={() => setForm(null)}>
          <div style={{ marginBottom: 10 }}>
            <label className="f">Title</label>
            <input value={form.title} placeholder="What was asked for"
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label className="f">Detail</label>
            <textarea rows={3} value={form.detail || ""} placeholder="In their words, if you have them"
              onChange={(e) => setForm({ ...form, detail: e.target.value })} />
          </div>
          <div className="grid">
            <div><label className="f">Raised by</label>
              <input value={form.raised_by || ""} placeholder="Who asked"
                onChange={(e) => setForm({ ...form, raised_by: e.target.value })} /></div>
            <div><label className="f">Area</label>
              <select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
                {AREAS.map((a) => <option key={a}>{a}</option>)}
              </select></div>
            <div><label className="f">Status</label>
              <select value={form.status || "open"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {Object.keys(STATUS).map((s) => <option key={s} value={s}>{STATUS[s][0]}</option>)}
              </select></div>
            <div><label className="f">Who has to move it?</label>
              <select value={form.waiting_on || ""} onChange={(e) => setForm({ ...form, waiting_on: e.target.value })}>
                {WAITING.map((w) => <option key={w} value={w}>{WAITING_LABEL[w]}</option>)}
              </select></div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="f">What was done</label>
            <textarea rows={2} value={form.solution || ""} placeholder="The actual outcome, or why not"
              onChange={(e) => setForm({ ...form, solution: e.target.value })} />
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="f">Waiting on</label>
            <textarea rows={2} value={form.blocked_on || ""}
              placeholder="Only when blocked — what it needs and from whom"
              onChange={(e) => setForm({ ...form, blocked_on: e.target.value })} />
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn pri" disabled={!form.title.trim()}
              onClick={() => { dispatch({ type: "ticket-save", row: form }); setForm(null); say(form.id ? "Ticket updated" : "Ticket raised"); }}>
              {form.id ? "Save" : "Raise"}
            </button>
          </div>
        </Modal>
      )}
      </div>
    </>
  );
}
