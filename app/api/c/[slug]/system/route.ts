import { NextResponse } from "next/server";
import { assertCompany } from "@/lib/auth/guards";
import { sheetsFor } from "@/lib/sheets";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  let c;
  try { c = (await assertCompany(slug)).company; } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  try {
    const s = await sheetsFor(c);
    return NextResponse.json(await s.system(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
