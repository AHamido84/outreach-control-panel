import "server-only";
import { env } from "@/lib/env";
import { realTransport } from "@/lib/google/real";
import { quoteTab, SheetsError, type CellValue, type InputOption, type SheetMeta, type SheetsTransport } from "@/lib/google/transport";
import { mockEngine, mockTransport } from "@/lib/mock/transport";
import { numToCol } from "@/lib/mock/workbook";
import { ensureEngineKey, recordGoogleError, type Company } from "@/lib/store/model";
import {
  CMD, DASHBOARD_TABS, NUMERIC_COMPANY_KEYS, REQUIRED_HEADERS, TAB, type Command, type CommandType, type SystemInfo,
} from "./schema";

export type RowObj = Record<string, CellValue> & { _row: number };
export type Table = { tab: string; headers: string[]; rows: RowObj[] };

// ------------------------------------------------------------------ cache

/** Short TTL for what the engine changes every minute; longer for config tabs. */
const TTL: Record<string, number> = { [TAB.COMMANDS]: 4000, [TAB.RESULTS]: 4000, [TAB.SYSTEM]: 4000, [TAB.LEADS]: 20000, [TAB.LOG]: 20000 };
const DEFAULT_TTL = 60000;
type Entry = { at: number; p: Promise<CellValue[][]> };
const g = globalThis as unknown as { __ocpCache?: Map<string, Entry>; __ocpMeta?: Map<string, { at: number; m: SheetMeta }> };
const cache = () => (g.__ocpCache ??= new Map());
const metaCache = () => (g.__ocpMeta ??= new Map());

export function invalidate(sheetId: string, tab?: string) {
  for (const k of [...cache().keys()]) if (k.startsWith(sheetId + "|") && (!tab || k === `${sheetId}|${tab}`)) cache().delete(k);
}

// ------------------------------------------------------------------ helpers

function toTable(tab: string, values: CellValue[][]): Table {
  const headers = (values[0] || []).map((h) => String(h).trim());
  const rows: RowObj[] = [];
  values.slice(1).forEach((vals, i) => {
    if (vals.join("") === "") return;
    const o = { _row: i + 2 } as RowObj;
    headers.forEach((h, j) => { if (h) o[h] = vals[j] ?? ""; });
    rows.push(o);
  });
  return { tab, headers, rows };
}

/** Value to write with USER_ENTERED: text that Sheets would re-interpret (numbers, phones, formulas) stays text. */
export function asText(v: CellValue): CellValue {
  if (typeof v !== "string") return v;
  if (/^\s*([+-]?\d[\d\s.]*|[=@+-].*)$/.test(v) || /^\d{4}-\d{2}-\d{2}/.test(v)) return "'" + v;
  return v;
}

export const cellA1 = (tab: string, row: number, col: number) => `${quoteTab(tab)}!${numToCol(col)}${row}`;

export const newCommandId = () => "D" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();

function parseJSON(s: string): Record<string, unknown> | null {
  if (!s || s === "***") return null;
  try { const v = JSON.parse(s); return v && typeof v === "object" ? v : { value: v }; } catch { return null; }
}

// ------------------------------------------------------------------ CompanySheets

export class CompanySheets {
  constructor(public company: Company, private t: SheetsTransport) {}
  get id() { return this.company.sheetId; }

  private async guard<T>(op: string, fn: () => Promise<T>): Promise<T> {
    try { return await fn(); } catch (e) {
      if (e instanceof SheetsError && e.status) await recordGoogleError({ at: new Date().toISOString(), company: this.company.slug, op, status: e.status, message: e.detail || e.message });
      throw e;
    }
  }

  async meta(fresh = false): Promise<SheetMeta> {
    const c = metaCache().get(this.id);
    if (!fresh && c && Date.now() - c.at < 10 * 60e3) return c.m;
    const m = await this.guard("meta", () => this.t.meta(this.id));
    metaCache().set(this.id, { at: Date.now(), m });
    return m;
  }

  /** One values.batchGet for every tab not in cache. Missing tabs → null. */
  async read(tabs: string[], opts: { fresh?: boolean } = {}): Promise<Record<string, Table | null>> {
    const meta = await this.meta();
    const out: Record<string, Table | null> = {};
    const need: string[] = [];
    for (const tab of tabs) {
      if (!meta.tabs.includes(tab)) { out[tab] = null; continue; }
      const e = cache().get(`${this.id}|${tab}`);
      if (!opts.fresh && e && Date.now() - e.at < (TTL[tab] ?? DEFAULT_TTL)) continue;
      need.push(tab);
    }
    if (need.length) {
      const p = this.guard("batchGet", () => this.t.batchGet(this.id, need.map(quoteTab)));
      need.forEach((tab, i) => cache().set(`${this.id}|${tab}`, { at: Date.now(), p: p.then((v) => v[i]) }));
      p.catch(() => need.forEach((tab) => cache().delete(`${this.id}|${tab}`)));
    }
    for (const tab of tabs) if (out[tab] !== null) out[tab] = toTable(tab, await cache().get(`${this.id}|${tab}`)!.p);
    return out;
  }

