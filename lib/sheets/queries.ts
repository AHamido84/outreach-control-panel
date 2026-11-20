import "server-only";
import type { CellValue } from "@/lib/google/transport";
import { SheetsError } from "@/lib/google/transport";
import { normalizeDate } from "./dates";
import { CMD, TAB } from "./schema";
import type { CompanySheets, RowObj } from "./index";

export const LEAD_DATE_COLS = ["تاريخ الإضافة", "تاريخ أول إرسال", "تاريخ آخر إرسال", "المتابعة الجاية", "ميعاد الجلسة"];
/** Columns the dashboard may edit inline on a lead. */
export const LEAD_EDITABLE = ["كود الـ Segment", "اللغة", "اسم الشخص", "ملاحظات"];

export type Lead = Record<string, string> & { _row: string };

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** Leads as plain strings, dates normalized with the spreadsheet locale. */
export async function leads(s: CompanySheets, fresh = false): Promise<Lead[]> {
  const [t, meta] = await Promise.all([s.table(TAB.LEADS, fresh), s.meta()]);
  if (!t) return [];
  return t.rows.map((r) => {
    const o: Record<string, string> = { _row: String(r._row) };
    for (const h of t.headers) if (h) o[h] = LEAD_DATE_COLS.includes(h) ? normalizeDate(r[h], meta.locale) : str(r[h]);
    return o as Lead;
  });
}

export type LeadFilter = { q?: string; source?: string; segment?: string; proc?: string; contact?: string; monday?: string };

export function mondayState(v: string): "تم" | "فشل" | "فاضي" {
  if (v.startsWith("فشل")) return "فشل";
  if (v === "تم") return "تم";
  return "فاضي";
}

export function filterLeads(all: Lead[], f: LeadFilter): Lead[] {
  const q = (f.q || "").trim().toLowerCase();
  return all.filter((L) => {
    if (f.source && L["كود المصدر"] !== f.source) return false;
    if (f.segment && (f.segment === "_none" ? !!L["كود الـ Segment"] : L["كود الـ Segment"] !== f.segment)) return false;
    if (f.proc && L["حالة المعالجة"] !== f.proc) return false;
    if (f.contact && (f.contact === "_none" ? !!L["حالة التواصل"] : f.contact === "متابعة" ? !L["حالة التواصل"].startsWith("متابعة") : L["حالة التواصل"] !== f.contact)) return false;
    if (f.monday && mondayState(L["حالة monday"] || "") !== f.monday) return false;
    if (q && !["ID", "اسم الجهة", "اسم الشخص", "الإيميل", "الموقع", "المدينة", "النشاط", "ملاحظات"].some((h) => (L[h] || "").toLowerCase().includes(q))) return false;
    return true;
  });
}

/** Re-reads the lead's row, checks the ID is still there, then writes only the given cells. */
export async function updateLead(s: CompanySheets, id: string, changes: Record<string, CellValue>) {
  for (const h of Object.keys(changes)) if (!LEAD_EDITABLE.includes(h) && h !== "حالة التواصل" && h !== "حالة المعالجة") throw new SheetsError(`العمود «${h}» مش مسموح بتعديله`);
  const t = await s.table(TAB.LEADS, true);
  const row = t?.rows.find((r) => String(r["ID"]) === id);
  if (!row) throw new SheetsError(`العميل ${id} مش موجود (يمكن الشيت اتغيّر) — حدّث الصفحة`);
  await s.setCells(TAB.LEADS, Object.entries(changes).map(([header, value]) => ({ row: row._row, header, value })));
}

/** Same for many leads at once; skips IDs that moved/disappeared and reports them. */
export async function updateLeads(s: CompanySheets, ids: string[], changes: Record<string, CellValue>, only?: (r: RowObj) => boolean) {
  const t = await s.table(TAB.LEADS, true);
  if (!t) throw new SheetsError("تاب Leads مش موجود");
  const byId = new Map(t.rows.map((r) => [String(r["ID"]), r]));
  const cells: { row: number; header: string; value: CellValue }[] = [];
  const missing: string[] = [], skipped: string[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) { missing.push(id); continue; }
    if (only && !only(r)) { skipped.push(id); continue; }
    for (const [header, value] of Object.entries(changes)) cells.push({ row: r._row, header, value });
  }
  await s.setCells(TAB.LEADS, cells);
  return { updated: ids.length - missing.length - skipped.length, missing, skipped, rows: t.rows.filter((r) => ids.includes(String(r["ID"]))) };
}

// ------------------------------------------------------------------ Do-Not-Contact

export type DncEntry = { row: number; value: string; type: string; reason: string; date: string; note: string };

export async function dncList(s: CompanySheets, fresh = false): Promise<DncEntry[]> {
  const [t, meta] = await Promise.all([s.table(TAB.DNC, fresh), s.meta()]);
  return (t?.rows ?? []).filter((r) => str(r["الإيميل أو الدومين"]).trim()).map((r) => ({
    row: r._row, value: str(r["الإيميل أو الدومين"]), type: str(r["النوع"]), reason: str(r["السبب"]),
    date: normalizeDate(r["التاريخ"], meta.locale), note: str(r["ملاحظات"]),
  }));
}

