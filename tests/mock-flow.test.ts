import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// isolate .data for this test
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocp-test-"));
process.env.MOCK_SHEETS = "1";
// the mock engine reads apps-script/ from cwd and writes .data/ under cwd — run it in a temp dir
fs.symlinkSync(path.join(process.cwd(), "apps-script"), path.join(dir, "apps-script"));
process.chdir(dir);

describe("data layer on the mock sheet, executed by the real Code.gs", async () => {
  const { sheetsFor } = await import("@/lib/sheets");
  const { mockEngine } = await import("@/lib/mock/transport");
  const { seal } = await import("@/lib/crypto/seal");
  const company = { slug: "arab-computers", name: "Arab Computers", color: "#000", sheetUrl: "", sheetId: "mock-arab-computers", active: true, createdAt: "", updatedAt: "" };

  it("seeded sheet has a valid structure and System", async () => {
    const s = await sheetsFor(company);
    const v = await s.validateStructure();
    expect(v.missingTabs).toEqual([]);
    expect(v.missingHeaders).toEqual({});
    const sys = await s.system(true);
    expect(sys?.dashboardLinked).toBe("نعم");
    expect(sys?.senderVerified).toBe("نعم");
    expect(sys?.triggers).toBe("4/4");
  });

  it("Company tab writes: text stays text, numbers stay numbers, new labels appended", async () => {
    const s = await sheetsFor(company);
    await s.setCompany({ "رقم الواتساب": "0501234567", "الحد اليومي للإيميلات": "25", "مفتاح جديد": "قيمة" });
    const { map } = await s.companyRows(true);
    expect(map["رقم الواتساب"]).toBe("0501234567");
    expect(map["الحد اليومي للإيميلات"]).toBe(25);
    expect(map["مفتاح جديد"]).toBe("قيمة");
  });

  it("commands round trip: checkSender, setMondayToken (sealed, wiped), cancel", async () => {
    const s = await sheetsFor(company);
    const id = await s.enqueue("checkSender", {}, { creator: "owner@mock.local" });
    expect((await s.command(id, true))?.status).toBe("في الانتظار");
    mockEngine(company.sheetId).tick(true);
    const done = await s.command(id, true);
    expect(done?.status).toBe("تم");
    expect(done?.result?.verified).toBe(true);

    const key = mockEngine(company.sheetId).state.props.ENGINE_KEY;
    const tid = await s.enqueue("setMondayToken", { sealed: seal("eyJ-new-token-تجربة-1234567890", key) }, { creator: "x" });
    mockEngine(company.sheetId).tick(true);
    const t = await s.command(tid, true);
    expect(t?.status).toBe("تم");
    expect(t?.payload).toBe("***");
    expect(mockEngine(company.sheetId).state.props.MONDAY_TOKEN).toBe("eyJ-new-token-تجربة-1234567890");

    const later = await s.enqueue("heartbeat", {}, { at: new Date(Date.now() + 3600e3), creator: "x" });
    mockEngine(company.sheetId).tick(true);
    expect((await s.command(later, true))?.status).toBe("في الانتظار");
    expect(await s.cancel(later)).toBe("cancelled");
    expect(await s.cancel(tid)).toBe("started");
  });

  it("testMonday reports the board and missing columns", async () => {
    const s = await sheetsFor(company);
    const id = await s.enqueue("testMonday", {}, { creator: "x" });
    mockEngine(company.sheetId).tick(true);
    const r = (await s.command(id, true))!;
    expect(r.status).toBe("تم");
    expect(r.result?.boardReachable).toBe(true);
    expect(r.result?.missingColumns).toEqual([]);
  });
});
