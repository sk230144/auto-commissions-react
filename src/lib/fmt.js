/** Money is shown to CENTS, deliberately — 286 live lines carry cents, and rounding
 *  made the display disagree with the stored and exported amount. */
export const money = (n) =>
  (Number(n) || 0).toLocaleString(undefined, {
    style: "currency", currency: "USD",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

/** The API speaks integer cents, signed. Divide once, at the boundary — never
 *  let a cents figure reach a component that thinks in dollars. */
export const fromCents = (c) => (Number(c) || 0) / 100;
export const toCents = (d) => Math.round((Number(d) || 0) * 100);
/** Money straight from an API field. */
export const moneyC = (c) => money(fromCents(c));

export const pct = (n) => Math.round((Number(n) || 0) * 100) + "%";
export const trunc = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n) + "…" : s; };
export const today = () => new Date().toISOString().slice(0, 10);

/** OWASP CSV-injection defence — a cell that would execute as a formula gets quoted. */
function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function csvDownload(name, header, rows) {
  if (!rows.length) return false;
  const body = [header.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name} ${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

/** Sum stage `pay` for stages whose date has landed — the milestone-release cap. */
export function planReleasable(plan, day) {
  if (!plan || !Array.isArray(plan.stages)) return null;
  let r = 0;
  for (const s of plan.stages) if (s.date && String(s.date).slice(0, 10) <= day) r += Number(s.pay) || 0;
  return Math.round(r * 100) / 100;
}
