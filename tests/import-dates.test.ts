import { describe, expect, it } from "vitest";
import { classifyImport, dncSets_, isDnc_, knownContacts_ } from "@/lib/engine-port/import";
import { dayOf, fromSerial, normalizeDate } from "@/lib/sheets/dates";
import { loadCodeGs } from "./gas";

describe("import classification matches importFromSheet (Code.gs in a vm)", () => {
  it("same statuses, emails and sites as the engine for the same file", () => {
    const H = loadCodeGs();
    const { ctx, tab, leadRows } = H;
    tab("Leads").rows = [tab("Leads").rows[0]];
    tab("Leads").rows.push(["L00001", "", "SRC01", "قديم", "", "", "old@known.sa", "https://known.sa", "", "مقاولات", "الرياض", "السعودية", "", "", "جديد", "", ""]);
    tab("Do-Not-Contact").rows.push(["blocked.com", "دومين", "منافس", "", ""]);
    ctx.ensureDashboardTabs_();
    const file: Record<string, string>[] = [
      { "اسم الجهة": "النخبة", "الإيميل": "", "التليفون": "0500", "النشاط": "مقاولات", "المدينة": "الرياض", "الموقع": "nokhba-site.com" },
      { "اسم الجهة": "البناء", "الإيميل": "Info@Bena.sa ; ceo@bena.sa", "النشاط": "مقاولات", "المدينة": "الرياض", "الموقع": "bena.sa" },
      { "اسم الجهة": "البناء فرع", "الإيميل": "sales@bena.sa", "النشاط": "مقاولات", "المدينة": "الرياض", "الموقع": "bena.sa" },
      { "اسم الجهة": "منافس", "الإيميل": "x@blocked.com", "النشاط": "مقاولات", "المدينة": "الرياض", "الموقع": "" },
      { "اسم الجهة": "مافيش", "الإيميل": "", "النشاط": "مقاولات", "المدينة": "الرياض", "الموقع": "" },
      { "اسم الجهة": "غلط", "الإيميل": "not-an-email", "النشاط": "مقاولات", "المدينة": "الرياض", "الموقع": "" },
      { "اسم الجهة": "معروف", "الإيميل": "OLD@known.sa", "النشاط": "مقاولات", "المدينة": "الرياض", "الموقع": "" },
      { "اسم الجهة": "نفس الموقع", "الإيميل": "", "النشاط": "مقاولات", "المدينة": "الرياض", "الموقع": "www.known.sa/about" },
      { "اسم الجهة": "", "الإيميل": "", "النشاط": "", "المدينة": "", "الموقع": "" },
      { "اسم الجهة": "عيادة", "الإيميل": "dr@clinic-jed.com", "النشاط": "عيادات", "المدينة": "جدة", "الموقع": "" },
    ];
    // ours (before the engine changes Leads)
    const before = leadRows();
    const dncRows = tab("Do-Not-Contact").rows.slice(1).map((r: string[]) => ({ "الإيميل أو الدومين": r[0], "النوع": r[1] }));
    const segRows = tab("Segments").rows.slice(1).map((r: unknown[]) => Object.fromEntries(tab("Segments").rows[0].map((h: string, i: number) => [h, r[i]])));
    const mine = classifyImport(file, { leads: before, dncRows, segments: segRows, sourceActive: true });

    // engine: write what the dashboard writes (unified headers in row 2), then import
    const heads = Object.keys(file[0]);
    tab("Import").rows = [tab("Import").rows[0], ["SRC01", ...heads], ...file.map((r) => ["", ...heads.map((h) => r[h] ?? "")])];
    ctx.CACHE_.company = null;
    const res = ctx.importFromSheet();
    const added = leadRows().slice(1);
    expect(added.length).toBe(mine.length);
    mine.forEach((m, i) => {
      expect(m.status, m.lead["اسم الجهة"]).toBe(added[i]["حالة المعالجة"]);
      expect(m.lead["الإيميل"]).toBe(added[i]["الإيميل"]);
      expect(m.lead["الموقع"]).toBe(added[i]["الموقع"]);
    });
    expect(res.added).toBe(mine.filter((m) => m.status === "جديد").length);
    expect(mine.find((m) => m.lead["اسم الجهة"] === "غلط")!.badEmail).toBe(true);
    expect(mine.find((m) => m.lead["اسم الجهة"] === "عيادة")!.segment).toBe("SEG02");
    expect(mine.find((m) => m.lead["اسم الجهة"] === "البناء")!.segment).toBe("SEG01");
  });

  it("knownContacts_ / dncSets_ / isDnc_ match", () => {
    const { ctx } = loadCodeGs();
    const leads = [{ "الإيميل": "A@x.com", "الموقع": "https://www.x.com" }, { "الإيميل": "", "الموقع": "y.org" }];
    expect(JSON.parse(JSON.stringify(knownContacts_(leads)))).toEqual(JSON.parse(JSON.stringify(ctx.knownContacts_({ rows: leads }))));
    const rows = [{ "الإيميل أو الدومين": "@Spam.com", "النوع": "" }, { "الإيميل أو الدومين": "me@ok.com", "النوع": "إيميل" }, { "الإيميل أو الدومين": "d.org", "النوع": "دومين" }];
    const mine = dncSets_(rows);
    for (const e of ["x@spam.com", "me@ok.com", "ME@OK.com", "a@d.org", "a@ok.com"]) expect(isDnc_(e, mine)).toBe(!!(mine.emails[e.toLowerCase()] || mine.domains[e.toLowerCase().split("@")[1]]));
    // same quirk as the engine: "@spam.com" without النوع=دومين contains "@" → treated as an email entry
    expect(Object.keys(mine.domains).sort()).toEqual(["d.org"]);
    expect(Object.keys(mine.emails).sort()).toEqual(["@spam.com", "me@ok.com"]);
  });

  it("inactive source rows are skipped", () => {
    const r = classifyImport([{ "الإيميل": "a@b.com" }], { leads: [], dncRows: [], segments: [], sourceActive: false });
    expect(r[0].status).toBe("متجاهل");
  });
});

