import { useEffect, useRef, useState } from "react";
import { Filter } from "lucide-react";

/**
 * A reusable "+ Filter" popover: checkbox groups with counts, an optional
 * date range, Clear / Apply. Every page hands it groups (facets over its own
 * rows) and gets a draft it can apply as a controlled filter object — the
 * panel itself has no idea what a "dealer" or "milestone" is.
 *
 * groups: [{ key, label, options: [{ value, count }], scroll? }]
 * dateRange: { key, label } | undefined — renders a from/to pair under `${key}From` / `${key}To`
 */
export default function FilterPanel({ groups, dateRange, value, onApply, count = 0,
  disabled = false, disabledReason }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);

  useEffect(() => { if (open) setDraft(value); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onEsc); };
  }, [open]);

  function toggle(gkey, v) {
    setDraft((d) => {
      const set = new Set(d[gkey] || []);
      set.has(v) ? set.delete(v) : set.add(v);
      return { ...d, [gkey]: [...set] };
    });
  }

  function clear() {
    const blank = {};
    groups.forEach((g) => (blank[g.key] = []));
    if (dateRange) { blank[`${dateRange.key}From`] = ""; blank[`${dateRange.key}To`] = ""; }
    setDraft(blank);
    onApply(blank);
    setOpen(false);
  }

  function apply() {
    onApply(draft);
    setOpen(false);
  }

  return (
    <div className="filterwrap" ref={ref}>
      <button className={"btn" + (count ? " pri" : "")} disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={() => setOpen((o) => !o)}>
        <Filter size={14} strokeWidth={2} />+ Filter{count > 0 ? ` (${count})` : ""}
      </button>
      {open && !disabled && (
        <div className="filterpop">
          {groups.map((g) => (
            <div className="fg" key={g.key}>
              <div className="fg-h">{g.label}</div>
              <div className={"fg-list" + (g.scroll === false ? "" : " scroll")}>
                {/* Distinguishes "this field is blank on every row" from "no rows
                    loaded at all" — the panel is disabled entirely in the latter case. */}
                {g.options.length === 0 && <div className="fg-empty">No {g.label.toLowerCase()} recorded on any row.</div>}
                {g.options.map((o) => (
                  <label className="fg-opt" key={o.value}>
                    <input type="checkbox" checked={(draft[g.key] || []).includes(o.value)}
                      onChange={() => toggle(g.key, o.value)} />
                    <span>{o.value}</span>
                    <span className="fg-n">({o.count})</span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          {dateRange && (
            <div className="fg">
              <div className="fg-h">{dateRange.label}</div>
              <div className="fg-dates">
                <input type="date" value={draft[`${dateRange.key}From`] || ""}
                  onChange={(e) => setDraft({ ...draft, [`${dateRange.key}From`]: e.target.value })} />
                <span>to</span>
                <input type="date" value={draft[`${dateRange.key}To`] || ""}
                  onChange={(e) => setDraft({ ...draft, [`${dateRange.key}To`]: e.target.value })} />
              </div>
            </div>
          )}

          <div className="fg-actions">
            <button className="btn gho sm" onClick={clear}>Clear</button>
            <button className="btn pri sm" onClick={apply}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Turn a server facet map — {"AZ": 1343, "TX": 88} — into panel options.
 * Server facets are self-excluding (each dimension counted with every filter
 * except its own), so ticking AZ never zeroes the other states in that list.
 */
export function apiFacet(map, { sort = "count" } = {}) {
  const rows = Object.entries(map || {}).map(([value, count]) => ({ value, count }));
  return sort === "value"
    ? rows.sort((a, b) => a.value.localeCompare(b.value))
    : rows.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** Build {value: count} facet options from a list of rows for a given field. */
export function facet(rows, field) {
  const m = new Map();
  rows.forEach((r) => {
    const v = typeof field === "function" ? field(r) : r[field];
    if (!v) return;
    m.set(v, (m.get(v) || 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
}

/** Count how many facet/date selections are active, for the "(N)" badge. */
export function activeCount(value, groups, dateRange) {
  let n = groups.reduce((s, g) => s + (value[g.key]?.length || 0), 0);
  if (dateRange && (value[`${dateRange.key}From`] || value[`${dateRange.key}To`])) n++;
  return n;
}

/** Apply a draft's group selections + optional date range to one row. */
export function passesFilter(row, value, groups, dateRange) {
  for (const g of groups) {
    const sel = value[g.key];
    if (sel && sel.length) {
      const v = typeof g.field === "function" ? g.field(row) : row[g.field || g.key];
      if (!sel.includes(v)) return false;
    }
  }
  if (dateRange) {
    const v = typeof dateRange.field === "function" ? dateRange.field(row) : row[dateRange.field || dateRange.key];
    const from = value[`${dateRange.key}From`], to = value[`${dateRange.key}To`];
    if (from && (!v || v < from)) return false;
    if (to && (!v || v > to)) return false;
  }
  return true;
}
