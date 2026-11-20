import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/guards";
import { sheetsFor } from "@/lib/sheets";
import { getCompany } from "@/lib/store/model";

/** Polled by the UI while a command is pending/running. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  if (!(await currentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { slug, id } = await ctx.params;
  const c = await getCompany(slug);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const s = await sheetsFor(c);
    const cmd = await s.command(id);
    if (!cmd) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { payload: _payload, ...safe } = cmd; // البيانات may hold a sealed token: never echo it
    void _payload;
    return NextResponse.json(safe, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
