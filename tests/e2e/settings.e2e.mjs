// Mock-mode click-through of the settings pages + screenshots.
// Run against `npm run dev:mock` (or a mock build):  BASE=http://localhost:3100 node tests/e2e/settings.e2e.mjs
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import assert from "node:assert";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = process.env.SHOTS || "screenshots";
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("•", ...a);
const done = (page, text, timeout = 45000) => page.getByText(text).first().waitFor({ timeout });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ar" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

const go = async (path) => { await page.goto(BASE + path); await page.waitForLoadState("networkidle"); };
const C = "/c/arab-computers/settings";

// ---------- profile
await go(C + "?tab=profile");
const desc = page.getByLabel("وصف الخدمة في سطر");
await desc.fill("بنساعد الشركات تنظّم المبيعات — تعديل من الداشبورد");
await page.getByRole("button", { name: "حفظ" }).first().click();
await done(page, "اتحفظ ✓");
log("profile saved");

// ---------- sender: live signature, check sender, deliverability, test email
await go(C + "?tab=sender");
await page.getByLabel("المنصب").fill("مدير المبيعات");
await done(page, "مدير المبيعات");
await page.getByRole("button", { name: "افحص دلوقتي" }).click();
await done(page, "في انتظار المحرك");
await done(page, "خلص ✓").catch(async () => { await page.getByText(/aliases|ahmed@/).first().waitFor(); });
log("checkSender done");
await page.getByRole("button", { name: "افحص الدومين" }).click();
await page.getByText("SPF").first().waitFor({ timeout: 30000 });
log("deliverability rendered");
await page.getByRole("button", { name: "ابعت إيميل تجريبي" }).click();
await done(page, "افتحه في Gmail", 60000);
log("sendTest done with Gmail link");

// ---------- schedule: warm-up warning + invalid hours rollback + valid save
await go(C + "?tab=schedule");
await page.getByLabel("الحد اليومي للإيميلات").fill("60");
await done(page, "أعلى من المقترح");
await page.getByLabel("ساعة بداية الإرسال").fill("13");
await page.getByRole("button", { name: "حفظ" }).click();
await done(page, "ساعة النهاية لازم تبقى بعد ساعة البداية");
assert.strictEqual(await page.getByLabel("ساعة بداية الإرسال").inputValue(), "9", "rolled back");
await page.getByLabel("الحد اليومي للإيميلات").fill("25");
await page.getByRole("button", { name: "الإرسال شغال" }).first().waitFor().catch(() => {});
await page.getByRole("switch").first().click();
await page.getByRole("button", { name: "حفظ" }).click();
await done(page, "اتحفظ ✓");
log("schedule saved; invalid hours rolled back");

// ---------- monday: bad token, good token → sealed command, test connection
await go(C + "?tab=monday");
await page.getByLabel("monday API Token").fill("bad-token-xxxxxxxxxxxxxxxxx");
await page.getByRole("button", { name: "تحقق واحفظ وابعت للمحرك" }).click();
await done(page, "التوكن مش صحيح");
await page.getByLabel("monday API Token").fill("eyJhbGciOiJIUzI1NiJ9.mock-valid-token-123456");
await page.getByRole("button", { name: "تحقق واحفظ وابعت للمحرك" }).click();
await done(page, "التوكن صحيح ✓");
await done(page, "التوكن اتحفظ", 60000);
log("monday token sealed + saved by engine");
await page.getByRole("button", { name: "اختبر الاتصال" }).click();
await done(page, "البورد ظاهر ✓", 60000);
log("testMonday ok");

// ---------- content: segments share warning, template preview + save
await go(C + "?tab=content&sub=Segments");
const share = page.getByLabel("نصيبه من الحد اليومي").first();
await share.fill("0.5");
await done(page, "لازم المجموع يبقى 100%");
await share.fill("0.6");
await go(C + "?tab=content&sub=Templates");
await done(page, "معاينة على عميل حقيقي");
await page.getByRole("button", { name: "{اسم_المرسل}" }).click();
await page.getByRole("button", { name: "حفظ التغييرات" }).click();
await done(page, "اتحفظ ✓");
log("template edited with variable chip + saved");

