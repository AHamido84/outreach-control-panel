/**
 * Exact ports of pure helpers in apps-script/Code.gs (v2).
 * Each function keeps the engine's behaviour, including its quirks; tests/engine-port.test.ts
 * runs every one of them side by side with the real Code.gs in a vm.
 * Runs on both server and client (no Node APIs).
 */

export type Row = Record<string, unknown>;

export const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
export const BAD_EMAIL_PARTS = ["example.com", "example.org", "domain.com", "email.com", "sentry", "wixpress", ".png", ".jpg",
  ".jpeg", ".gif", ".webp", ".svg", "noreply", "no-reply", "donotreply"];
export const AR_DAYS: Record<number, string> = { 7: "الأحد", 1: "الاثنين", 2: "الثلاثاء", 3: "الأربعاء", 4: "الخميس", 5: "الجمعة", 6: "السبت" };
export const WEEK_AR = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];



export function norm_(s: unknown): string {
  return String(s || "").trim().toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
}

export function normalizeUrl_(u: unknown): string {
  let s = String(u || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  return s;
}

export function domainOf_(u: unknown): string {
  const s = String(u || "").trim().toLowerCase();
  if (!s) return "";
  return s.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[\/?#:]/)[0];
}

export function isValidEmail_(e: unknown): boolean {
  const s = String(e || "").toLowerCase().trim();
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(s)) return false;
  for (const p of BAD_EMAIL_PARTS) if (s.indexOf(p) > -1) return false;
  return true;
}

export function pickEmail_(raw: unknown, site: unknown): string {
  const list = (String(raw).match(EMAIL_RE) || []).map((e) => e.toLowerCase()).filter(isValidEmail_);
  if (!list.length) return "";
  const d = domainOf_(site);
  const same = list.filter((e) => d && e.split("@")[1] === d);
  return same[0] || list[0];
}

export function boardIdOf_(v: unknown): string {
  const s = String(v ?? "").trim();
  const m = s.match(/boards\/(\d+)/);
  if (m) return m[1];
  if (typeof v === "number") return v.toFixed(0);
  return s.replace(/\D/g, "");
}

export function matchSegment_(L: Row, segments: Row[]): Row | null {
  const act = norm_(L["النشاط"]), country = norm_(L["البلد"]), city = norm_(L["المدينة"]);
  if (!act) return null;
  for (const s of segments) {
    const sAct = norm_(s["النشاط"]), sCountry = norm_(s["البلد"]), sCity = norm_(s["المدينة (اختياري)"]);
    if (!sAct || (act.indexOf(sAct) === -1 && sAct.indexOf(act) === -1)) continue;
    if (sCountry && country && country !== sCountry) continue;
    if (sCity && (!city || (city.indexOf(sCity) === -1 && sCity.indexOf(city) === -1))) continue;
    return s;
  }
  return null;
}

export function activeSegments_(rows: Row[]): Row[] {
  return rows.filter((s) => s["كود الـ Segment"] && s["مفعّل"] !== "لا");
}

/** Exactly how the engine builds {التوقيع}. */
export function signature_(c: Row, lang: string): string {
  const isAr = lang !== "EN";
  return [c["اسم المرسل"], c["المنصب"], c["اسم الشركة"], c["رقم الواتساب"] ? (isAr ? "واتساب: " : "WhatsApp: ") + c["رقم الواتساب"] : ""]
    // engine: .filter(String).join('\n') — keeps undefined (String(undefined) is truthy) and join prints it as ''
    .filter((x) => !!String(x))
    .join("\n");
}

/** Variables the engine makes available to a template (lead columns + Company keys + computed). */
export function templateVars_(L: Row, c: Row, lang: string): Record<string, unknown> {
  const vars: Record<string, unknown> = {};
  Object.keys(L).forEach((k) => { if (k.charAt(0) !== "_") vars[k.replace(/\s+/g, "_")] = L[k]; });
  Object.keys(c).forEach((k) => { vars[k.replace(/\s+/g, "_")] = c[k]; });
  const isAr = lang !== "EN";
  vars["اسم_الشخص"] = L["اسم الشخص"] || (isAr ? "فريق " + L["اسم الجهة"] : L["اسم الجهة"] + " team");
  vars["اسم_شركتنا"] = c["اسم الشركة"];
  vars["اسم_المرسل"] = c["اسم المرسل"];
  vars["وصف_الخدمة"] = c["وصف الخدمة في سطر"];
  vars["لينك_الحجز"] = c["لينك صفحة الحجز"];
  const prof = String(c["لينك البروفايل"] || "");
  vars["لينك_البروفايل"] = prof ? prof + (prof.indexOf("?") > -1 ? "&" : "?") + "ref=" + L["ID"] : "";
  vars["التوقيع"] = signature_(c, lang);
  return vars;
}

export type FillResult = { text: string; missing: string[] };

/**
 * Port of fillTemplate_. The engine throws on missing variables; here we return them so the
 * editor can warn. Date values from the sheet reach the dashboard as formatted strings already.
 */
export function fillTemplate(text: string, L: Row, c: Row, lang: string): FillResult {
  const vars = templateVars_(L, c, lang);
  const missing: string[] = [];
  const out = String(text).replace(/\{([^{}]+)\}/g, (m, key: string) => {
    const k = key.trim().replace(/\s+/g, "_");
    const v = vars[k];
    if (v === undefined || v === null || String(v).trim() === "") { missing.push(key); return m; }
    return String(v);
  });
  return { text: out, missing };
}

/** Same as the engine: throws "متغيرات ناقصة: ..." */
export function fillTemplate_(text: string, L: Row, c: Row, lang: string): string {
  const r = fillTemplate(text, L, c, lang);
  if (r.missing.length) throw new Error("متغيرات ناقصة: " + r.missing.join("، "));
  return r.text;
}

/** Parts of a date in an IANA time zone. */
function zoned(now: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hourCycle: "h23" })
    .formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")!.value;
  const h = Number(parts.find((p) => p.type === "hour")!.value);
  const u = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[wd as "Mon"]!;
  return { u, h };
}

export function inSendWindow_(c: Row, now = new Date(), scriptTz = "Asia/Riyadh"): boolean {
  const tz = String(c["المنطقة الزمنية"] || scriptTz);
  const z = zoned(now, tz);
  const dayName = AR_DAYS[z.u];
  const days = String(c["أيام الإرسال"] || "").split(/[,،]/).map((d) => d.trim());
  if (days.indexOf(dayName) === -1) return false;
  return z.h >= Number(c["ساعة بداية الإرسال"] || 9) && z.h < Number(c["ساعة نهاية الإرسال"] || 12);
}

/** {variable} names used in a text. */
export function varsIn(text: string): string[] {
  const out: string[] = [];
  String(text).replace(/\{([^{}]+)\}/g, (_m, k: string) => { out.push(k.trim()); return ""; });
  return [...new Set(out)];
}

/** Pick of A/B version for a lead's first step (planNextStep_). */
export function pickVersion_<T extends { version: string }>(variants: T[], leadId: unknown): T | undefined {
  let pool = variants.filter((t) => t.version === "A" || t.version === "B");
  if (!pool.length) pool = variants;
  const n = Number(String(leadId).replace(/\D/g, "")) || 0;
  return pool[n % pool.length];
}
