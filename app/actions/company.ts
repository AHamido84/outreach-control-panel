"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ar } from "@/content/ar";
import { act, fail } from "@/lib/actions";
import { assertCompany, assertUser } from "@/lib/auth/guards";
import { seal } from "@/lib/crypto/seal";
import { checkDomain } from "@/lib/dns/check";
import { boardIdOf_ } from "@/lib/engine-port";
import type { CellValue } from "@/lib/google/transport";
import { validateMondayToken } from "@/lib/monday/api";
import { sheetsFor } from "@/lib/sheets";
import { CONTENT_TABS, TAB, type CommandType } from "@/lib/sheets/schema";
import {
  ensureEngineKey, mondayTokenOf, removeCompany, saveCompany, secretInfo, setSecret, type Company,
} from "@/lib/store/model";

const T = ar.companySettings;

async function load(slug: string) {
  const { user, company: c } = await assertCompany(slug);
  return { user, c, s: await sheetsFor(c) };
}

const revalidate = (slug: string) => revalidatePath(`/c/${slug}/settings`);

/** Writes Company-tab keys (only the ones that changed are sent by the client). */
export async function saveCompanyKeys(slug: string, changes: Record<string, string | number>) {
  return act(async () => {
    const { s } = await load(slug);
    if (!Object.keys(changes).length) return { ok: true as const, message: ar.common.unchanged };
    const h1 = changes["ساعة بداية الإرسال"], h2 = changes["ساعة نهاية الإرسال"];
    if (h1 !== undefined || h2 !== undefined) {
      const cur = (await s.companyRows(true)).map;
      if (Number(h2 ?? cur["ساعة نهاية الإرسال"]) <= Number(h1 ?? cur["ساعة بداية الإرسال"])) return fail(T.schedule.hoursInvalid);
    }
    if (changes["أيام الإرسال"] !== undefined && !String(changes["أيام الإرسال"]).trim()) return fail(T.schedule.noDays);
    await s.setCompany(changes);
    revalidate(slug);
  }, ar.common.saved);
}

/** Registry fields (dashboard-only, not in the sheet). */
export async function saveRegistry(slug: string, patch: Partial<Pick<Company, "color" | "firstSendDate" | "mondayAccount" | "name">>) {
  return act(async () => {
    const { c } = await load(slug);
    await saveCompany({ ...c, ...patch });
    revalidate(slug);
    revalidatePath("/", "layout");
  }, ar.common.saved);
}

/** Queues any engine command; returns its ID for polling. */
export async function queueCommand(slug: string, type: CommandType, payload: Record<string, unknown> = {}) {
  return act(async () => {
    const allowed: CommandType[] = ["checkSender", "sendTest", "testMonday", "setup", "heartbeat", "retryMonday", "process"];
    if (!allowed.includes(type)) return fail("نوع أمر مش مسموح من هنا");
    const { s, user } = await load(slug);
    if (type === "sendTest" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.to || ""))) return fail("اكتب إيميل صحيح للتجربة");
    const id = await s.enqueue(type, payload, { creator: user.email });
    return { ok: true as const, message: ar.command.queued, data: { id } };
  });
}

export async function cancelCommand(slug: string, id: string) {
  return act(async () => {
    const { s } = await load(slug);
    const r = await s.cancel(id);
    if (r === "started") return fail("الأمر بدأ خلاص ومينفعش يتلغي");
    if (r === "missing") return fail("الأمر مش موجود");
  }, ar.command.cancelled);
}

export async function checkDeliverability(domain: string, selector?: string) {
  return act(async () => {
    await assertUser();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain.replace(/^.*@/, ""))) return fail("الدومين مش صحيح");
    return checkDomain(domain, selector);
  });
}

// ------------------------------------------------------------------ monday

/** 1) validate with monday  2) store encrypted  3) queue setMondayToken (sealed)  4) result */
export async function saveMondayToken(slug: string, token: string) {
  return act(async () => {
    const { s, c, user } = await load(slug);
    const t = token.trim();
    if (!t) return fail("الصق التوكن الأول");
    let me: { name: string };
    try { me = await validateMondayToken(t); } catch (e) { return fail("التوكن مش صحيح", (e as Error).message); }
    const info = await setSecret(mondayTokenOf(c.slug), t);
    const key = await ensureEngineKey(c.slug);
    const id = await s.enqueue("setMondayToken", { sealed: seal(t, key) }, { creator: user.email });
    revalidate(slug);
    return { ok: true as const, message: T.monday.tokenValid(me.name), data: { id, info } };
  });
}

