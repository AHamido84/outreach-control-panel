import "server-only";
import fs from "node:fs";
import path from "node:path";
import { MockEngine, type MockState } from "./engine";
import { userEntered, type Workbook } from "./workbook";

const WB_PATH = path.join(process.cwd(), "apps-script", "test", "wb.json");

export const MOCK_COMPANIES = [
  { slug: "arab-computers", name: "Arab Computers", color: "#0f766e", sheetId: "mock-arab-computers", mondayAccount: "arabcomputers", linked: true },
  { slug: "nile-clinics", name: "Nile Clinics", color: "#7c3aed", sheetId: "mock-nile-clinics", mondayAccount: "", linked: false },
] as const;

/** A fresh copy of the Master sheet (typed like a real sheet: numbers are numbers, dates are dates). */
export function masterWorkbook(): Workbook {
  const raw = JSON.parse(fs.readFileSync(WB_PATH, "utf8")) as Record<string, string[][]>;
  const wb: Workbook = {};
  for (const [tab, rows] of Object.entries(raw)) {
    wb[tab] = rows.map((r, i) => r.map((v) => (i === 0 ? v : userEntered(v))));
  }
  return wb;
}

function setCompany(wb: Workbook, label: string, value: string | number) {
  const row = wb["Company"].find((r) => String(r[0]).trim() === label);
  if (row) row[1] = value;
  else wb["Company"].push([label, value, ""]);
}

const SAMPLE_LEADS: Record<string, string>[] = [
  { "اسم الجهة": "شركة البناء الحديث", "اسم الشخص": "سعد", "المنصب": "المدير العام", "الإيميل": "saad@bena-modern.sa", "الموقع": "https://bena-modern.sa", "التليفون": "0501234567", "النشاط": "مقاولات", "المدينة": "الرياض", "البلد": "السعودية" },
  { "اسم الجهة": "مؤسسة الأفق للمقاولات", "اسم الشخص": "", "المنصب": "", "الإيميل": "info@ofoq-cont.com", "الموقع": "ofoq-cont.com", "التليفون": "0112223344", "النشاط": "مقاولات", "المدينة": "الرياض", "البلد": "السعودية" },
  { "اسم الجهة": "رواسي للإنشاءات", "اسم الشخص": "فهد", "المنصب": "مدير المشاريع", "الإيميل": "fahad@rawasi-build.com", "الموقع": "rawasi-build.com", "التليفون": "+966555000111", "النشاط": "مقاولات", "المدينة": "الرياض", "البلد": "السعودية" },
  { "اسم الجهة": "Smile Dental Clinic", "اسم الشخص": "Dr. Sara", "المنصب": "Owner", "الإيميل": "sara@smile-dental-jed.com", "الموقع": "smile-dental-jed.com", "التليفون": "0126667788", "النشاط": "عيادات", "المدينة": "جدة", "البلد": "السعودية" },
  { "اسم الجهة": "Care Plus Clinics", "اسم الشخص": "", "المنصب": "", "الإيميل": "contact@careplus-jeddah.com", "الموقع": "careplus-jeddah.com", "التليفون": "", "النشاط": "عيادات", "المدينة": "جدة", "البلد": "السعودية" },
  { "اسم الجهة": "شركة المدار", "اسم الشخص": "ماجد", "المنصب": "مدير المبيعات", "الإيميل": "majed@almadar-co.sa", "الموقع": "almadar-co.sa", "التليفون": "0509876543", "النشاط": "مقاولات", "المدينة": "الرياض", "البلد": "السعودية" },
  { "اسم الجهة": "مطعم السفرة", "اسم الشخص": "", "المنصب": "", "الإيميل": "hello@sofra-food.com", "الموقع": "", "التليفون": "", "النشاط": "مطاعم", "المدينة": "الرياض", "البلد": "السعودية" },
  { "اسم الجهة": "Bright Smile Center", "اسم الشخص": "Omar", "المنصب": "Manager", "الإيميل": "omar@brightsmile-sa.com", "الموقع": "brightsmile-sa.com", "التليفون": "", "النشاط": "عيادات", "المدينة": "جدة", "البلد": "السعودية" },
];

function newState(wb: Workbook, account: string, aliases: string[]): MockState {
  return {
    wb, props: {}, threads: {}, aliases, account, boards: {}, mondayAttempts: {},
    last: { tick: 0, sendQueue: Date.now(), processLeads: Date.now() }, seq: 0,
  };
}

/**
 * Builds the starting state of a mock sheet.
 * - known demo companies: Master + sample data, "إعداد أول مرة" already run
 * - any other sheet id: a bare copy of the Master (no Commands/Send Results/System yet),
 *   so the dashboard's structure check and onboarding can be exercised.
 */
export function seedMock(sheetId: string, engineKey?: string): MockEngine {
  const preset = MOCK_COMPANIES.find((c) => c.sheetId === sheetId);
  const wb = masterWorkbook();
  if (!preset) {
    const e = new MockEngine(sheetId, newState(wb, "owner@gmail.com", []));
    e.save();
    return e;
  }

  // sample leads (phones as text, like the fixed engine writes them)
  const heads = wb["Leads"][0].map(String);
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  SAMPLE_LEADS.forEach((L, i) => {
    const o: Record<string, string | Date> = { ...L, ID: "L" + String(i + 2).padStart(5, "0"), "تاريخ الإضافة": today, "كود المصدر": "SRC01", "اللغة": "", "حالة المعالجة": "جديد" };
    wb["Leads"].push(heads.map((h) => o[h] ?? ""));
  });

  if (preset.slug === "nile-clinics") {
    setCompany(wb, "اسم الشركة", "Nile Clinics");
    setCompany(wb, "اسم المرسل", "Mona");
    setCompany(wb, "المنصب", "Partnerships Lead");
    setCompany(wb, "إيميل الإرسال", "mona@nileclinics.co");
    setCompany(wb, "المنطقة الزمنية", "Africa/Cairo");
    setCompany(wb, "وصف الخدمة في سطر", "بنساعد العيادات تزوّد حجوزاتها بنظام متابعة بسيط");
  }

  const account = preset.slug === "arab-computers" ? "ahmed.arabcomputers@gmail.com" : "mona.nile@gmail.com";
  const aliases = preset.slug === "arab-computers" ? ["ahmed@arabcomputers-team.com"] : [];
  const e = new MockEngine(sheetId, newState(wb, account, aliases));

  // what the owner does by hand in the sheet: "إعداد أول مرة" (+ monday) and "ربط الداشبورد"
  e.call("ensureDashboardTabs_");
  e.call("installTriggers_");
  if (preset.slug === "arab-computers") {
    e.state.props.MONDAY_TOKEN = "mock-monday-token-0000000000000000";
    setCompany(wb, "monday Board ID", "1234567890");
    e.call("ensureMondayColumns_", "1234567890");
  }
  if (preset.linked && engineKey) e.state.props.ENGINE_KEY = engineKey;
  e.call("processLeads");
  e.call("writeSystem_", true);
  e.save();
  return e;
}