describe("date normalization by spreadsheet locale", () => {
  it("handles ISO, serials, DMY/MDY, Arabic digits, AM/PM", () => {
    expect(normalizeDate("2026-11-20")).toBe("2026-11-20");
    expect(normalizeDate("2026-11-20 9:05:00")).toBe("2026-11-20 09:05");
    expect(normalizeDate("2026-11-20T07:05:00.000Z")).toBe("2026-11-20 07:05");
    expect(normalizeDate(46346)).toBe("2026-11-20");
    expect(fromSerial(46346.5)).toBe("2026-11-20 12:00");
    expect(normalizeDate("11/20/2026", "en_US")).toBe("2026-11-20");
    expect(normalizeDate("20/11/2026", "en_GB")).toBe("2026-11-20");
    expect(normalizeDate("05/11/2026", "ar_EG")).toBe("2026-11-05");
    expect(normalizeDate("05/11/2026", "en_US")).toBe("2026-05-11");
    expect(normalizeDate("20/11/2026", "en_US")).toBe("2026-11-20"); // unambiguous
    expect(normalizeDate("٢٠/١١/٢٠٢٦", "ar_SA")).toBe("2026-11-20");
    expect(normalizeDate("20.11.2026 3:07 PM", "de_DE")).toBe("2026-11-20 15:07");
    expect(normalizeDate("20/11/2026 12:30 ص", "ar_EG")).toBe("2026-11-20 00:30");
    expect(normalizeDate("")).toBe("");
    expect(normalizeDate("not a date")).toBe("not a date");
    expect(dayOf("2026-11-20 10:00:00")).toBe("2026-11-20");
  });
});
