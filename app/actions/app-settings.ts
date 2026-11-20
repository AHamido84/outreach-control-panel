"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ar } from "@/content/ar";
import { act, fail } from "@/lib/actions";
import { assertAdmin, assertOwner } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { sheetsFor } from "@/lib/sheets";
import { TAB } from "@/lib/sheets/schema";
import {
  deleteSecret, getCompany, setSecret, updateSettings, DEFAULT_DEFAULTS, type Defaults, type GoogleMode,
} from "@/lib/store/model";

const T = ar.appSettings;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ------------------------------------------------------------------ Google connection (owner)

export async function setGoogleMode(mode: GoogleMode) {
  return act(async () => {
    await assertOwner();
    await updateSettings((s) => { s.google.mode = mode; });
    revalidatePath("/settings");
  }, ar.common.saved);
}

export async function saveServiceAccount(json: string) {
  return act(async () => {
    await assertOwner();
    let j: { client_email?: string; private_key?: string; type?: string };
    try { j = JSON.parse(json); } catch { return fail(T.google.badJson); }
    if (!j.client_email || !j.private_key) return fail(T.google.badJson);
    await setSecret({ scope: "app", name: "serviceAccountJson" }, JSON.stringify(j));
    await updateSettings((s) => { s.google = { ...s.google, mode: "serviceAccount", serviceAccountEmail: j.client_email, connectedAt: new Date().toISOString() }; });
    revalidatePath("/settings");
  }, ar.common.saved);
}

export async function disconnectGoogle() {
  return act(async () => {
    await assertOwner();
    const s = await updateSettings((s) => {
      if (s.google.mode === "oauth") { s.google.oauthEmail = undefined; } else { s.google.serviceAccountEmail = undefined; }
      s.google.connectedAt = undefined;
    });
    await deleteSecret({ scope: "app", name: s.google.mode === "serviceAccount" ? "serviceAccountJson" : "googleRefreshToken" });
    revalidatePath("/settings");
  }, T.google.disconnected);
}

/** Reads one cell (Company!A1) from a company sheet. */
export async function testGoogle(slug: string) {
  return act(async () => {
    await assertAdmin();
    const c = await getCompany(slug);
    if (!c) return fail("الشركة مش موجودة");
    const s = await sheetsFor(c);
    const meta = await s.meta(true);
    await s.table(TAB.COMPANY, true);
    return { ok: true as const, message: T.google.testOk(meta.title) };
  });
}

// ------------------------------------------------------------------ access (owner)

export async function addAdmin(email: string) {
  return act(async () => {
    await assertOwner();
    const e = email.trim().toLowerCase();
    if (!EMAIL.test(e)) return fail(T.access.invalid);
    let exists = false;
    await updateSettings((s) => {
      if (e === env.ownerEmail || s.admins.includes(e)) { exists = true; return; }
      s.admins.push(e);
    });
    if (exists) return fail(T.access.exists);
    revalidatePath("/settings");
  }, T.access.added);
}

export async function removeAdmin(email: string) {
  return act(async () => {
    await assertOwner();
    const e = email.trim().toLowerCase();
    if (e === env.ownerEmail) return fail("صاحب الحساب مايتشالش");
    await updateSettings((s) => { s.admins = s.admins.filter((a) => a !== e); });
    revalidatePath("/settings");
  }, T.access.removed);
}

// ------------------------------------------------------------------ defaults / notifications (admins)

export async function saveDefaults(d: Defaults) {
  return act(async () => {
    await assertAdmin();
    const clean: Defaults = {
      dailyCap: Math.max(1, Math.round(Number(d.dailyCap) || DEFAULT_DEFAULTS.dailyCap)),
      days: d.days.length ? d.days : DEFAULT_DEFAULTS.days,
      startHour: Math.min(23, Math.max(0, Number(d.startHour))),
      endHour: Math.min(24, Math.max(1, Number(d.endHour))),
      perRun: Math.max(1, Math.round(Number(d.perRun) || 2)),
      gapSec: Math.max(0, Math.round(Number(d.gapSec) || 0)),
      maxBounce: Math.min(1, Math.max(0, Number(d.maxBounce) || 0.03)),
      waitDays: Math.max(0, Math.round(Number(d.waitDays) || 4)),
      timezone: d.timezone || DEFAULT_DEFAULTS.timezone,
    };
    if (clean.endHour <= clean.startHour) return fail(ar.companySettings.schedule.hoursInvalid);
    await updateSettings((s) => { s.defaults = clean; });
    revalidatePath("/settings");
  }, ar.common.saved);
}

export async function saveNotificationEmails(text: string) {
  return act(async () => {
    await assertAdmin();
    const emails = [...new Set(text.split(/[\s,،;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
    const bad = emails.filter((e) => !EMAIL.test(e));
    if (bad.length) return fail(T.access.invalid, bad.join(", "));
    await updateSettings((s) => { s.notifications.emails = emails; });
    revalidatePath("/settings");
  }, ar.common.saved);
}

/** Writes the alert email(s) into the Company tab's «إيميل التنبيهات» so the engine sends reply/booking summaries. */
export async function writeAlertEmailToSheet(slug: string, emails: string) {
  return act(async () => {
    await assertAdmin();
    const c = await getCompany(slug);
    if (!c) return fail("الشركة مش موجودة");
    const s = await sheetsFor(c);
    // MailApp.sendEmail accepts a comma-separated list
    await s.setCompany({ "إيميل التنبيهات": emails.split(/[\s,،;]+/).filter(Boolean).join(",") });
    return { ok: true as const, message: T.notifications.written(c.name) };
  });
}

/** Last step of the first-run wizard. */
export async function completeSetup(slug: string) {
  const r = await act(async () => {
    await assertOwner();
    await updateSettings((s) => { s.setupDone = true; });
  });
  if (r.ok) redirect(`/c/${slug}`);
  return r;
}
