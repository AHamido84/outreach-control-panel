"use server";

import { revalidatePath } from "next/cache";
import { ar } from "@/content/ar";
import { act, fail } from "@/lib/actions";
import { assertCompany, assertUser } from "@/lib/auth/guards";
import { newEngineKey } from "@/lib/crypto/seal";
import { env } from "@/lib/env";
import { mockEngine } from "@/lib/mock/transport";
import { sheetsFor } from "@/lib/sheets";
import {
  engineKeyOf, ensureEngineKey, getCompany, getSettings, listCompanies, saveCompany, setSecret, sheetIdFromUrl, slugify, type Company, type Defaults,
} from "@/lib/store/model";

const T = ar.companies;

function defaultsToCompany(d: Defaults): Record<string, string | number> {
  return {
    "الحد اليومي للإيميلات": d.dailyCap, "أيام الإرسال": d.days.join(","), "ساعة بداية الإرسال": d.startHour, "ساعة نهاية الإرسال": d.endHour,
    "عدد الإيميلات في كل تشغيل": d.perRun, "الفاصل بين الإيميلات (ثواني)": d.gapSec, "أقصى نسبة Bounce": d.maxBounce,
    "أيام انتظار بعد آخر خطوة": d.waitDays, "المنطقة الزمنية": d.timezone,
  };
}

export type NewCompany = { name: string; slug?: string; sheetUrl: string; color: string; mondayAccount?: string; firstSendDate?: string };

export async function addCompany(input: NewCompany) {
  return act(async () => {
    await assertUser();
    const name = input.name.trim();
    if (!name) return fail("اكتب اسم الشركة");
    const sheetId = sheetIdFromUrl(input.sheetUrl);
    if (!sheetId) return fail(T.invalidUrl);
    const slug = slugify(input.slug?.trim() || name);
    if (await getCompany(slug)) return fail(T.slugTaken);
    const now = new Date().toISOString();
    const c: Company = {
      slug, name, color: input.color || "#0f766e", sheetUrl: input.sheetUrl.trim(), sheetId, active: true,
      mondayAccount: input.mondayAccount?.trim() || undefined, firstSendDate: input.firstSendDate || undefined, createdAt: now, updatedAt: now,
    };
    await saveCompany(c);
    await ensureEngineKey(slug);

    // structure check + defaults for empty Company values (never overwrites)
    let filled = 0, structure = null, error: string | undefined;
    try {
      const s = await sheetsFor(c);
      structure = await s.validateStructure();
      if (!structure.missingTabs.includes("Company")) {
        const cur = (await s.companyRows(true)).map;
        const d = defaultsToCompany((await getSettings()).defaults);
        const empty = Object.fromEntries(Object.entries(d).filter(([k]) => cur[k] === undefined || String(cur[k]).trim() === ""));
        filled = Object.keys(empty).length;
        if (filled) await s.setCompany(empty);
      }
    } catch (e) {
      error = (e as Error).message;
    }
    revalidatePath("/", "layout");
    return { ok: true as const, message: T.added + (filled ? " · " + T.defaultsApplied(filled) : ""), data: { slug, structure, error } };
  });
}

export async function updateCompany(slug: string, patch: Partial<Omit<Company, "slug" | "createdAt" | "updatedAt">>) {
  return act(async () => {
    const { company: c } = await assertCompany(slug);
    const next = { ...c, ...patch };
    if (patch.sheetUrl !== undefined) {
      const id = sheetIdFromUrl(patch.sheetUrl);
      if (!id) return fail(T.invalidUrl);
      next.sheetId = id;
    }
    await saveCompany(next);
    revalidatePath("/", "layout");
  }, ar.common.saved);
}

export async function testCompany(slug: string) {
  return act(async () => {
    const { company: c } = await assertCompany(slug);
    const s = await sheetsFor(c);
    const structure = await s.validateStructure();
    const system = structure.needsEngineSetup ? null : await s.system(true);
    return { structure, linked: system?.dashboardLinked === "نعم", heartbeat: Number(system?.heartbeat || 0) };
  });
}

export async function revealEngineKey(slug: string) {
  return act(async () => {
    await assertCompany(slug);
    return ensureEngineKey(slug);
  });
}

export async function regenerateEngineKey(slug: string) {
  return act(async () => {
    await assertCompany(slug);
    const k = newEngineKey();
    await setSecret(engineKeyOf(slug), k);
    return k;
  }, ar.common.saved);
}

export async function listCompaniesAction() {
  await assertUser();
  return listCompanies();
}

/** Mock mode only: do what the owner would do by hand in the sheet. */
export async function mockSimulate(slug: string, what: "setup" | "link") {
  return act(async () => {
    await assertUser();
    if (!env.mockSheets) return fail("متاح في الوضع التجريبي بس");
    const c = await getCompany(slug);
    if (!c) return fail("الشركة مش موجودة");
    const e = mockEngine(c.sheetId);
    if (what === "setup") { e.call("ensureDashboardTabs_"); e.call("installTriggers_"); }
    else { e.state.props.ENGINE_KEY = await ensureEngineKey(slug); e.call("ensureDashboardTabs_"); }
    e.call("writeSystem_", true);
    e.save();
    revalidatePath("/", "layout");
  }, ar.common.saved);
}
