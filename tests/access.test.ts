import { describe, expect, it } from "vitest";
import { probeSheet } from "@/lib/auth/access";

type Call = { url: string; method: string; body?: string };
/** A fake Google Sheets API: status codes per endpoint. */
function fakeGoogle(st: { read: number; values: number; title?: number }) {
  const calls: Call[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method || "GET", body: init?.body as string | undefined });
    const u = String(url);
    const status = u.includes("values:batchUpdate") ? st.values : u.includes(":batchUpdate") ? st.title ?? 500 : st.read;
    return new Response(JSON.stringify(status === 200 ? { properties: { title: "Outreach — Arab Computers" } } : { error: { code: status } }), { status });
  }) as typeof fetch;
  return { f, calls };
}

describe("sheet access probe (Editor vs Viewer vs none)", () => {
  it("editor: the no-op write succeeds", async () => {
    const g = fakeGoogle({ read: 200, values: 200 });
    expect(await probeSheet("tok", "SHEET", g.f)).toBe("edit");
    const w = g.calls.find((c) => c.url.includes("values:batchUpdate"))!;
    expect(w.method).toBe("POST");
    expect(JSON.parse(w.body!)).toEqual({ valueInputOption: "RAW", data: [] }); // writes nothing
  });
  it("viewer: read ok, write forbidden", async () => {
    expect(await probeSheet("tok", "SHEET", fakeGoogle({ read: 200, values: 403 }).f)).toBe("view");
  });
  it("no access / missing sheet", async () => {
    expect(await probeSheet("tok", "SHEET", fakeGoogle({ read: 403, values: 403 }).f)).toBe("none");
    expect(await probeSheet("tok", "SHEET", fakeGoogle({ read: 404, values: 404 }).f)).toBe("none");
  });
  it("if Google rejects the empty write (400) it falls back to re-setting the same title", async () => {
    const g = fakeGoogle({ read: 200, values: 400, title: 200 });
    expect(await probeSheet("tok", "SHEET", g.f)).toBe("edit");
    const t = g.calls.find((c) => c.url.endsWith(":batchUpdate") && !c.url.includes("values:"))!;
    expect(JSON.parse(t.body!).requests[0].updateSpreadsheetProperties.properties.title).toBe("Outreach — Arab Computers");
    expect(await probeSheet("tok", "SHEET", fakeGoogle({ read: 200, values: 400, title: 403 }).f)).toBe("view");
  });
  it("expired token / server errors are 'error', never 'edit'", async () => {
    expect(await probeSheet("tok", "SHEET", fakeGoogle({ read: 401, values: 401 }).f)).toBe("error");
    expect(await probeSheet("tok", "SHEET", fakeGoogle({ read: 200, values: 500 }).f)).toBe("error");
  });
});