  async table(tab: string, fresh = false): Promise<Table | null> {
    return (await this.read([tab], { fresh }))[tab];
  }

  /** Raw values of a tab (row 1 first) — for tabs that are not a header table, like Import. */
  async grid(tab: string, fresh = true): Promise<CellValue[][] | null> {
    const meta = await this.meta();
    if (!meta.tabs.includes(tab)) return null;
    const [v] = await this.guard("batchGet", () => this.t.batchGet(this.id, [quoteTab(tab)]));
    if (fresh) invalidate(this.id, tab);
    return v;
  }

  /** Writes a rectangular block starting at an A1 cell (e.g. Import!A2). */
  async writeBlock(tab: string, topLeft: string, values: CellValue[][], input: InputOption) {
    if (!values.length) return;
    await this.guard("batchUpdate", () => this.t.batchUpdate(this.id, [{ range: `${quoteTab(tab)}!${topLeft}`, values }], input));
    invalidate(this.id, tab);
  }

  /** Writes only the given cells. */
  async setCells(tab: string, changes: { row: number; header: string; value: CellValue }[], input: InputOption = "USER_ENTERED") {
    if (!changes.length) return;
    const t = await this.table(tab);
    if (!t) throw new SheetsError(`التاب "${tab}" مش موجود في الشيت`);
    const data = changes.map((c) => {
      const col = t.headers.indexOf(c.header);
      if (col === -1) throw new SheetsError(`العمود "${c.header}" مش موجود في ${tab}`);
      return { range: cellA1(tab, c.row, col + 1), values: [[input === "USER_ENTERED" ? asText(c.value) : c.value]] };
    });
    await this.guard("batchUpdate", () => this.t.batchUpdate(this.id, data, input));
    invalidate(this.id, tab);
  }

  /** Appends objects in the tab's header order. */
  async appendRows(tab: string, objs: Record<string, CellValue>[], input: InputOption = "USER_ENTERED") {
    if (!objs.length) return;
    const t = await this.table(tab, true);
    if (!t) throw new SheetsError(`التاب "${tab}" مش موجود في الشيت`);
    const values = objs.map((o) => t.headers.map((h) => { const v = o[h] ?? ""; return input === "USER_ENTERED" ? asText(v) : v; }));
    await this.guard("append", () => this.t.append(this.id, `${quoteTab(tab)}!A1`, values, input));
    invalidate(this.id, tab);
  }

  // ---------------------------------------------------------------- Company tab (key / value)

  async companyRows(fresh = false) {
    const t = await this.table(TAB.COMPANY, fresh);
    if (!t) throw new SheetsError("تاب Company مش موجود");
    // the tab is label | value | note; headers row is row 1
    const rows = t.rows.map((r) => ({ label: String(r[t.headers[0]] ?? "").trim(), value: r[t.headers[1]] ?? "", note: String(r[t.headers[2]] ?? ""), row: r._row }))
      .filter((r) => r.label);
    const map: Record<string, CellValue> = {};
    rows.forEach((r) => { map[r.label] = typeof r.value === "string" ? r.value.trim() : r.value; });
    return { rows, map, headers: t.headers };
  }

  /** Writes changed Company values; appends labels that don't exist yet. */
  async setCompany(changes: Record<string, CellValue>) {
    const { rows } = await this.companyRows(true);
    const updates: { range: string; values: CellValue[][] }[] = [];
    const appends: CellValue[][] = [];
    for (const [label, raw] of Object.entries(changes)) {
      const value = NUMERIC_COMPANY_KEYS.has(label) && raw !== "" && !isNaN(Number(raw)) ? Number(raw) : asText(String(raw ?? ""));
      const r = rows.find((x) => x.label === label);
      if (r) updates.push({ range: cellA1(TAB.COMPANY, r.row, 2), values: [[value]] });
      else appends.push([label, value, ""]);
    }
    if (updates.length) await this.guard("batchUpdate", () => this.t.batchUpdate(this.id, updates, "USER_ENTERED"));
    if (appends.length) await this.guard("append", () => this.t.append(this.id, `${quoteTab(TAB.COMPANY)}!A1`, appends, "USER_ENTERED"));
    invalidate(this.id, TAB.COMPANY);
  }

  // ---------------------------------------------------------------- System

