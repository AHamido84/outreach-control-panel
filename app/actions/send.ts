"use server";

import { revalidatePath } from "next/cache";
import { act, fail } from "@/lib/actions";
import { assertAdmin } from "@/lib/auth/guards";
import { sheetsFor } from "@/lib/sheets";
import { yes } from "@/lib/sheets/schema";
import { getCompany } from "@/lib/store/model";

export type SendInput = {
  count: number;
  segment?: string;
  leadIds?: string[];
  dryRun?: boolean;
  ignoreWindow?: boolean;
  ignoreEnabled?: boolean;
  /** ISO UTC — scheduled send */
  at?: string;
};

async function load(slug: string) {
  const user = await assertAdmin();
  const c = await getCompany(slug);
  if (!c) throw new Error("الشركة مش موجودة: " + slug);
  return { user, c, s: await sheetsFor(c) };
}

/** Queues a `send` command (dry run, manual or scheduled). The confirmation happens in the UI; the server re-checks the rules. */
export async function queueSend(slug: string, p: SendInput) {
  return act(async () => {
    const { s, user } = await load(slug);
    const { map } = await s.companyRows(true);
    const cap = Number(map["الحد اليومي للإيميلات"]) || 15;
    const count = Math.floor(Number(p.count));
    if (!count || count < 1) return fail("اكتب عدد صحيح");
    if (count > cap) return fail(`العدد أكبر من الحد اليومي (${cap})`);
    // immediate sends only: a scheduled send is checked by the engine when it runs
    if (!p.dryRun && !p.at && !yes(map["الإرسال شغال"]) && !p.ignoreEnabled) return fail("الإرسال متوقف («الإرسال شغال» = لا) — لازم تختار «ابعت برضه»");
    let at: Date | undefined;
    if (p.at) {
      at = new Date(p.at);
      if (isNaN(at.getTime())) return fail("الميعاد مش صحيح");
      if (at.getTime() < Date.now() + 60e3) return fail("الميعاد لازم يكون في المستقبل");
      if (p.dryRun) return fail("المعاينة مابتتجدولش");
    }
    const payload: Record<string, unknown> = { count };
    if (p.segment) payload.segment = p.segment;
    if (p.leadIds?.length) payload.leadIds = p.leadIds.slice(0, 500);
    if (p.dryRun) payload.dryRun = true;
    if (p.ignoreWindow) payload.ignoreWindow = true;
    if (p.ignoreEnabled) payload.ignoreEnabled = true;
    const id = await s.enqueue("send", payload, { at, creator: user.email });
    revalidatePath(`/c/${slug}`, "layout");
    return { ok: true as const, message: p.dryRun ? "المعاينة اتبعتت للمحرك" : at ? "الإرسال اتجدول ✓" : "الإرسال اتبعت للمحرك", data: { id } };
  });
}

export async function retryMondayLead(slug: string, leadId: string) {
  return act(async () => {
    const { s, user } = await load(slug);
    const id = await s.enqueue("retryMonday", { leadIds: [leadId] }, { creator: user.email });
    return { ok: true as const, data: { id } };
  });
}

export async function setSendingEnabled(slug: string, on: boolean) {
  return act(async () => {
    const { s } = await load(slug);
    await s.setCompany({ "الإرسال شغال": on ? "نعم" : "لا" });
    revalidatePath(`/c/${slug}`, "layout");
  }, on ? "الإرسال التلقائي اشتغل ✓" : "الإرسال التلقائي اتوقف");
}
