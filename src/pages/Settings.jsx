import { useEffect, useMemo, useState } from "react";
import { Search, Download, ArrowUp, ArrowDown, Plus, Upload } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { moneyC, csvDownload, trunc, toCents, today, parseCsv } from "../lib/fmt.js";
import { useApi, useDebounced } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { Badge, Async, TableSkeleton, Pager, Tip, Modal } from "../components/ui.jsx";
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
  const pick = (t) => { setTable(t); setFilters([]); setSort(null); setQ(""); setOffset(0); };

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
            ? `Ticks cover the ${rows.length} rows on this page. Use the box above to match across all ${total.toLocaleString()}.`
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

  const countLine = rowsQ.loading ? "loading…" : rowsQ.error ? "—"
    : `${total.toLocaleString()} row${total === 1 ? "" : "s"}`
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
                {t.count === null ? "–" : `${t.count.toLocaleString()} rows`}
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
                      {cols.map((c) => {
                        const on = sort?.column === c.name;
                        return (
                          <th key={c.name} onClick={() => toggleSort(c.name)}
                            className={isNum(c.kind) ? "r" : ""}
                            style={{ cursor: "pointer", whiteSpace: "nowrap" }}
                            title={`Sort by ${c.label || c.name}`}>
                            {c.label || c.name}
                            {on && (sort.dir === "asc"
                              ? <ArrowUp size={11} style={{ marginLeft: 4, verticalAlign: -1 }} />
                              : <ArrowDown size={11} style={{ marginLeft: 4, verticalAlign: -1 }} />)}
                          </th>
                        );
                      })}
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
          onDone={(n) => { setImporting(false); say(`${n} row${n === 1 ? "" : "s"} imported into ${d.label}`); rowsQ.reload(); tabsQ.reload(); }} />
      )}

      {adding && d && (
        <AddRowDialog rail={rail} table={activeTable} label={d.label} cols={cols}
          onClose={() => setAdding(false)}
          onSaved={(id) => { setAdding(false); say(`Row ${id} added to ${d.label}`); rowsQ.reload(); tabsQ.reload(); }} />
      )}
    </>
  );
}

/**
 * The Add-row form, built entirely from the list response's `columns[]` — the
 * schema travels with the data, so a column added server-side appears here
 * with no client change. `required` marks what the create endpoint refuses to
 * leave blank; `choices` is a closed set and renders as a dropdown.
 *
 * Anything left empty is NOT sent: on these tables blank stores NULL and NULL
 * is load-bearing (a blank m2_pct means the classic two-stage ladder), so an
 * empty string must never reach the wire.
 */
function AddRowDialog({ rail, table, label, cols, onClose, onSaved }) {
  // id/void/audit columns are set by the service and refused if sent.
  const fields = cols.filter((c) => !["id", "void", "updated_by", "updated_at"].includes(c.name));
  const [vals, setVals] = useState(() => ({ start_date: today() }));
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
  if ((vals.end_date || "") !== "" && vals.end_date < (vals.start_date || "")) {
    problems.push("End date cannot be before the start date");
  }

  async function save() {
    setBusy(true);
    setError("");
    const row = {};
    for (const c of fields) {
      const raw = (vals[c.name] ?? "").toString().trim();
      if (raw === "") continue;                    // omitted → stored NULL
      if (c.kind === "money") row[c.name] = toCents(raw);   // integer cents on the wire
      else if (c.kind === "int") row[c.name] = parseInt(raw, 10);
      else row[c.name] = raw;                      // text/date/decimal verbatim
    }
    try {
      const res = await api.rateRowCreate(rail, table, row);
      onSaved(res?.id);
    } catch (e) {
      // The 400 names the offending field — show it as-is.
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal wide title={`Add a row — ${label}`}
      why="Effective from its start date. Anything left blank stays blank — on these tables an empty cell is meaningful, not zero."
      onClose={onClose}
      footer={<>
        {(problems.length > 0 || error) && (
          <span className="submeta" style={{ color: "var(--held)", marginRight: "auto" }}>
            {error || `${problems[0]}.`}
          </span>
        )}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={problems.length > 0 || busy} onClick={save}>
          {busy ? "Adding…" : "Add row"}
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
 * Bulk import — CSV in, schema-validated preview, then import.
 *
 * There is no bulk endpoint (every variant 404s, and /rows rejects an array),
 * so this posts through the single-row endpoint one request per row, with
 * progress. When a real bulk endpoint ships, only submit() changes.
 *
 * The gate is strict: nothing is sent until EVERY row validates. These tables
 * are append-only with no delete, so a half-imported sheet cannot be rolled
 * back — better to refuse up front than to leave someone with 60 of 120 rows
 * in and no way to unwind.
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
  const [failure, setFailure] = useState(null);      // { rowNo, message, inserted }

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
    setProgress({ done: 0, total: parsed.rows.length });
    let inserted = 0;
    for (const r of parsed.rows) {
      try {
        await api.rateRowCreate(rail, table, r.row);
        inserted++;
        setProgress({ done: inserted, total: parsed.rows.length });
      } catch (e) {
        // Rows already sent are in for good (append-only, no delete) — say
        // exactly where it stopped so the remainder can be re-imported.
        setFailure({ rowNo: r.n, message: e.message, inserted });
        setPhase("failed");
        return;
      }
    }
    onDone(inserted);
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
            Importing {progress.done} of {progress.total}…
          </span>
        )}
        <button className="btn" disabled={phase === "busy"} onClick={onClose}>
          {phase === "failed" ? "Close" : "Cancel"}
        </button>
        <button className="btn pri" disabled={!canImport} onClick={submit}>
          {phase === "busy" ? `Importing ${progress.done}/${progress.total}…` : "Import"}
        </button>
      </>}>

      {phase === "failed" && failure && (
        <div className="errstate" style={{ textAlign: "left", padding: "12px 14px", background: "var(--held-bg)", borderRadius: 10, marginBottom: 14 }}>
          <div className="errstate-h" style={{ marginBottom: 3 }}>Stopped at sheet line {failure.rowNo}</div>
          <div className="errstate-m" style={{ margin: 0 }}>
            {failure.message} — the first {failure.inserted} row{failure.inserted === 1 ? " was" : "s were"} already
            added and cannot be undone. Fix the sheet from line {failure.rowNo} and import the remainder.
          </div>
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