  async system(fresh = false): Promise<SystemInfo | null> {
    const t = await this.table(TAB.SYSTEM, fresh);
    if (!t) return null;
    const out: SystemInfo = { _rows: [] };
    for (const r of t.rows) {
      const k = String(r["المفتاح"] ?? "").trim();
      if (!k) continue;
      (out as Record<string, unknown>)[k] = r["القيمة"];
      out._rows!.push({ key: k, value: (r["القيمة"] ?? "") as string | number, desc: String(r["الوصف"] ?? "") });
    }
    // writeSystem_ clears the tab before rewriting it: an empty read means "refreshing", keep the last good one
    const key = this.id;
    const last = lastSystem.get(key);
    if (!out._rows!.length && last) return last;
    if (out._rows!.length) lastSystem.set(key, out);
    return out;
  }

  // ---------------------------------------------------------------- Commands

  private toCommand(r: RowObj): Command {
    const raw = String(r["النتيجة"] ?? "");
    return {
      id: String(r["ID"]), type: String(r["النوع"]), payload: String(r["البيانات"] ?? ""), at: String(r["موعد التنفيذ"] ?? ""),
      status: String(r["الحالة"] ?? ""), createdAt: String(r["تاريخ الإنشاء"] ?? ""), executedAt: String(r["تاريخ التنفيذ"] ?? ""),
      result: parseJSON(raw), resultRaw: raw, creator: String(r["المنشئ"] ?? ""), row: r._row,
    };
  }

  async commands(fresh = false): Promise<Command[]> {
    const t = await this.table(TAB.COMMANDS, fresh);
    return t ? t.rows.filter((r) => r["ID"]).map((r) => this.toCommand(r)).reverse() : [];
  }

  async command(id: string, fresh = false): Promise<Command | null> {
    return (await this.commands(fresh)).find((c) => c.id === id) || null;
  }

  /** Appends a pending command. البيانات and موعد التنفيذ are written RAW. */
  async enqueue(type: CommandType, payload: Record<string, unknown>, opts: { at?: Date; creator: string }): Promise<string> {
    const t = await this.table(TAB.COMMANDS, true);
    if (!t) throw new SheetsError("تاب Commands مش موجود — شغّل «إعداد أول مرة» من قائمة Outreach في الشيت");
    const id = newCommandId();
    const o: Record<string, CellValue> = {
      "ID": id, "النوع": type, "البيانات": JSON.stringify(payload), "موعد التنفيذ": opts.at ? opts.at.toISOString() : "",
      "الحالة": CMD.PENDING, "تاريخ الإنشاء": new Date().toISOString(), "تاريخ التنفيذ": "", "النتيجة": "", "المنشئ": opts.creator,
    };
    await this.appendRows(TAB.COMMANDS, [o], "RAW");
    return id;
  }

  /** Cancel only while still pending: re-read, check the ID, write ملغي, re-read to confirm. */
  async cancel(id: string): Promise<"cancelled" | "started" | "missing"> {
    const c = await this.command(id, true);
    if (!c) return "missing";
    if (c.status !== CMD.PENDING) return "started";
    await this.setCells(TAB.COMMANDS, [{ row: c.row, header: "الحالة", value: CMD.CANCELLED }], "RAW");
    const after = await this.command(id, true);
    return after?.status === CMD.CANCELLED ? "cancelled" : "started";
  }

  // ---------------------------------------------------------------- structure

  async validateStructure() {
    const meta = await this.meta(true);
    const tabs = Object.keys(REQUIRED_HEADERS);
    const missingTabs = tabs.filter((t) => !meta.tabs.includes(t));
    const present = tabs.filter((t) => meta.tabs.includes(t));
    const data = await this.read(present, { fresh: true });
    const missingHeaders: Record<string, string[]> = {};
    for (const t of present) {
      const miss = REQUIRED_HEADERS[t].filter((h) => !data[t]!.headers.includes(h));
      if (miss.length) missingHeaders[t] = miss;
    }
    const needsEngineSetup = DASHBOARD_TABS.some((t) => missingTabs.includes(t)) || !!missingHeaders[TAB.LEADS]?.includes("حالة monday");
    return { title: meta.title, locale: meta.locale, timeZone: meta.timeZone, missingTabs, missingHeaders, needsEngineSetup, ok: !missingTabs.length && !Object.keys(missingHeaders).length };
  }
}

const lastSystem = new Map<string, SystemInfo>();

/** The single entry point for every Sheets call. */
export async function sheetsFor(company: Company): Promise<CompanySheets> {
  if (env.mockSheets) {
    mockEngine(company.sheetId, await ensureEngineKey(company.slug));
    return new CompanySheets(company, mockTransport);
  }
  return new CompanySheets(company, realTransport);
}
