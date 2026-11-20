import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth/guards";
import { invalidate, sheetsFor } from "@/lib/sheets";
import { leads, sendResults } from "@/lib/sheets/queries";
import { getCompany } from "@/lib/store/model";

/** Recent send commands + Send Results rows of one command + monday item ids of those leads. Polled by the results panel. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  if (!(await currentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { slug } = await ctx.params;
  const c = await getCompany(slug);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const s = await sheetsFor(c);
    const all = await s.commands();
    const commands = all.filter((x) => x.type === "send" || x.type === "retryMonday").slice(0, 15).map(({ payload, ...rest }) => {
      let p: Record<string, unknown> = {};
      try { p = JSON.parse(payload); } catch { /* */ }
      return { ...rest, dryRun: p.dryRun === true, count: Number(p.count) || 0, leadIds: (p.leadIds as string[]) ?? [] };
    });
    // default: the latest send that actually ran (not cancelled, not scheduled for later)
    const ran = commands.find((x) => x.type === "send" && x.status !== "ملغي" && !(x.status === "في الانتظار" && x.at && Date.parse(x.at) > Date.now()));
    const id = req.nextUrl.searchParams.get("commandId") || ran?.id || commands.find((x) => x.type === "send")?.id || "";
    const cmd = commands.find((x) => x.id === id);
    // just finished (or asked for): the engine changed Leads / Send Results — don't serve cached reads
    const justDone = !!cmd && ["تم", "فشل"].includes(cmd.status) && Date.now() - Date.parse(cmd.executedAt || cmd.createdAt) < 3 * 60e3;
    if (justDone || req.nextUrl.searchParams.get("fresh")) invalidate(c.sheetId);
    const rows = id ? await sendResults(s, id) : [];
    const L = await leads(s);
    const byId = new Map(L.map((l) => [l["ID"], l]));
    const items = Object.fromEntries(rows.map((r) => {
      const l = byId.get(r.leadId);
      return [r.leadId, { item: l?.["monday Item ID"] ?? "", monday: l?.["حالة monday"] ?? "", name: l?.["اسم الجهة"] ?? "" }];
    }));
    return NextResponse.json({ commands, id, rows, items }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
