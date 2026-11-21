import { NextResponse } from "next/server";
import { assertCompany } from "@/lib/auth/guards";
import { invalidate, sheetsFor } from "@/lib/sheets";

/** Polled by the UI while a command is pending/running. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;
  let c;
  try { c = (await assertCompany(slug)).company; } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  try {
    const s = await sheetsFor(c);
    const cmd = await s.command(id);
    if (!cmd) return NextResponse.json({ error: "not found" }, { status: 404 });
    // the engine just changed the sheet (Leads, Send Results, Log…): drop cached reads so the next page load is fresh
    if (["تم", "فشل"].includes(cmd.status)) invalidate(c.sheetId);
    const { payload: _payload, ...safe } = cmd; // البيانات may hold a sealed token: never echo it
    void _payload;
    return NextResponse.json(safe, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
