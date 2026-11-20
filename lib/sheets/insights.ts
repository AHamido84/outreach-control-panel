import "server-only";
import { isValidEmail_ } from "@/lib/engine-port";
import type { CompanySheets } from "./index";
import { leads as readLeads, logRows, mondayState, sendResults, type Lead } from "./queries";
import { CMD, yes, type Command, type SystemInfo } from "./schema";

/** Global warnings for a company (header banners). */
export type Alert = { kind: "failed" | "stale" | "bounce" | "stuck" | "unlinked"; text: string; href: string };

export async function companyAlerts(s: CompanySheets, slug: string, sys: SystemInfo | null, now = Date.now()): Promise<Alert[]> {
  const out: Alert[] = [];
  if (!sys || !sys._rows?.length) return out;
  const age = (now - Number(sys.heartbeat || 0)) / 60e3;
  if (age > 10) out.push({ kind: "stale", text: `المحرك ماحدّثش حالته من ${Math.round(age)} دقيقة — التشغيل التلقائي ممكن يكون واقف`, href: `/c/${slug}/settings?tab=advanced` });
  if (sys.dashboardLinked !== "نعم") out.push({ kind: "unlinked", text: "المحرك مش مربوط بالداشبورد (ENGINE_KEY)", href: "/companies" });
  const [cmds, log] = await Promise.all([s.commands(), logRows(s, 50)]);
  const failed = cmds.filter((c) => c.status === CMD.FAILED && now - Date.parse(c.executedAt || c.createdAt) < 24 * 3600e3);
  if (failed.length) out.push({ kind: "failed", text: `${failed.length} أمر فشل في آخر 24 ساعة`, href: `/c/${slug}/activity?status=فشل` });
  const stuck = cmds.filter((c) => c.status === CMD.PENDING && (!c.at || Date.parse(c.at) <= now) && now - Date.parse(c.at || c.createdAt) > 3 * 60e3);
  if (stuck.length) out.push({ kind: "stuck", text: `المحرك شكله واقف — ${stuck.length} أمر مستني أكتر من 3 دقايق. راجع التشغيل التلقائي`, href: `/c/${slug}/settings?tab=advanced` });
  const bg = log.find((l) => l.fn === "bounceGuard" && now - Date.parse(l.time.replace(" ", "T") + ":00Z") < 7 * 864e5);
  if (bg && !yes(sys.sendingEnabled)) out.push({ kind: "bounce", text: "الإرسال وقف لوحده بسبب نسبة Bounce عالية — راجع جودة الداتا قبل ما تشغّله", href: `/c/${slug}/status` });
  return out;
}

// ------------------------------------------------------------------ overview

const count = <T,>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, number>();
  xs.forEach((x) => { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
};

export async function overview(s: CompanySheets, sys: SystemInfo | null, mondayOn: boolean, tz: string) {
  const [L, results, cmds, log] = await Promise.all([readLeads(s), sendResults(s), s.commands(), logRows(s, 8)]);
  const contacted = L.filter((l) => l["تاريخ أول إرسال"]);
  const st = (v: string) => L.filter((l) => l["حالة التواصل"] === v).length;
  const replied = st("رد") + st("حجز جلسة");
  const bounced = st("Bounce");

  // sent per day, last 14 days (Send Results, real sends only), days in the company time zone
  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) days.push(dayFmt.format(new Date(Date.now() - i * 864e5)));
  const perDay = new Map(days.map((d) => [d, 0]));
  results.filter((r) => r.sent === "نعم").forEach((r) => { const d = r.time.slice(0, 10); if (perDay.has(d)) perDay.set(d, perDay.get(d)! + 1); });

  const monday = { synced: 0, failed: 0, pending: 0 };
  L.forEach((l) => {
    const m = mondayState(l["حالة monday"] || "");
    if (m === "تم") monday.synced++;
    else if (m === "فشل") monday.failed++;
    else if (mondayOn && l["حالة التواصل"]) monday.pending++;
  });

  return {
    total: L.length,
    byProc: count(L, (l) => l["حالة المعالجة"]),
    byContact: count(L, (l) => (l["حالة التواصل"].startsWith("متابعة") ? "متابعة" : l["حالة التواصل"])),
    sentToday: Number(sys?.sentToday) || 0,
    cap: Number(sys?.dailyCap) || 0,
    replies: st("رد"), bookings: st("حجز جلسة"), bounces: bounced,
    bounceRate: contacted.length ? bounced / contacted.length : 0,
    contacted: contacted.length,
    monday,
    perDay: days.map((d) => ({ day: d, value: perDay.get(d)! })),
    funnel: [{ name: "تم الإرسال", value: contacted.length }, { name: "رد", value: replied }, { name: "حجز جلسة", value: st("حجز جلسة") }],
    bySource: count(L, (l) => l["كود المصدر"]),
    bySegment: count(L.filter((l) => l["كود الـ Segment"]), (l) => l["كود الـ Segment"]),
    commands: cmds.slice(0, 6),
    log,
  };
}

// ------------------------------------------------------------------ needs attention

export function attention(L: Lead[], cmds: Command[], sys: SystemInfo | null, now = Date.now()) {
  return {
    mondayFailed: L.filter((l) => mondayState(l["حالة monday"] || "") === "فشل"),
    noSegment: L.filter((l) => l["حالة المعالجة"] === "جديد" && l["الإيميل"] && !l["كود الـ Segment"]),
    badEmail: L.filter((l) => l["حالة المعالجة"] === "إيميل غلط" || (l["الإيميل"] && !isValidEmail_(l["الإيميل"]) && l["حالة المعالجة"] !== "مكرر")),
    failedCommands: cmds.filter((c) => c.status === CMD.FAILED && now - Date.parse(c.executedAt || c.createdAt) < 7 * 864e5),
    senderUnverified: !!sys?._rows?.length && sys.senderVerified !== "نعم",
  };
}
