"use server";

import { revalidatePath } from "next/cache";
import { act, fail } from "@/lib/actions";
import { assertCompany } from "@/lib/auth/guards";
import { sheetsFor } from "@/lib/sheets";
import { addDnc, clearImport, LEAD_EDITABLE, pendingOfType, removeDnc, updateLead, updateLeads, writeImportChunk } from "@/lib/sheets/queries";
import { TAB } from "@/lib/sheets/schema";
import { store } from "@/lib/store/store";

async function load(slug: string) {
  const { user, company: c } = await assertCompany(slug);
  return { user, c, s: await sheetsFor(c) };
}
const revalidate = (slug: string) => { revalidatePath(`/c/${slug}`, "layout"); };

// ------------------------------------------------------------------ leads

export async function editLead(slug: string, id: string, changes: Record<string, string>) {
  return act(async () => {
    const { s } = await load(slug);
    const clean = Object.fromEntries(Object.entries(changes).filter(([k]) => LEAD_EDITABLE.includes(k)));
    if (!Object.keys(clean).length) return fail("مافيش تغييرات");
    await updateLead(s, id, clean);
    revalidate(slug);
  }, "اتحفظ ✓");
}

export type BulkAction = "segment" | "dnc" | "ready" | "retryMonday";

export async function bulkLeads(slug: string, action: BulkAction, ids: string[], segment?: string) {
  return act(async () => {
    const { s, user } = await load(slug);
    if (!ids.length) return fail("اختار عملاء الأول");
    if (ids.length > 2000) return fail("كتير — اختار أقل من 2000");
    let message = "";
    if (action === "segment") {
      if (!segment) return fail("اختار Segment");
      const r = await updateLeads(s, ids, { "كود الـ Segment": segment });
      message = `اتغيّر الـ Segment لـ ${r.updated}` + (r.missing.length ? ` · مش موجودين: ${r.missing.length}` : "");
    } else if (action === "ready") {
      // only leads that have an email and a segment; replied/booked/removed/bounced are left alone
      const blocked = ["رد", "حجز جلسة", "طلب الإزالة", "Bounce"];
      const r = await updateLeads(s, ids, { "حالة التواصل": "جاهز" },
        (row) => !!row["الإيميل"] && !!row["كود الـ Segment"] && !blocked.includes(String(row["حالة التواصل"])));
      message = `رجعوا «جاهز»: ${r.updated}` + (r.skipped.length ? ` · اتسابوا (رد/حجز/إزالة/Bounce أو ناقصهم إيميل/Segment): ${r.skipped.length}` : "");
    } else if (action === "dnc") {
      const t = await s.table(TAB.LEADS, true);
      const emails = (t?.rows ?? []).filter((r) => ids.includes(String(r["ID"])) && r["الإيميل"]).map((r) => String(r["الإيميل"]));
      const a = await addDnc(s, emails, "يدوي", "من الداشبورد");
      // leads not yet contacted are marked so the engine skips them; the engine also checks DNC before every send
      const r = await updateLeads(s, ids, { "حالة المعالجة": "في Do-Not-Contact" }, (row) => !row["تاريخ أول إرسال"]);
      message = `اتضافوا لـ Do-Not-Contact: ${a.added}` + (r.updated ? ` · اتعلّم عليهم في Leads: ${r.updated}` : "");
    } else if (action === "retryMonday") {
      const id = await s.enqueue("retryMonday", { leadIds: ids }, { creator: user.email });
      revalidate(slug);
      return { ok: true as const, message: "اتبعت أمر إعادة المحاولة على monday", data: { id } };
    }
    revalidate(slug);
    return { ok: true as const, message };
  });
}

// ------------------------------------------------------------------ Do-Not-Contact

export async function dncAdd(slug: string, text: string, reason: string) {
  return act(async () => {
    const { s } = await load(slug);
    const r = await addDnc(s, text.split(/[\s,،;]+/), reason || "يدوي");
    revalidate(slug);
    if (r.bad.length) return { ok: false as const, error: `اتضاف ${r.added} — ومش مفهوم: ${r.bad.join("، ")}` };
    return { ok: true as const, message: `اتضاف ${r.added}` };
  });
}

