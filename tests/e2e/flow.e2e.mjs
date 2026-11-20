// Full mock-mode flow from PROMPT.md:
// setup wizard → sender check → import → process → dry run → send → results with monday ✓/✗ → retry → scheduled → cancel
// + every page renders (desktop + phone screenshots, no horizontal scroll, no page errors).
// Run against a mock server with a clean .data:  BASE=http://localhost:3100 node tests/e2e/flow.e2e.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import assert from "node:assert";
const { chromium, devices } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = process.env.SHOTS || "screenshots";
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log("•", ...a);
const T = 120000;

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ar" })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const go = async (p) => { await page.goto(BASE + p); await page.waitForLoadState("networkidle"); };
const see = (t, timeout = T) => page.getByText(t).first().waitFor({ timeout });

// ---------- 1. setup wizard with a brand-new company (bare copy of the Master)
await go("/setup?step=1");
await page.getByRole("link", { name: "التالي" }).click();
await page.getByLabel("اسم الشركة").fill("Gulf Builders");
await page.getByLabel("لينك الشيت").fill("https://docs.google.com/spreadsheets/d/mock-gulf-builders-0001/edit");
await page.getByRole("button", { name: "إضافة وفحص الشيت" }).click();
await see("تابات الداشبورد (Commands / Send Results / System) ناقصة");
log("wizard: missing dashboard tabs detected with Code.gs instructions");
await page.getByRole("button", { name: "محاكاة «إعداد أول مرة» (تجريبي)" }).click();
await see("الشيت سليم ✓");
await page.getByRole("link", { name: "التالي" }).click();
await see("ENGINE_KEY");
await page.getByRole("button", { name: "إظهار" }).click();
await page.getByRole("button", { name: "محاكاة «ربط الداشبورد» (تجريبي)" }).click();
await see("المحرك مربوط ✓", 30000);
log("wizard: engine linked (polled System.dashboardLinked)");
await page.getByRole("link", { name: "التالي" }).click();
await page.getByRole("button", { name: "افحص دلوقتي" }).click();
await see("خلص ✓");
log("wizard: checkSender done");
await page.getByRole("link", { name: "التالي" }).click();
await page.getByRole("link", { name: "تخطي (من غير monday)" }).click();
await page.getByRole("button", { name: "افتح النظرة العامة" }).click();
await page.waitForURL(/\/c\/gulf-builders$/, { timeout: 30000 });
await see("إجمالي الليدز");
log("wizard: done → overview");

// ---------- 2. import → process (Arab Computers: monday on)
const C = "/c/arab-computers";
await go(C + "/data?tab=import");
const tsv = ["Company\tEmail\tWebsite\tPhone\tIndustry\tCity\tCountry",
  "شركة الريادة\tinfo@riyada-build.sa\triyada-build.sa\t0551234567\tمقاولات\tالرياض\tالسعودية",
  "Duplicate Co\tsaad@bena-modern.sa\t\t\tمقاولات\tالرياض\tالسعودية",
  "No Email Co\t\t\t\tمقاولات\tالرياض\t",
  "Bad Email Co\tnot-an-email\t\t\tمقاولات\tالرياض\t",
  "Pearl Dental\thello@pearl-dental-jed.com\tpearl-dental-jed.com\t\tعيادات\tجدة\tالسعودية",
  "Blocked\tsales@competitor.com\t\t\tمقاولات\tالرياض\t"].join("\n");
await page.getByLabel("أو الصق جدول (من Excel أو Google Sheets)").fill(tsv);
await page.getByRole("button", { name: "كمّل" }).click();
await page.getByRole("button", { name: "مصدر جديد" }).click();
await page.getByLabel("اسم المصدر").fill("Apollo — تجربة");
await page.getByRole("button", { name: "كمّل" }).click();
assert.strictEqual(await page.getByLabel("الحقل لـ Email").inputValue(), "الإيميل");
await page.getByRole("button", { name: "معاينة" }).click();
const chips = (await page.locator("button.rounded-lg.border.px-3").allInnerTexts()).join(" | ");
assert.ok(/جديد\s*2/.test(chips) && /مكرر\s*1/.test(chips) && /Do-Not-Contact\s*1/.test(chips), chips);
log("import preview:", chips.replace(/\s+/g, " "));
await page.getByRole("button", { name: /استورد/ }).click();
// the Master's example row is still in Import: confirm clearing it, then run again
await page.getByRole("button", { name: "امسح تاب Import" }).click({ timeout: 60000 });
await page.getByRole("button", { name: "ابدأ الاستيراد تاني" }).click();
await see("الاستيراد خلص ✓", 180000);
const impText = await page.getByText(/^الاستيراد: /).first().innerText();
assert.ok(/جديد 2 · مكرر 1 · بدون إيميل 2 · ممنوع 1/.test(impText), impText);
log("import + process:", impText, "|", await page.getByText(/^التجهيز: /).first().innerText());
await go(C + "/data?tab=leads&q=" + encodeURIComponent("الريادة"));
assert.ok((await page.locator("tbody tr").first().innerText()).includes("info@riyada-build.sa"));
log("imported lead visible in the leads table");

