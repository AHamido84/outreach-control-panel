import "server-only";

export type Cell = string | number | boolean | Date;
export type Grid = Cell[][];
export type Workbook = Record<string, Grid>;

/** How Google Sheets interprets a typed (USER_ENTERED / Apps Script setValue) string. */
export function userEntered(v: unknown): Cell {
  if (typeof v !== "string") return (v ?? "") as Cell;
  if (v.charAt(0) === "'") return v.slice(1);
  const t = v.trim();
  // numeric strings become numbers — so 0501234567 loses its zero unless written as '0501234567
  if (/^[+-]?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date(t + "T00:00:00Z");
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(t)) return new Date(t.replace(" ", "T") + (t.length === 16 ? ":00Z" : "Z"));
  return v;
}

export function getCell(g: Grid, r: number, c: number): Cell {
  const row = g[r - 1];
  const v = row ? row[c - 1] : "";
  return v === undefined || v === null ? "" : v;
}

export function putCell(g: Grid, r: number, c: number, v: Cell) {
  while (g.length < r) g.push([]);
  const row = g[r - 1];
  while (row.length < c) row.push("");
  row[c - 1] = v;
}

export function lastRow(g: Grid): number {
  let n = 0;
  g.forEach((r, i) => { if (r.some((v) => v !== "" && v !== null && v !== undefined)) n = i + 1; });
  return n;
}

export function lastCol(g: Grid): number {
  return Math.max(0, ...g.map((r) => { let n = 0; r.forEach((v, i) => { if (v !== "" && v !== null && v !== undefined) n = i + 1; }); return n; }));
}

// ---------- A1 ----------

export function colToNum(s: string): number {
  let n = 0;
  for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
export function numToCol(n: number): string {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

export type A1 = { tab: string; r1: number; c1: number; r2?: number; c2?: number };

/** 'Tab'!B3, 'Tab'!A1:C9, 'Tab'!A:C, or just 'Tab'. */
export function parseA1(range: string): A1 {
  const m = range.match(/^(?:'((?:[^']|'')+)'|([^!]+))(?:!(.+))?$/);
  if (!m) throw new Error("bad range " + range);
  const tab = (m[1] ?? m[2]).replace(/''/g, "'");
  if (!m[3]) return { tab, r1: 1, c1: 1 };
  const [a, b] = m[3].split(":");
  const p = (x: string) => { const mm = x.match(/^([A-Z]*)(\d*)$/i)!; return { c: mm[1] ? colToNum(mm[1]) : 0, r: mm[2] ? Number(mm[2]) : 0 }; };
  const s = p(a);
  const e = b ? p(b) : s;
  return { tab, r1: s.r || 1, c1: s.c || 1, r2: b ? e.r || undefined : s.r, c2: b ? e.c || undefined : s.c };
}

// ---------- JSON with dates ----------

export function toJSONSafe(wb: Workbook): unknown {
  const out: Record<string, unknown[][]> = {};
  for (const [k, g] of Object.entries(wb)) out[k] = g.map((r) => r.map((v) => (v instanceof Date ? { $d: v.toISOString() } : v)));
  return out;
}
export function fromJSONSafe(x: Record<string, unknown[][]>): Workbook {
  const out: Workbook = {};
  for (const [k, g] of Object.entries(x)) {
    out[k] = g.map((r) => r.map((v) => (v && typeof v === "object" && "$d" in (v as object) ? new Date((v as { $d: string }).$d) : (v as Cell))));
  }
  return out;
}

/** FORMATTED_STRING rendering of a date cell (mock spreadsheet locale en_US-like ISO, tz UTC). */
export function formatDateCell(d: Date): string {
  const iso = d.toISOString();
  return d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds() ? iso.slice(0, 10) + " " + iso.slice(11, 19) : iso.slice(0, 10);
}
