import { useEffect, useMemo, useState } from "react";
import { Search, Download, Plus, Upload, Pencil, Ban, Undo2 } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { moneyC, csvDownload, trunc, toCents, today, parseCsv, num } from "../lib/fmt.js";
import { useApi, useDebounced } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { Badge, Async, TableSkeleton, Pager, Tip, Modal, Confirm, SortTh } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";
import { useAuth } from "../lib/auth.jsx";
import FilterPanel, { apiFacet } from "../components/FilterPanel.jsx";

const LIMIT = 100;

const TITLE = { DEALER: "Dealer Rates", REP: "Sales Rep Rates" };
const SUB = {
  DEALER: "The rate cards the engine prices dealer pay from. A deal is priced by the row in force on its sale date — so these are date-effective, and an expired row still explains an old payment.",
  REP: "The rate cards that price sales-rep pay. Same in-force rule: the row that was live on the sale date is the one that applies.",
};

/**
 * Only numbers are right-aligned, so digits line up by place value. Dates and
 * text read from the left. The header and the cell MUST use this same rule —
 * aligning one and not the other is what makes a column look shuffled.
 */
const isNum = (kind) => kind === "money" || kind === "decimal" || kind === "int";

/** Which filter operators each column kind accepts, per the API contract. */
const OPS_FOR = {
  text: ["contains", "eq", "in", "blank", "not_blank"],
  date: ["eq", "from", "to", "blank", "not_blank"],
  money: ["eq", "min", "max", "blank", "not_blank"],
  decimal: ["eq", "min", "max", "blank", "not_blank"],
  int: ["eq", "min", "max", "blank", "not_blank"],
};

/**
 * Renders one cell by its declared kind.
 *
 * The critical rule: only `money` is cents. A `decimal` is a rate or a
 * percentage as an exact string — formatting 0.20/W as cents would show 20¢ and
 * turn an $820 override into $8, so decimals are printed verbatim.
 */
function Cell({ col, value }) {
  if (value === null || value === undefined || value === "") {
    return <span className="gap">—</span>;
  }
  switch (col.kind) {
    case "money": return <span className="num">{moneyC(value)}</span>;
    // Wildcards are real data on these tables: "~" matches anything, "∞" = no ceiling.
    case "decimal": return <span className="num">{String(value)}</span>;
    case "int": return <span className="num">{value}</span>;
    default: {
      const s = String(value);
      return s.length > 28 ? <Tip text={s}>{trunc(s, 28)}</Tip> : s;
    }
  }
}

/**
 * The settings registry — ten date-effective tables per rail, one tab at a time.
 *
 * The column schema arrives with the rows, so this single grid renders every
 * tab and a column added server-side appears with no client change.
 */