export async function dncRemove(slug: string, row: number, value: string) {
  return act(async () => {
    const { s } = await load(slug);
    await removeDnc(s, row, value);
    revalidate(slug);
  }, "اتشال ✓");
}

// ------------------------------------------------------------------ import

const lockKey = (slug: string) => `lock:import:${slug}`;

export type ImportStart = {
  source: { code: string; create?: { name: string; type: string } };
  newMappings: { from: string; to: string }[];
};

/** Creates the source / mapping pairs if needed and takes the per-company import lock. */
export async function importStart(slug: string, p: ImportStart) {
  return act(async () => {
    const { s, user } = await load(slug);
    const code = p.source.code.trim();
    if (!code) return fail("اختار مصدر");
    if (!(await store().setNx(lockKey(slug), user.email, 30 * 60))) {
      const who = await store().get<string>(lockKey(slug));
      return fail(`فيه استيراد شغال دلوقتي${who ? " من " + who : ""} — استنى لما يخلص`);
    }
    try {
      if ((await pendingOfType(s, "import")).length) throw new Error("فيه أمر import لسه مستني المحرك");
      const sources = await s.table(TAB.SOURCES, true);
      const exists = sources?.rows.find((r) => String(r["كود المصدر"]).trim() === code);
      if (!exists) {
        if (!p.source.create) throw new Error(`المصدر ${code} مش موجود`);
        await s.appendRows(TAB.SOURCES, [{ "كود المصدر": code, "اسم المصدر": p.source.create.name || code, "النوع": p.source.create.type || "ملف", "مفعّل": "نعم", "ملاحظات": "من الداشبورد" }]);
      } else if (String(exists["مفعّل"]) === "لا") throw new Error(`المصدر ${code} متوقف (مفعّل = لا) — المحرك هيتجاهل الصفوف`);
      if (p.newMappings.length) {
        const m = await s.table(TAB.MAPPING, true);
        const have = new Set((m?.rows ?? []).map((r) => `${String(r["كود المصدر"]).trim()}|${String(r["اسم العمود في المصدر"]).trim()}`));
        const rows = p.newMappings.filter((x) => x.from.trim() && x.to && !have.has(`${code}|${x.from.trim()}`))
          .map((x) => ({ "كود المصدر": code, "اسم العمود في المصدر": x.from.trim(), "الحقل الموحد": x.to }));
        await s.appendRows(TAB.MAPPING, rows);
      }
    } catch (e) {
      await store().del(lockKey(slug));
      return fail((e as Error).message);
    }
    return { ok: true as const };
  });
}

/** Writes one chunk (≤500 rows) to Import and queues `import` (+ `process` after the last chunk). */
export async function importChunk(slug: string, source: string, headers: string[], rows: string[][], last: boolean) {
  return act(async () => {
    const { s, user } = await load(slug);
    if ((await store().get<string>(lockKey(slug))) !== user.email) return fail("انتهت مهلة الاستيراد — ابدأ تاني");
    if (rows.length > 500) return fail("الدفعة أكبر من 500 صف");
    await writeImportChunk(s, source, headers, rows);
    const importId = await s.enqueue("import", {}, { creator: user.email });
    const processId = last ? await s.enqueue("process", {}, { creator: user.email }) : undefined;
    await store().set(lockKey(slug), user.email, { ttlSec: 30 * 60 }); // keep the lock while chunks continue
    return { ok: true as const, data: { importId, processId } };
  });
}

export async function importFinish(slug: string) {
  return act(async () => {
    await load(slug);
    await store().del(lockKey(slug));
    revalidate(slug);
  });
}

/** After a failed import: clear Import rows 3+ (asks the user first in the UI). */
export async function importClear(slug: string) {
  return act(async () => {
    const { s } = await load(slug);
    if ((await pendingOfType(s, "import")).length) return fail("فيه أمر import لسه مستني — الغيه الأول من صفحة السجل");
    const n = await clearImport(s);
    return { ok: true as const, message: `اتمسح ${n} صف من تاب Import` };
  });
}
