import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/guards";
import { sheetsFor } from "@/lib/sheets";
import { getCompany } from "@/lib/store/model";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  if (!(await currentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { slug } = await ctx.params;
  const c = await getCompany(slug);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const s = await sheetsFor(c);
    return NextResponse.json(await s.system(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