export async function saveMondayBoard(slug: string, board: string, account: string) {
  return act(async () => {
    const { s, c } = await load(slug);
    const id = board.trim() ? boardIdOf_(board) : "";
    if (board.trim() && !id) return fail("مش لاقيين رقم بورد في اللي كتبته");
    // the account slug can also be read from a board URL
    const fromUrl = board.match(/https?:\/\/([a-z0-9-]+)\.monday\.com/i)?.[1];
    await s.setCompany({ "monday Board ID": id });
    await saveCompany({ ...c, mondayAccount: (account.trim() || fromUrl || "").toLowerCase() || undefined });
    revalidate(slug);
  }, ar.common.saved);
}

export async function mondayTokenInfo(slug: string) {
  await assertCompany(slug);
  return secretInfo(mondayTokenOf(slug));
}

// ------------------------------------------------------------------ content tables

export type ContentEdit =
  | { kind: "set"; row: number; header: string; value: CellValue }
  | { kind: "add"; values: Record<string, CellValue> }
  | { kind: "clear"; row: number };

/** Writes only changed cells; new rows are appended; "deleting" clears the row (the engine skips empty rows). */
export async function saveContent(slug: string, tab: string, edits: ContentEdit[]) {
  return act(async () => {
    const { s } = await load(slug);
    const spec = CONTENT_TABS[tab];
    if (!spec) return fail("تاب مش مسموح بتعديله");
    const t = await s.table(tab, true);
    if (!t) return fail(`التاب ${tab} مش موجود`);
    const writable = spec.cols.length ? spec.cols : t.headers.filter(Boolean);
    const sets: { row: number; header: string; value: CellValue }[] = [];
    for (const e of edits) {
      if (e.kind === "set") {
        if (!writable.includes(e.header)) return fail(`العمود «${e.header}» مش مسموح بتعديله`);
        sets.push(e);
      } else if (e.kind === "clear") {
        for (const h of writable) if (t.headers.includes(h)) sets.push({ row: e.row, header: h, value: "" });
      }
    }
    if (tab === TAB.LISTS) {
      // Lists is column-oriented: "add" = a value under a list header (first empty cell of that column)
      for (const e of edits) if (e.kind === "add") {
        for (const [h, v] of Object.entries(e.values)) {
          const col = t.headers.indexOf(h);
          if (col === -1) continue;
          // first free cell under that column = last filled row in the column + 1
          const last = Math.max(1, ...t.rows.filter((r) => String(r[h] ?? "") !== "").map((r) => r._row));
          const free = last + 1;
          sets.push({ row: free, header: h, value: v });
          t.rows.push({ _row: free, [h]: v } as (typeof t.rows)[number]);
        }
      }
      await s.setCells(tab, sets);
    } else {
      await s.setCells(tab, sets);
      const adds = edits.filter((e): e is Extract<ContentEdit, { kind: "add" }> => e.kind === "add")
        .map((e) => Object.fromEntries(Object.entries(e.values).filter(([h]) => writable.includes(h))));
      if (adds.length) await s.appendRows(tab, adds);
    }
    revalidate(slug);
  }, ar.common.saved);
}

// ------------------------------------------------------------------ advanced

export async function pauseSending(slug: string) {
  return act(async () => {
    const { s } = await load(slug);
    await s.setCompany({ "الإرسال شغال": "لا" });
    revalidate(slug);
  }, T.advanced.paused);
}

export async function removeFromDashboard(slug: string, confirmName: string) {
  const r = await act(async () => {
    const { c } = await load(slug);
    if (confirmName.trim() !== c.name) return fail("الاسم مش مطابق");
    await removeCompany(slug);
  });
  if (r.ok) { revalidatePath("/", "layout"); redirect("/companies"); }
  return r;
}