export default function Settings({ group }) {
  const rail = group === "REP" ? "rep" : "dealer";
  const { say } = useStore();
  const { canWrite } = useAuth();
  const mayWrite = canWrite(rail === "rep" ? "rep" : "dealer");
  const [adding, setAdding] = useState(false);
  const [editRow, setEditRow] = useState(null);      // the row object being edited
  const [voiding, setVoiding] = useState(null);      // the row awaiting void confirmation
  const [busyRow, setBusyRow] = useState(false);
  // A voided row vanishes from every list — even "show all" — so its id must be
  // captured NOW or a restore needs a database trip. This powers the Undo bar.
  const [lastVoided, setLastVoided] = useState(null); // { id, table }
  const [importing, setImporting] = useState(false);

  const [table, setTable] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState([]);
  const [sort, setSort] = useState(null);        // {column, dir}
  const [offset, setOffset] = useState(0);

  const search = useDebounced(q, 350);

  // Switching rail resets everything — the tabs and columns are different.
  useEffect(() => {
    setTable(""); setShowAll(false); setQ(""); setFilters([]); setSort(null); setOffset(0);
    setLastVoided(null);
  }, [rail]);

  const tabsQ = useApi((signal) => api.ratesSummaryFor(rail)({ signal }), [rail]);
  const tabs = tabsQ.data?.tabs || [];

  /**
   * Dealer and state options come from /payments/summary, which returns full
   * facets over the ledger.
   *
   * These are NOT the same population as the rate tables: the facets list
   * parties that have ledger lines, while a rate card exists for anyone who
   * has been priced, payments or not. In a 1,000-row sample of pay_schedule,
   * 35 of 40 dealers were absent from these facets. So the list is labelled
   * for what it is and every group keeps a free-text box, which the server
   * matches with `contains` across the whole table.
   */
  const facetsQ = useApi(
    (signal) => api.paymentSummary(
      { party_type: rail, show_zeros: true, show_all_dates: true }, { signal }),
    [rail]
  );
  const apiFacets = facetsQ.data?.facets;

  const rowsQ = useApi(
    (signal) => api.ratesFor(rail)({
      table, all: showAll, search, filters,
      sort: sort?.column, sort_dir: sort?.dir,
      limit: LIMIT, offset,
    }, { signal }),
    [rail, table, showAll, search, JSON.stringify(filters), JSON.stringify(sort), offset]
  );

  const d = rowsQ.data;
  const cols = d?.columns || [];
  const rows = d?.rows || [];
  const total = d?.total ?? 0;
  // The server echoes which tab it actually served, so the strip follows the
  // response rather than optimistic local state.
  const activeTable = d?.table || table;

  const reset = (fn) => (v) => { fn(v); setOffset(0); };
  const pick = (t) => { setTable(t); setFilters([]); setSort(null); setQ(""); setOffset(0); setLastVoided(null); };

  /**
   * Filter options. Dealer and state come from the ledger facets above; the
   * rate endpoints publish none of their own, so any other text column can
   * only offer the values on the loaded page — 100 rows of ~32,000 on
   * pay_schedule.
   *
   * Either way the group says how far its ticks actually see, and carries a
   * free-text box the server matches with `contains` across the whole table,
   * so no list is ever mistaken for the complete set.
   */
  const filterGroups = useMemo(() => {
    const partial = total > rows.length;
    // Which rate-table column each ledger facet can populate. The facets key
    // is always `dealers`, but on the rep rail it holds rep names — so it maps
    // to rep_name there and dealer here.
    const FROM_FACETS = {
      state: apiFacets?.states,
      ...(rail === "rep"
        ? { rep_name: apiFacets?.dealers }
        : { dealer: apiFacets?.dealers, sub_dealer: apiFacets?.dealers }),
    };

    return cols
      .filter((c) => c.name !== "id" && c.kind === "text")
      .slice(0, 4)
      .map((c) => {
        const facet = FROM_FACETS[c.name];
        if (facet) {
          // rep_name in the rate table often carries the dealer in brackets
          // ("Ryan Chelberg (World Energy Direct)") while the ledger holds the
          // bare name, so an exact match there finds nothing and would read as
          // "no rate card". Those ticks search instead of matching exactly.
          const loose = c.name === "rep_name";
          return {
            key: c.name, label: c.label || c.name, field: c.name, contains: true,
            loose,
            // Named for what it actually is, so a name missing from the list is
            // never read as someone without a rate card.
            note: `Names with payment activity. A ${rail === "rep" ? "rep" : "dealer"} priced but not yet paid will not be listed — use the box above.`
              + (loose ? " Names here are matched loosely, one at a time." : ""),
            options: apiFacet(facet, { sort: c.name === "state" ? "value" : "count" }),
          };
        }
        return {
          key: c.name, label: c.label || c.name, field: c.name, contains: true,
          note: partial
            ? `Ticks cover the ${rows.length} rows on this page. Use the box above to match across all ${num(total)}.`
            : undefined,
          options: [...new Set(rows.map((r) => r[c.name]).filter((v) => v !== null && v !== ""))]
            .sort().slice(0, 200)
            .map((value) => ({ value, count: rows.filter((r) => r[c.name] === value).length })),
        };
      });
  }, [cols, rows, total, apiFacets, rail]);

  // The panel speaks {key: [values]} plus {key~: text}; the API speaks filters[].
  const panelValue = useMemo(() => {
    const v = {};
    for (const g of filterGroups) {
      // A loose group stores its tick as a `contains`, so it has to be read
      // back from there or the box would not stay checked. The free-text entry
      // is whichever `contains` is not one of the offered options.
      const contains = filters.filter((f) => f.column === g.key && f.op === "contains").map((f) => f.value);
      const optionValues = new Set(g.options.map((o) => o.value));
      v[g.key] = g.loose
        ? contains.filter((x) => optionValues.has(x))
        : filters.find((f) => f.column === g.key && f.op === "in")?.values || [];
      v[`${g.key}~`] = contains.find((x) => !optionValues.has(x)) || "";
    }
    return v;
  }, [filters, filterGroups]);

  const applyPanel = (val) => {
    const next = [];
    for (const g of filterGroups) {
      const picked = val[g.key] || [];
      if (picked.length) {
        // Filters AND together and `contains` takes a single value, so a loose
        // group can only honour one tick. Extra ticks would silently return
        // nothing, so the first is applied and the rest are dropped — the panel
        // says so rather than showing an empty table.
        if (g.loose) next.push({ column: g.key, op: "contains", value: picked[0] });
        else next.push({ column: g.key, op: "in", values: picked });
      }
      const text = (val[`${g.key}~`] || "").trim();
      if (text) next.push({ column: g.key, op: "contains", value: text });
    }
    setFilters(next);
    setOffset(0);
  };
  const filterCount = filters.length;

  const toggleSort = (name) => {
    setOffset(0);
    setSort((s) => s?.column !== name ? { column: name, dir: "asc" }
      : s.dir === "asc" ? { column: name, dir: "desc" }
      : null);
  };

  function exportCsv() {
    const header = cols.map((c) => c.label || c.name);
    const body = rows.map((r) => cols.map((c) => {
      const v = r[c.name];
      if (v === null || v === undefined) return "";
      return c.kind === "money" ? (v / 100).toFixed(2) : String(v);
    }));
    csvDownload(`${rail} ${activeTable}`, header, body)
      ? say(`Exported ${rows.length} rows (this page)`)
      : say("Nothing to export", true);
  }

  const mayEdit = !!(mayWrite && d && !d.readonly);

  async function doVoid(r) {
    setBusyRow(true);
    try {
      await api.rateRowVoid(rail, activeTable, r.id);
      // Captured before the reload wipes the row from every list — the undo
      // bar is the only place the id survives.
      setLastVoided({ id: r.id, table: activeTable });
      say(`Row ${r.id} voided — it no longer prices anything`);
      rowsQ.reload(); tabsQ.reload();
    } catch (e) { say(e.message, true); }
    setBusyRow(false);
    setVoiding(null);
  }

  async function undoVoid() {
    setBusyRow(true);
    try {
      await api.rateRowRestore(rail, lastVoided.table, lastVoided.id);
      say(`Row ${lastVoided.id} restored`);
      setLastVoided(null);
      rowsQ.reload(); tabsQ.reload();
    } catch (e) { say(e.message, true); }
    setBusyRow(false);
  }

  const countLine = rowsQ.loading ? "loading…" : rowsQ.error ? "—"
    : `${num(total)} row${total === 1 ? "" : "s"}`
      + (d?.active_only ? ` in force on ${d.as_of}` : " (incl. expired)");

  return (
    <>
      <PageHead eyebrow="Rate cards" title={TITLE[group]} count={countLine}>
        <button className="btn" onClick={exportCsv} disabled={!rows.length}>
          <Download size={14} strokeWidth={2} />Export CSV
        </button>
      </PageHead>

      <div className="pagebody">
        <div className="sub">{SUB[group]}</div>

        {/* Tab strip. Badges count non-voided rows and are NOT date-filtered, so
            a badge and the footer legitimately differ when "show all" is off. */}
        <div className="tiles" style={{ marginBottom: 16 }}>
          {tabsQ.loading && Array.from({ length: 10 }, (_, i) => (
            <div className="tile" key={i}><span className="sk" style={{ width: 100 }} /></div>
          ))}
          {tabs.map((t) => (
            <button key={t.table} className={"tile" + (t.table === activeTable ? " on" : "")}
              onClick={() => pick(t.table)}>
              <div className="t">
                {t.label}
                {t.no_sheet_source && <Tip text="Introduced by the app — never in SETTINGS.xlsx."> ★</Tip>}
              </div>
              <div className="c">
                {t.count === null ? "–" : `${num(t.count)} rows`}
                {t.readonly && " · read-only"}
              </div>
            </button>
          ))}
        </div>

        <div className="card">
          <div className="card-h">
            <h2>{d?.label || "Rows"}</h2>
            {d?.readonly && <Badge kind="mut">read-only</Badge>}
            {/* Writes are per-screen permissions, and the legacy archive
                refuses inserts — the button only exists where a row can land. */}
            {mayWrite && d && !d.readonly && (<>
              <button className="btn sm" onClick={() => setImporting(true)}>
                <Upload size={13} strokeWidth={2} />Bulk import
              </button>
              <button className="btn sm pri" onClick={() => setAdding(true)}>
                <Plus size={13} strokeWidth={2} />Add row
              </button>
            </>)}
            <div className="sp" />
            <label className="row" style={{ gap: 5, fontSize: 12.5, color: "var(--ink-3)" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={showAll}
                onChange={(e) => reset(setShowAll)(e.target.checked)} />
              <Tip text="Drops the effective-date filter, revealing expired and future-dated rows. Voided rows are never shown.">
                show all (incl. expired)
              </Tip>
            </label>
            <FilterPanel groups={filterGroups} value={panelValue} onApply={applyPanel}
              count={filterCount} disabled={!rows.length}
              disabledReason={rowsQ.error ? "Rows could not be loaded, so there is nothing to filter."
                : rowsQ.loading ? "Loading rows…" : "No rows to filter."} />
            <div className="search" style={{ width: 210 }}>
              <span className="mag"><Search size={14} strokeWidth={2} /></span>
              {/* Search here matches TEXT columns only — unlike the money screens. */}
              <input placeholder="Search text columns…" value={q}
                onChange={(e) => reset(setQ)(e.target.value)} />
            </div>
          </div>

          <div className="card-b flush">
            {/* The undo window. A voided row is invisible to every list — even
                "show all" — so once this bar is dismissed a restore needs the
                id from the database. That is why it names the id out loud. */}
            {lastVoided && lastVoided.table === activeTable && (
              <div className="row" style={{ padding: "8px 14px", borderBottom: "1px solid var(--line)", fontSize: 12.5, color: "var(--ink-2)", gap: 8 }}>
                <span>Row {lastVoided.id} voided. It is hidden from every list, so this bar is the way back.</span>
                <button className="btn sm" disabled={busyRow} onClick={undoVoid}>
                  <Undo2 size={12} strokeWidth={2} />Undo
                </button>
                <button className="btn sm gho" onClick={() => setLastVoided(null)}>Dismiss</button>
              </div>
            )}
            <Async q={rowsQ} what="these settings" isEmpty={!rows.length}
              skeleton={<TableSkeleton cols={8} />}
              empty={search || filterCount
                ? "No rows match that search or those filters."
                : showAll ? "No rows in this table."
                : `No rows in force on ${d?.as_of || "today"} — tick "show all" to include expired.`}>
              <div className={"tblwrap" + (rowsQ.refreshing ? " refreshing" : "")}>
                <table>
                  <thead>
                    <tr>
                      {/* SortTh speaks {k, dir}; this page's state is
                          {column, dir} because that is what the API takes —
                          so it is adapted here rather than renamed. Using the
                          shared header means every column shows the ↕ hint,
                          not just the one already sorted. */}
                      {cols.map((c) => (
                        <SortTh key={c.name} k={c.name} onSort={toggleSort}
                          sort={sort ? { k: sort.column, dir: sort.dir } : null}
                          className={isNum(c.kind) ? "r" : ""}>
                          {c.label || c.name}
                        </SortTh>
                      ))}
                      {mayEdit && <th className="r" style={{ width: 1 }} aria-label="Actions" />}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        {cols.map((c) => (
                          <td key={c.name} className={isNum(c.kind) ? "r" : ""}>
                            <Cell col={c} value={r[c.name]} />
                          </td>
                        ))}
                        {mayEdit && (
                          <td className="r" style={{ whiteSpace: "nowrap" }}>
                            <Tip text="Edit this row — only the cells you change are sent.">
                              <button className="btn sm gho" onClick={() => setEditRow(r)} aria-label={`Edit row ${r.id}`}>
                                <Pencil size={12} strokeWidth={2} />
                              </button>
                            </Tip>
                            <Tip text="Void (retire) this row — it stops pricing deals but stays in the table, restorable.">
                              <button className="btn sm gho" onClick={() => setVoiding(r)} aria-label={`Void row ${r.id}`}>
                                <Ban size={12} strokeWidth={2} />
                              </button>
                            </Tip>
                          </td>
                        )}
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

      {importing && d && (
        <BulkImportDialog rail={rail} table={activeTable} label={d.label} cols={cols}
          onClose={() => setImporting(false)}
          onDone={(n, skipped) => {
            setImporting(false);
            // inserted 0 + skips means the server's "every row already exists".
            say(n
              ? `${num(n)} row${n === 1 ? "" : "s"} imported into ${d.label}`
                + (skipped ? ` · ${num(skipped)} duplicate${skipped === 1 ? "" : "s"} skipped` : "")
              : "Every row in that file already exists — nothing was added.", !n);
            rowsQ.reload(); tabsQ.reload();
          }} />
      )}

      {(adding || editRow) && d && (
        <RowDialog key={editRow ? `edit-${editRow.id}` : "add"}
          rail={rail} table={activeTable} label={d.label} cols={cols} existing={editRow}
          onClose={() => { setAdding(false); setEditRow(null); }}
          onSaved={(id) => {
            const was = !!editRow;
            setAdding(false); setEditRow(null);
            say(was ? `Row ${id} updated` : `Row ${id} added to ${d.label}`);
            rowsQ.reload(); tabsQ.reload();
          }} />
      )}

      {voiding && (
        <Confirm danger title={`Void row ${voiding.id}?`}
          confirmLabel={busyRow ? "Voiding…" : "Void row"}
          body={`Voiding retires the row: it disappears from this grid and from the engine's rate matching, but stays in the table with who voided it and when. An Undo appears right after — once dismissed, restoring needs the id (${voiding.id}).`}
          onYes={() => doVoid(voiding)} onNo={() => setVoiding(null)} />
      )}
    </>
  );
}

/**
 * One form for add AND edit, built entirely from the list response's
 * `columns[]` — the schema travels with the data, so a column added
 * server-side appears here with no client change. `required` marks what the
 * write endpoints refuse to leave blank; `choices` is a closed set and renders
 * as a dropdown.
 *
 * Adding: anything left empty is NOT sent — on these tables blank stores NULL
 * and NULL is load-bearing (a blank m2_pct means the classic two-stage
 * ladder), so an empty string must never reach the wire.
 *
 * Editing (`existing` set): the PUT is PARTIAL — only cells that differ from
 * the loaded row are sent. A cell emptied on purpose goes as "" to clear it to
 * NULL; a cell never touched is absent and keeps its stored value. The two are
 * different things on the wire, which is why the diff matters.
 */
function RowDialog({ rail, table, label, cols, existing, onClose, onSaved }) {
  const editing = !!existing;
  // id/void/audit columns are set by the service and refused if sent.
  const fields = cols.filter((c) => !["id", "void", "updated_by", "updated_at"].includes(c.name));
  // The loaded row, rendered back into the form's own dialect: money as
  // dollars (the form parses dollars), everything else verbatim. Held in state
  // so the diff below compares against what the form STARTED with, not
  // whatever a re-render recomputes.
  const [initial] = useState(() => {
    if (!editing) return { start_date: today() };
    const v = {};
    for (const c of fields) {
      const cur = existing[c.name];
      if (cur === null || cur === undefined) { v[c.name] = ""; continue; }
      v[c.name] = c.kind === "money" ? (cur / 100).toFixed(2) : String(cur);
    }
    return v;
  });
  const [vals, setVals] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (name) => (e) => { setVals((v) => ({ ...v, [name]: e.target.value })); setError(""); };
  const isRequired = (c) => c.required === true || c.name === "start_date";

  // What is missing or malformed, checked the way the server will.
  const problems = [];
  for (const c of fields) {
    const raw = (vals[c.name] ?? "").toString().trim();
    if (isRequired(c) && raw === "") problems.push(`${c.label || c.name} is required`);
    else if (raw !== "" && c.kind === "money" && toCents(raw) === null) problems.push(`${c.label || c.name} is not a valid amount`);
    else if (raw !== "" && c.kind === "int" && !/^\d+$/.test(raw)) problems.push(`${c.label || c.name} must be a whole number`);
  }
  // Checked against the row as it WILL be — the form holds every cell, stored
  // values included, so this mirrors the server's overlay rule.
  if ((vals.end_date || "") !== "" && vals.end_date < (vals.start_date || "")) {
    problems.push("End date cannot be before the start date");
  }

  // The edit payload: only what changed. Recomputed per render so the Save
  // button can disable itself when there is nothing to save.
  const changed = {};
  if (editing) {
    for (const c of fields) {
      const raw = (vals[c.name] ?? "").toString().trim();
      if (raw === (initial[c.name] ?? "").toString().trim()) continue;
      if (raw === "") { changed[c.name] = ""; continue; }        // cleared → NULL
      if (c.kind === "money") changed[c.name] = toCents(raw);
      else if (c.kind === "int") changed[c.name] = parseInt(raw, 10);
      else changed[c.name] = raw;                                // text/date/decimal verbatim
    }
  }
  const nothingChanged = editing && Object.keys(changed).length === 0;

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (editing) {
        await api.rateRowEdit(rail, table, existing.id, changed);
        onSaved(existing.id);
      } else {
        const row = {};
        for (const c of fields) {
          const raw = (vals[c.name] ?? "").toString().trim();
          if (raw === "") continue;                  // omitted → stored NULL
          if (c.kind === "money") row[c.name] = toCents(raw);   // integer cents on the wire
          else if (c.kind === "int") row[c.name] = parseInt(raw, 10);
          else row[c.name] = raw;                    // text/date/decimal verbatim
        }
        const res = await api.rateRowCreate(rail, table, row);
        onSaved(res?.id);
      }
    } catch (e) {
      // The 400 names the offending field — show it as-is.
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal wide title={editing ? `Edit row ${existing.id} — ${label}` : `Add a row — ${label}`}
      why={editing
        ? "Only the cells you change are sent — everything else keeps its stored value. Emptying a cell clears it to blank (NULL), which is meaningful on these tables, not zero."
        : "Effective from its start date. Anything left blank stays blank — on these tables an empty cell is meaningful, not zero."}
      onClose={onClose}
      footer={<>
        {(problems.length > 0 || error) && (
          <span className="submeta" style={{ color: "var(--held)", marginRight: "auto" }}>
            {error || `${problems[0]}.`}
          </span>
        )}
        {editing && nothingChanged && !problems.length && !error && (
          <span className="submeta" style={{ marginRight: "auto" }}>Nothing changed yet.</span>
        )}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={problems.length > 0 || busy || nothingChanged} onClick={save}>
          {busy ? "Saving…" : editing ? "Save changes" : "Add row"}
        </button>
      </>}>
      <div className="grid">
        {fields.map((c) => (
          <div key={c.name}>
            <label className="f">
              {c.label || c.name}{isRequired(c) ? " *" : ""}
              {c.kind === "money" && <span className="submeta" style={{ display: "inline" }}> ($)</span>}
            </label>
            {Array.isArray(c.choices) && c.choices.length ? (
              <select value={vals[c.name] ?? ""} onChange={set(c.name)}>
                <option value="">—</option>
                {c.choices.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : c.kind === "date" ? (
              <input type="date" value={vals[c.name] ?? ""} onChange={set(c.name)} />
            ) : c.kind === "money" ? (
              <input inputMode="decimal" placeholder="e.g. 4,000.00" value={vals[c.name] ?? ""} onChange={set(c.name)} />
            ) : c.kind === "int" ? (
              <input inputMode="numeric" placeholder="whole number" value={vals[c.name] ?? ""} onChange={set(c.name)} />
            ) : c.kind === "decimal" ? (
              // A rate or a percentage — sent verbatim, never converted to cents.
              <input inputMode="decimal" placeholder="e.g. 1.8" value={vals[c.name] ?? ""} onChange={set(c.name)} />
            ) : (
              <input value={vals[c.name] ?? ""} onChange={set(c.name)} />
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}


/**
 * Bulk import — CSV in, schema-validated preview, then one atomic import call.
 *
 * The server's /rows/import is all-or-nothing per request: every row is
 * validated first and nothing is written unless all pass. Rows identical to an
 * existing row are skipped, never re-inserted, so re-sending a file after a
 * failure is safe. Files beyond the server's caps (2,000 rows / 1 MiB body)
 * are sent in chunks — each chunk atomic, later chunks protected by the
 * duplicate skip.
 *
 * The client-side gate stays even though the server would refuse anyway: it
 * catches every problem before a byte is sent, in the same pass, without
 * burning a round-trip per attempt. Each row is stamped with `__line` — its
 * line in the actual file — so a server-side refusal names lines the uploader
 * can find, not array indexes.
 */
function BulkImportDialog({ rail, table, label, cols, onClose, onDone }) {
  const fields = cols.filter((c) => !["id", "void", "updated_by", "updated_at"].includes(c.name));
  const byKey = new Map();
  for (const c of fields) {
    byKey.set(c.name.toLowerCase(), c);
    if (c.label) byKey.set(String(c.label).toLowerCase(), c);
  }

  const [text, setText] = useState("");
  const [phase, setPhase] = useState("edit");        // edit | busy | failed
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failure, setFailure] = useState(null);      // { message, report, inserted, skipped }

  /** Header-only template, named for the tab. Headers are wire names. */
  function template() {
    const head = fields.map((c) => c.name).join(",") + "\n";
    const url = URL.createObjectURL(new Blob([head], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${table} template.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setText(String(r.result || ""));
    r.readAsText(f);
    e.target.value = "";
  }

  // Parse + validate, recomputed as the text changes.
  const parsed = (() => {
    const t = text.trim();
    if (!t) return null;
    const grid = parseCsv(t);
    if (grid.length < 2) return { fatal: "Need a header row and at least one data row." };

    const heads = grid[0].map((h) => h.trim());
    const mapped = heads.map((h) => byKey.get(h.toLowerCase()) || null);
    const unknown = heads.filter((h, i) => h !== "" && !mapped[i]);
    if (unknown.length) {
      return { fatal: `Unknown column${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. Valid: ${fields.map((c) => c.name).join(", ")}.` };
    }

    const isRequired = (c) => c.required === true || c.name === "start_date";
    const missing = fields.filter((c) => isRequired(c) && !mapped.some((m) => m?.name === c.name));
    if (missing.length) {
      return { fatal: `The sheet is missing required column${missing.length > 1 ? "s" : ""}: ${missing.map((c) => c.name).join(", ")}.` };
    }

    const rows = grid.slice(1).map((cells, idx) => {
      const row = {}; const errs = [];
      mapped.forEach((c, i) => {
        if (!c) return;
        const raw = (cells[i] ?? "").trim();
        if (raw === "") {
          if (isRequired(c)) errs.push(`${c.name} is required`);
          return;                                    // blank -> omitted -> NULL
        }
        if (c.kind === "money") {
          const cents = toCents(raw);
          if (cents === null) errs.push(`${c.name}: "${raw}" is not an amount`);
          else row[c.name] = cents;
        } else if (c.kind === "int") {
          if (!/^\d+$/.test(raw)) errs.push(`${c.name}: "${raw}" is not a whole number`);
          else row[c.name] = parseInt(raw, 10);
        } else if (c.kind === "date") {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) errs.push(`${c.name}: dates are YYYY-MM-DD`);
          else row[c.name] = raw;
        } else if (Array.isArray(c.choices) && c.choices.length
            && !c.choices.some((o) => o.toLowerCase() === raw.toLowerCase())) {
          errs.push(`${c.name}: "${raw}" is not one of ${c.choices.join("/")}`);
        } else {
          row[c.name] = raw;                        // text / decimal verbatim
        }
      });
      if (row.end_date && row.start_date && row.end_date < row.start_date) {
        errs.push("end_date is before start_date");
      }
      return { n: idx + 2, row, errs };             // n = line number in the sheet
    });

    const bad = rows.filter((r) => r.errs.length);
    return { rows, bad };
  })();

  async function submit() {
    setPhase("busy");
    // `__line` = the row's line in the pasted/uploaded file, so a server-side
    // error report names lines the uploader can actually find.
    const wire = parsed.rows.map((r) => ({ ...r.row, __line: r.n }));

    // Chunk at the server's caps: 2,000 rows and 1 MiB per request (900 KB
    // here, leaving headroom for the envelope). Nearly every file is 1 chunk.
    const chunks = [];
    let cur = [], size = 0;
    for (const w of wire) {
      const s = JSON.stringify(w).length + 1;
      if (cur.length && (cur.length >= 2000 || size + s > 900_000)) { chunks.push(cur); cur = []; size = 0; }
      cur.push(w); size += s;
    }
    if (cur.length) chunks.push(cur);
    setProgress({ done: 0, total: chunks.length });

    let inserted = 0, skipped = 0;
    for (let i = 0; i < chunks.length; i++) {
      setProgress({ done: i, total: chunks.length });
      try {
        const res = await api.rateRowsImport(rail, table, chunks[i]);
        inserted += res?.inserted ?? 0;
        skipped += (res?.skipped_existing ?? 0) + (res?.skipped_in_file ?? 0);
      } catch (e) {
        // This chunk wrote NOTHING — the import is one transaction. Earlier
        // chunks are in, but a re-send skips them as exact duplicates, so the
        // fix is: correct the sheet, import the whole file again.
        setFailure({ message: e.message, report: e.body?.data || null, inserted, skipped });
        setPhase("failed");
        return;
      }
    }
    onDone(inserted, skipped);
  }

  const canImport = phase === "edit" && parsed && !parsed.fatal && parsed.rows.length > 0 && parsed.bad.length === 0;

  return (
    <Modal wide title={`Bulk import — ${label}`}
      why="Paste or upload a CSV whose headers are the column names below (the template has them). Blank cells stay blank — on these tables an empty cell is meaningful, not zero."
      onClose={phase === "busy" ? () => {} : onClose}
      footer={<>
        {phase === "edit" && parsed && !parsed.fatal && (
          <span className="submeta" style={{ marginRight: "auto", color: parsed.bad.length ? "var(--held)" : "var(--ink-3)" }}>
            {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"}
            {parsed.bad.length ? ` — ${parsed.bad.length} with problems; fix or remove them to import` : " — all valid"}
          </span>
        )}
        {phase === "busy" && (
          <span className="submeta" style={{ marginRight: "auto" }}>
            {progress.total > 1
              ? `Importing — part ${progress.done + 1} of ${progress.total}…`
              : `Importing ${parsed?.rows.length ?? 0} rows…`}
          </span>
        )}
        <button className="btn" disabled={phase === "busy"} onClick={onClose}>
          {phase === "failed" ? "Close" : "Cancel"}
        </button>
        <button className="btn pri" disabled={!canImport} onClick={submit}>
          {phase === "busy" ? "Importing…" : "Import"}
        </button>
      </>}>

      {phase === "failed" && failure && (
        <div className="errstate" style={{ textAlign: "left", padding: "12px 14px", background: "var(--held-bg)", borderRadius: 10, marginBottom: 14 }}>
          {/* The server's headline, verbatim: "37 rows rejected — nothing was written". */}
          <div className="errstate-h" style={{ marginBottom: 3 }}>{failure.message}</div>
          <div className="errstate-m" style={{ margin: 0 }}>
            {failure.inserted > 0
              ? `The ${num(failure.inserted)} rows from earlier parts are already in. Fix the lines below and re-import the whole file — rows already added are skipped as duplicates, never doubled.`
              : "Nothing was written. Fix the lines below and import again."}
            {failure.report?.hint ? ` ${failure.report.hint}` : ""}
          </div>
          {failure.report?.errors?.length > 0 && (
            <div className="tblwrap" style={{ maxHeight: 180, marginTop: 10 }}>
              <table>
                <thead><tr><th>Sheet line</th><th>What the server refused</th></tr></thead>
                <tbody>
                  {failure.report.errors.map((e, i) => (
                    <tr key={i}><td className="num">{e.row}</td><td style={{ color: "var(--held)" }}>{e.error}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {failure.report?.capped && (
            <div className="submeta" style={{ marginTop: 6 }}>
              The scan stopped at 100 errors — fixing these may reveal more on the next attempt.
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ marginBottom: 10, gap: 8 }}>
        <button className="btn sm" onClick={template}><Download size={13} strokeWidth={2} />Download template</button>
        <label className="btn sm" style={{ cursor: "pointer" }}>
          <Upload size={13} strokeWidth={2} />Choose CSV file
          <input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={onFile} />
        </label>
      </div>

      <textarea rows={8} value={text} disabled={phase === "busy"}
        placeholder={"Paste CSV here — first row is the headers, e.g.\n" + fields.slice(0, 5).map((c) => c.name).join(",") + ",…"}
        onChange={(e) => { setText(e.target.value); setPhase("edit"); setFailure(null); }}
        style={{ fontFamily: "var(--mono)", fontSize: 12 }} />

      {parsed?.fatal && (
        <div className="submeta" style={{ color: "var(--held)", marginTop: 8 }}>{parsed.fatal}</div>
      )}

      {parsed && !parsed.fatal && parsed.bad.length > 0 && (
        <>
          <div className="sect">Problems</div>
          <div className="tblwrap" style={{ maxHeight: 180 }}>
            <table>
              <thead><tr><th>Sheet line</th><th>What is wrong</th></tr></thead>
              <tbody>
                {parsed.bad.slice(0, 20).map((r) => (
                  <tr key={r.n}><td className="num">{r.n}</td><td style={{ color: "var(--held)" }}>{r.errs.join("; ")}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.bad.length > 20 && <div className="submeta" style={{ marginTop: 6 }}>…and {parsed.bad.length - 20} more.</div>}
        </>
      )}

      {parsed && !parsed.fatal && parsed.bad.length === 0 && parsed.rows.length > 0 && (
        <>
          <div className="sect">Preview — first {Math.min(5, parsed.rows.length)} of {parsed.rows.length}</div>
          <div className="tblwrap" style={{ maxHeight: 200 }}>
            <table>
              <thead><tr>{fields.filter((c) => parsed.rows.some((r) => c.name in r.row)).map((c) => (
                <th key={c.name}>{c.label || c.name}</th>
              ))}</tr></thead>
              <tbody>
                {parsed.rows.slice(0, 5).map((r) => (
                  <tr key={r.n}>
                    {fields.filter((c) => parsed.rows.some((x) => c.name in x.row)).map((c) => (
                      <td key={c.name} className={isNum(c.kind) ? "r" : ""}><Cell col={c} value={r.row[c.name]} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