/** Normalizes "x@y.com", "@y.com", "https://www.y.com/…" → {value, type}. Type is always written (see engine quirk). */
export function dncEntryOf(raw: string): { value: string; type: "إيميل" | "دومين" } | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { value: v, type: "إيميل" };
  const d = v.replace(/^@/, "").replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[\/?#:\s]/)[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? { value: d, type: "دومين" } : null;
}

export async function addDnc(s: CompanySheets, values: string[], reason: string, note = "") {
  const existing = new Set((await dncList(s, true)).map((d) => d.value.toLowerCase()));
  const bad: string[] = [], rows: Record<string, CellValue>[] = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const raw of values) {
    const e = dncEntryOf(raw);
    if (!e) { if (raw.trim()) bad.push(raw.trim()); continue; }
    if (existing.has(e.value)) continue;
    existing.add(e.value);
    rows.push({ "الإيميل أو الدومين": e.value, "النوع": e.type, "السبب": reason, "التاريخ": today, "ملاحظات": note });
  }
  await s.appendRows(TAB.DNC, rows);
  return { added: rows.length, bad };
}

/** "Removing" clears the row (the engine skips empty rows) — no row deletion, so other rows never shift. */
export async function removeDnc(s: CompanySheets, row: number, expectValue: string) {
  const t = await s.table(TAB.DNC, true);
  const r = t?.rows.find((x) => x._row === row);
  if (!r || str(r["الإيميل أو الدومين"]).toLowerCase() !== expectValue.toLowerCase()) throw new SheetsError("الصف اتغيّر — حدّث الصفحة");
  await s.setCells(TAB.DNC, ["الإيميل أو الدومين", "النوع", "السبب", "التاريخ", "ملاحظات"].filter((h) => t!.headers.includes(h)).map((h) => ({ row, header: h, value: "" })));
}

// ------------------------------------------------------------------ Send Results / Log

export type SendResult = {
  commandId: string; time: string; leadId: string; email: string; step: string; template: string;
  sent: "نعم" | "لا" | "معاينة" | string; error: string; threadId: string; monday: string; mondayError: string;
};

export async function sendResults(s: CompanySheets, commandId?: string): Promise<SendResult[]> {
  const [t, meta] = await Promise.all([s.table(TAB.RESULTS), s.meta()]);
  const rows = (t?.rows ?? []).map((r) => ({
    commandId: str(r["Command ID"]), time: normalizeDate(r["الوقت"], meta.locale), leadId: str(r["Lead ID"]), email: str(r["الإيميل"]),
    step: str(r["الخطوة"]), template: str(r["القالب/النسخة"]), sent: str(r["تم الإرسال"]), error: str(r["الخطأ"]),
    threadId: str(r["Thread ID"]), monday: str(r["monday"]), mondayError: str(r["خطأ monday"]),
  }));
  return (commandId ? rows.filter((r) => r.commandId === commandId) : rows).reverse();
}

export type LogRow = { time: string; fn: string; count: string; result: string; details: string };

export async function logRows(s: CompanySheets, limit = 200): Promise<LogRow[]> {
  const [t, meta] = await Promise.all([s.table(TAB.LOG), s.meta()]);
  return (t?.rows ?? []).map((r) => ({
    time: normalizeDate(r["الوقت"], meta.locale), fn: str(r["الدالة"]), count: str(r["العدد"]), result: str(r["النتيجة"]), details: str(r["التفاصيل"]),
  })).reverse().slice(0, limit);
}

// ------------------------------------------------------------------ Import tab

/**
 * Writes one chunk to the Import tab: row 2 = [source code, ...unified headers], data from row 3 (col A empty → row 2's code).
 * Refuses when rows 3+ are not empty (a previous import is still waiting or failed).
 */
export async function writeImportChunk(s: CompanySheets, source: string, headers: string[], rows: string[][]) {
  const g = await s.grid(TAB.IMPORT);
  if (!g) throw new SheetsError("تاب Import مش موجود");
  const leftover = g.slice(2).some((r) => r.slice(1).some((v) => str(v).trim() !== ""));
  if (leftover) throw new SheetsError("تاب Import فيه داتا من استيراد قبل كده لسه ماتنفذتش", 409, "rows 3+ of Import are not empty");
  const width = Math.max(headers.length + 1, ...(g[1] ? [g[1].length] : [0]));
  const pad = (r: CellValue[]) => [...r, ...Array(Math.max(0, width - r.length)).fill("")];
  // RAW: values stay exactly as typed (phones keep their zeros; the engine prefixes them on the way to Leads)
  await s.writeBlock(TAB.IMPORT, "A2", [pad([source, ...headers]), ...rows.map((r) => pad(["", ...r]))], "RAW");
}

/** Clears Import rows 3+ (after a failed import, with the user's confirmation). */
export async function clearImport(s: CompanySheets) {
  const g = await s.grid(TAB.IMPORT);
  if (!g || g.length < 3) return 0;
  const width = Math.max(...g.map((r) => r.length), 1);
  await s.writeBlock(TAB.IMPORT, "A3", g.slice(2).map(() => Array(width).fill("")), "RAW");
  return g.length - 2;
}

export async function pendingOfType(s: CompanySheets, type: string) {
  return (await s.commands(true)).filter((c) => c.type === type && (c.status === CMD.PENDING || c.status === CMD.RUNNING));
}
