import { NextResponse, type NextRequest } from "next/server";
import { assertCompany } from "@/lib/auth/guards";
import { sheetsFor } from "@/lib/sheets";
import { filterLeads, leads } from "@/lib/sheets/queries";

const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV of the leads matching the same filters as the table (UTF-8 with BOM so Excel shows Arabic). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  let c;
  try { c = (await assertCompany(slug)).company; } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  const p = req.nextUrl.searchParams;
  const all = await leads(await sheetsFor(c));
  const rows = filterLeads(all, { q: p.get("q") || "", source: p.get("source") || "", segment: p.get("segment") || "", proc: p.get("proc") || "", contact: p.get("contact") || "", monday: p.get("monday") || "" });
  const headers = Object.keys(all[0] ?? {}).filter((h) => h !== "_row");
  const csv = "﻿" + [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ""))].map((r) => r.map(esc).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="leads-${slug}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
  });
}
