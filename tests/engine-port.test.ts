import { describe, expect, it } from "vitest";
import * as P from "@/lib/engine-port";
import { loadCodeGs } from "./gas";

const { ctx } = loadCodeGs();

const emails = ["Info@Bena.sa ; ceo@bena.sa", "x@example.com", "logo@2x.png sales@site.com", "a@b", "noreply@x.com", "", "Ahmed@Company.COM",
  "first@a.com, second@shop.sa", "user.name+tag@sub.domain.co"];
const sites = ["bena.sa", "https://www.shop.sa/contact", "", "http://Company.com", "site.com:8080/x"];

describe("ported helpers match Code.gs exactly", () => {
  it("norm_", () => {
    for (const s of ["أحمد", "إسلام", "آمنة", "مدرسة", "مستشفى", "  MiXeD  ", "", null, 5]) expect(P.norm_(s)).toBe(ctx.norm_(s));
  });
  it("domainOf_ / normalizeUrl_", () => {
    for (const s of sites) { expect(P.domainOf_(s)).toBe(ctx.domainOf_(s)); expect(P.normalizeUrl_(s)).toBe(ctx.normalizeUrl_(s)); }
  });
  it("isValidEmail_ / pickEmail_", () => {
    for (const e of emails) {
      expect(P.isValidEmail_(e)).toBe(ctx.isValidEmail_(e));
      for (const s of sites) expect(P.pickEmail_(e, s)).toBe(ctx.pickEmail_(e, s));
    }
  });
  it("boardIdOf_", () => {
    for (const v of ["https://x.monday.com/boards/1234567890/views/1", "1234567890", 1234567890, " 12 34 ", ""]) expect(P.boardIdOf_(v)).toBe(ctx.boardIdOf_(v));
  });
  it("matchSegment_", () => {
    const segs = [
      { "كود الـ Segment": "S1", "النشاط": "مقاولات", "البلد": "السعودية", "المدينة (اختياري)": "الرياض" },
      { "كود الـ Segment": "S2", "النشاط": "عيادات", "البلد": "", "المدينة (اختياري)": "" },
    ];
    const leads = [
      { "النشاط": "مقاولات عامة", "البلد": "السعودية", "المدينة": "الرياض" },
      { "النشاط": "مقاولات", "البلد": "مصر", "المدينة": "الرياض" },
      { "النشاط": "مقاولات", "البلد": "", "المدينة": "جدة" },
      { "النشاط": "عيادة", "البلد": "", "المدينة": "" },
      { "النشاط": "عيادات اسنان", "البلد": "الامارات", "المدينة": "" },
      { "النشاط": "", "البلد": "", "المدينة": "" },
    ];
    for (const L of leads) expect(P.matchSegment_(L, segs)?.["كود الـ Segment"] ?? null).toBe(ctx.matchSegment_(L, segs)?.["كود الـ Segment"] ?? null);
  });
  it("fillTemplate_ incl. signature, person fallback, profile ref, missing vars", () => {
    const c = { "اسم الشركة": "Arab Computers", "اسم المرسل": "أحمد", "المنصب": "مدير", "رقم الواتساب": "+20 100", "لينك البروفايل": "https://x.com/p?a=1",
      "لينك صفحة الحجز": "https://cal", "وصف الخدمة في سطر": "بنساعد" };
    const leads = [{ ID: "L00012", "اسم الجهة": "شركة", "اسم الشخص": "", "النشاط": "مقاولات", "المدينة": "الرياض" },
      { ID: "L7", "اسم الجهة": "Clinic", "اسم الشخص": "Sara", "النشاط": "عيادات", "المدينة": "جدة" }];
    const tpl = "أهلاً {اسم_الشخص} {اسم الجهة} {اسم_شركتنا} {لينك_البروفايل} {لينك_الحجز} {وصف_الخدمة}\n{التوقيع}";
    for (const L of leads) for (const lang of ["AR", "EN"]) expect(P.fillTemplate_(tpl, L, c, lang)).toBe(ctx.fillTemplate_(tpl, L, c, lang));
    // signature without a title / whatsapp
    const c2 = { "اسم الشركة": "X", "اسم المرسل": "Y" };
    expect(P.signature_(c2, "AR")).toBe(ctx.fillTemplate_("{التوقيع}", leads[0], c2, "AR"));
    expect(() => P.fillTemplate_("{مش_موجود} {المدينة}", leads[0], c, "AR")).toThrow(/متغيرات ناقصة: مش_موجود/);
    expect(() => ctx.fillTemplate_("{مش_موجود} {المدينة}", leads[0], c, "AR")).toThrow(/متغيرات ناقصة: مش_موجود/);
    expect(P.fillTemplate("{a} {b} {المدينة}", leads[0], c, "AR").missing).toEqual(["a", "b"]);
  });
  it("pickVersion_ matches planNextStep_ A/B choice", () => {
    const variants = [{ version: "A" }, { version: "B" }, { version: "-" }];
    for (const id of ["L00001", "L00002", "L00013", "X"]) {
      const n = Number(id.replace(/\D/g, "")) || 0;
      expect(P.pickVersion_(variants, id)!.version).toBe(["A", "B"][n % 2]);
    }
    expect(P.pickVersion_([{ version: "-" }], "L1")!.version).toBe("-");
  });
  it("inSendWindow_ follows the company time zone", () => {
    const c = { "المنطقة الزمنية": "Asia/Riyadh", "أيام الإرسال": "الأحد,الاثنين", "ساعة بداية الإرسال": 9, "ساعة نهاية الإرسال": 12 };
    // Sunday 2026-11-22 07:30 UTC = 10:30 Riyadh
    expect(P.inSendWindow_(c, new Date("2026-11-22T07:30:00Z"))).toBe(true);
    expect(P.inSendWindow_(c, new Date("2026-11-22T09:30:00Z"))).toBe(false); // 12:30
    expect(P.inSendWindow_(c, new Date("2026-11-21T07:30:00Z"))).toBe(false); // Saturday
    expect(P.inSendWindow_({ ...c, "أيام الإرسال": "الأحد، الاثنين" }, new Date("2026-11-23T06:00:00Z"))).toBe(true); // Arabic comma
  });
});
