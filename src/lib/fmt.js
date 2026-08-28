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
/**
 * Dollars-as-typed → integer cents, by splitting on the decimal point rather
 * than multiplying a float: parseFloat("8.115") * 100 is 811.4999…, which
 * rounds to 811 — a cent short. The doc calls this out specifically.
 *
 * Returns null on unparseable input, never a silent $0 — every caller treats
 * null as invalid rather than as free money.
 */
export function toCents(v) {
  let s = String(v ?? "").trim().replace(/[$,\s]/g, "");
  if (s === "") return null;
  let neg = false;
  if (s.startsWith("-")) { neg = true; s = s.slice(1); }
  if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") return null;
  const [d = "0", f = ""] = s.split(".");
  let cents = parseInt(d || "0", 10) * 100 + parseInt((f + "00").slice(0, 2) || "0", 10);
  if (f.length > 2 && f[2] >= "5") cents += 1;   // round half up on the 3rd decimal
  return neg ? -cents : cents;
}
/** Money straight from an API field. */
export const moneyC = (c) => money(fromCents(c));

export const pct = (n) => Math.round((Number(n) || 0) * 100) + "%";
export const trunc = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n) + "…" : s; };
export const today = () => new Date().toISOString().slice(0, 10);

/**
 * Quote-aware CSV → array of rows. Handles quoted fields, "" escapes, commas
 * and newlines inside quotes, and CRLF. Deliberately small — it reads sheets
 * exported from Excel/Sheets, not arbitrary dialects.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", inQ = false;
  const s = String(text ?? "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }
        else inQ = false;
      } else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  // Trailing blank lines are noise, not rows.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

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
