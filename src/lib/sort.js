import { useCallback, useState } from "react";

/**
 * One sort state per table: { k, dir } or null. Clicking a header cycles
 * asc → desc → cleared, so the server's (or page's) default order is always
 * one more click away rather than unreachable once you've sorted.
 */
export function useSortState(initial = null) {
  const [sort, setSort] = useState(initial);
  const onSort = useCallback((k) => setSort((s) =>
    s?.k !== k ? { k, dir: "asc" }
      : s.dir === "asc" ? { k, dir: "desc" }
      : null), []);
  return [sort, onSort, setSort];
}

/**
 * Client-side comparator for tables whose API has no sort (or which arrive
 * complete in one response). Empty cells sort LAST in either direction — an
 * absent value is not a small value, and surfacing blanks at the top of a
 * descending money sort would read as data.
 *
 * `getters` maps a column key to a value extractor when the cell is derived
 * rather than a plain field.
 */
export function sortRows(rows, sort, getters = {}) {
  if (!sort) return rows;
  const get = getters[sort.k] || ((r) => r[sort.k]);
  const dir = sort.dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = get(a), vb = get(b);
    const ea = va === null || va === undefined || va === "";
    const eb = vb === null || vb === undefined || vb === "";
    if (ea && eb) return 0;
    if (ea) return 1;
    if (eb) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    if (typeof va === "boolean" && typeof vb === "boolean") return (va === vb ? 0 : va ? -1 : 1) * dir;
    return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" }) * dir;
  });
}