// ---------- advanced: system table + pause
await go(C + "?tab=advanced");
await page.getByText("heartbeat").first().waitFor();
await page.getByRole("button", { name: "إيقاف كل الإرسال" }).click();
await page.getByRole("button", { name: "تأكيد" }).click();
await done(page, "الإرسال اتوقف ✓");
log("paused sending");

// ---------- nile clinics: unverified sender instructions, not linked
await go("/c/nile-clinics/settings?tab=sender");
await done(page, "إزاي تفعّل الإيميل المرسل");
log("unverified sender instructions shown");

// ---------- app settings
await go("/settings?tab=access");
await done(page, "Editor");
await done(page, "افتح الشيت ← Share");
log("access tab explains sheet-sharing access");
await go("/settings?tab=defaults");
await page.getByRole("button", { name: "حفظ" }).click();
await done(page, "اتحفظ ✓");
await go("/settings?tab=notifications");
await page.getByRole("button", { name: "اكتبه في تاب Company (إيميل التنبيهات)" }).first().click();
await done(page, "اتكتب في شيت");
log("alert email written to sheet");
await go("/settings?tab=google");
await page.getByRole("button", { name: "اختبار" }).click();
await done(page, "الاتصال شغال ✓");
log("google test ok (mock)");

// ---------- companies: add a fresh Master copy → needs setup → simulate → test ok
await go("/companies");
await page.getByRole("button", { name: "إضافة شركة" }).click();
await page.getByLabel("اسم الشركة").fill("Delta Labs");
await page.getByLabel("لينك الشيت").fill("https://docs.google.com/spreadsheets/d/mock-delta-labs-0001/edit");
await page.getByRole("button", { name: "إضافة شركة" }).click();
await done(page, "الشركة اتضافت ✓");
await done(page, "تابات الداشبورد");
const card = page.locator("li", { hasText: "Delta Labs" });
await card.getByRole("button", { name: "محاكاة «إعداد أول مرة» في الشيت" }).click();
await card.getByRole("button", { name: "محاكاة «ربط الداشبورد» في الشيت" }).click();
await page.waitForTimeout(800);
await page.locator("li", { hasText: "Delta Labs" }).getByRole("button", { name: "اختبر الاتصال" }).click();
await done(page, "الشيت سليم ✓");
await page.locator("li", { hasText: "Delta Labs" }).getByRole("button", { name: "إظهار" }).click();
log("company added, set up, linked, tested; ENGINE_KEY revealed");

assert.deepStrictEqual(errors.filter((e) => !/hydrat/i.test(e)), [], "no page errors");

// ---------- screenshots (desktop @2x, iPhone)
const pages = [
  ["settings-google", "/settings?tab=google"], ["settings-access", "/settings?tab=access"], ["settings-defaults", "/settings?tab=defaults"],
  ["settings-notifications", "/settings?tab=notifications"], ["settings-diagnostics", "/settings?tab=diagnostics"], ["companies", "/companies"],
  ...["profile", "sender", "schedule", "monday", "booking", "advanced"].map((t) => [`company-${t}`, `${C}?tab=${t}`]),
  ["company-content-segments", `${C}?tab=content&sub=Segments`], ["company-content-templates", `${C}?tab=content&sub=Templates`],
  ["company-content-lists", `${C}?tab=content&sub=Lists`], ["nile-sender-unverified", "/c/nile-clinics/settings?tab=sender"],
];
for (const [kind, opts] of [["desktop", { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }], ["mobile", { ...devices["iPhone 13"] }]]) {
  const c2 = await browser.newContext({ ...opts, locale: "ar" });
  const p2 = await c2.newPage();
  for (const [name, path] of pages) {
    await p2.goto(BASE + path); await p2.waitForLoadState("networkidle");
    const sw = await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (sw > 1) console.warn(`  ! horizontal scroll on ${kind}/${name}: ${sw}px`);
    await p2.screenshot({ path: `${OUT}/${kind}-${name}.png`, fullPage: true });
  }
  await c2.close();
}
log("screenshots →", OUT);
await browser.close();
console.log("\nSETTINGS E2E PASSED");
