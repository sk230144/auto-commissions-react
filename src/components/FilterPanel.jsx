import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Filter, X } from "lucide-react";

/** Below this the popover is a bottom sheet, positioned by CSS alone —
 *  keep in step with the @media (max-width:560px) block in styles.css. */
const SHEET = "(max-width:560px)";

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
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => { if (open) setDraft(value); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    // The popover lives in a portal, so "outside" means outside BOTH the
    // button and the panel — the panel is no longer a child of the wrapper.
    const onDoc = (e) => {
      if (ref.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onEsc); };
  }, [open]);

  /**
   * Fixed-position coordinates, anchored under the button. The panel used to
   * be position:absolute inside the card — but .card clips its overflow for
   * the rounded corners, so on a short table the popover was cut off at the
   * card's edge. A portal to <body> with fixed coords escapes every clip.
   * On phones the CSS bottom-sheet rules take over and no coords are set.
   */
  const place = () => {
    if (window.matchMedia(SHEET).matches) { setPos({}); return; }
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const M = 12;                                  // breathing room at the edges
    const below = window.innerHeight - r.bottom - 8 - M;
    const above = r.top - 8 - M;
    // Prefer opening downward, but flip above the button when that leaves more
    // room — otherwise the pinned Apply row can land under the viewport edge.
    const flip = below < 260 && above > below;
    setPos({
      ...(flip ? { bottom: window.innerHeight - r.top + 8 } : { top: r.bottom + 8 }),
      left: Math.max(M, Math.min(r.left, window.innerWidth - 280 - M)),
      // Cap to the space actually available, so the body scrolls instead of
      // the panel running off-screen.
      maxHeight: Math.max(220, flip ? above : below),
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    // Capture-phase, so scrolling any ancestor container re-anchors it too.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
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
    groups.forEach((g) => {
      blank[g.key] = [];
      // Clear must empty the free-text box too, or a filter survives "Clear".
      if (g.contains) blank[`${g.key}~`] = "";
    });
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
        {/* A dot as well as the count and the filled button: three signals, so
            "filtered" is never carried by colour alone. */}
        {count > 0 && <span className="fdot" aria-hidden="true" />}
      </button>
      {/* Clearing is the common next action after filtering, and needing to
          open the panel to reach Clear made it a three-click job. */}
      {count > 0 && !disabled && (
        <button className="btn fclear" onClick={clear}
          title={`Clear ${count} filter${count === 1 ? "" : "s"}`}
          aria-label={`Clear ${count} filter${count === 1 ? "" : "s"}`}>
          <X size={13} strokeWidth={2.4} />
        </button>
      )}
      {open && !disabled && pos && createPortal(
        <div className="filterpop" ref={popRef} style={pos}>
          <div className="filterpop-h">
            <span>Filter</span>
            {count > 0 && <span className="fpop-n">{count} applied</span>}
          </div>
          <div className="filterpop-b">
          {groups.map((g) => (
            <div className="fg" key={g.key}>
              <div className="fg-h">{g.label}</div>

              {/* Where the tick list covers only part of the data, a free-text
                  box is the only way to reach a value that is not offered. */}
              {g.contains && (
                <input className="fg-contains" placeholder={`Any ${g.label.toLowerCase()} containing…`}
                  value={draft[`${g.key}~`] || ""}
                  onChange={(e) => setDraft({ ...draft, [`${g.key}~`]: e.target.value })} />
              )}

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

              {/* Never let a partial list pass for the whole set. */}
              {g.note && <div className="fg-note">{g.note}</div>}
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
          </div>

          <div className="fg-actions">
            <button className="btn gho sm" onClick={clear}>Clear</button>
            <button className="btn pri sm" onClick={apply}>Apply</button>
          </div>
        </div>,
        document.body
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