// ---------- 3. dry run → send → results (Gmail + monday ✓/✗) → retry
await go(C + "/send");
await page.locator("#m-count").fill("8");
await page.getByRole("button", { name: "معاينة (Dry run)" }).click();
await see(/معاينة: \d+ هيتبعتلهم/, T);
log("dry run:", await page.getByText(/معاينة: \d+ هيتبعتلهم/).first().innerText());
await page.getByRole("button", { name: "إرسال…" }).click();
await see("تأكيد الإرسال");
assert.ok((await page.getByRole("dialog").innerText()).includes("Arab Computers"), "dialog names the company");
for (const t of ["ابعت برضه", "ابعت دلوقتي"]) { const c = page.getByRole("dialog").locator("label", { hasText: t }).locator("input"); if (await c.count()) await c.check(); }
await page.getByRole("button", { name: /^ابعت \d+/ }).click();
await see(/^اتبعت \d+/, T);
const resultRows = await page.locator("table tbody tr").allInnerTexts();
assert.ok(resultRows.length >= 1 && resultRows.every((r) => r.includes("Gmail")), resultRows.join("\n"));
log("send:", await page.getByText(/^اتبعت \d+/).first().innerText(), `— ${resultRows.length} result rows with Gmail links`);
const okMonday = await page.locator("[aria-label='monday ✓']").count();
const retry = page.getByRole("button", { name: "Retry" });
log(`monday ✓ ${okMonday}, ✗ ${await retry.count()}`);
assert.ok(okMonday > 0, "monday ✓ shown");
if (await retry.count()) {
  await retry.first().click();
  await see("(اتصلّح)", T);
  log("monday retry fixed the failed lead");
} else log("no monday failure this run (the fake fails ~1 in 6 updates)");

// ---------- 4. scheduled → cancel
await page.getByRole("button", { name: "جدول" }).first().click();
await page.getByRole("dialog").getByRole("button", { name: "جدول" }).click();
await see("الإرسال اتجدول ✓");
await go(C + "/send");
const sched = page.locator("section", { hasText: "إرسال مجدول" });
assert.strictEqual(await sched.locator("li").count(), 1);
await sched.locator("li").first().getByRole("button", { name: "إلغاء" }).click();
await see("اتلغى");
await go(C + "/activity?status=" + encodeURIComponent("ملغي"));
assert.ok((await page.locator("tbody tr").count()) >= 1);
log("scheduled send cancelled (shows as ملغي in Activity)");

// ---------- 5. leads bulk + DNC
await go(C + "/data?tab=dnc");
await page.getByLabel("إيميلات أو دومينات (واحد في كل سطر)").fill("spam-domain.com\nperson@nope.com");
await page.getByRole("button", { name: "إضافة" }).click();
await see("اتضاف 2");
log("DNC added");
await go(C + "/status?tab=attention");
await see("من غير Segment");
log("status/attention renders");

assert.deepStrictEqual(errors, [], "no page errors");

// ---------- screenshots of every page
const pages = [
  ["overview", C], ["data-leads", C + "/data?tab=leads"], ["data-import", C + "/data?tab=import"], ["data-dnc", C + "/data?tab=dnc"],
  ["send", C + "/send"], ["status", C + "/status"], ["status-attention", C + "/status?tab=attention"], ["activity", C + "/activity"], ["activity-log", C + "/activity?tab=log"],
  ["settings-company", C + "/settings?tab=sender"], ["settings-content", C + "/settings?tab=content&sub=Templates"],
  ["settings-app", "/settings?tab=google"], ["companies", "/companies"],
  ["setup-1", "/setup?step=1"], ["setup-3", "/setup?step=3&c=arab-computers"], ["setup-4", "/setup?step=4&c=arab-computers"],
];
for (const [kind, opts] of [["desktop", { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }], ["mobile", { ...devices["iPhone 13"] }]]) {
  const ctx = await browser.newContext({ ...opts, locale: "ar" });
  const p = await ctx.newPage();
  for (const [name, path] of pages) {
    await p.goto(BASE + path); await p.waitForLoadState("networkidle");
    const sw = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(sw <= 1, `horizontal scroll on ${kind}/${name}: ${sw}px`);
    await p.screenshot({ path: `${OUT}/${kind}-${name}.png`, fullPage: true });
  }
  await ctx.close();
}
log("screenshots →", OUT);
await browser.close();
console.log("\nFULL FLOW E2E PASSED");
