import { notFound } from "next/navigation";
import { Notice } from "@/components/app/basics";
import { nowMs, toStr } from "@/components/app/shared";
import { SendWorkspace, type SendCtx } from "@/components/send/send-workspace";
import { requireAdmin } from "@/lib/auth/guards";
import { boardIdOf_, inSendWindow_ } from "@/lib/engine-port";
import { SheetsError } from "@/lib/google/transport";
import { sheetsFor } from "@/lib/sheets";
import { leads as readLeads } from "@/lib/sheets/queries";
import { CMD, TAB, yes } from "@/lib/sheets/schema";
import { getCompany } from "@/lib/store/model";

export default async function SendPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  const c = await getCompany(slug);
  if (!c) notFound();
  let ctx: SendCtx;
  try {
    const s = await sheetsFor(c);
    const [company, system, L, commands, segs] = await Promise.all([s.companyRows(), s.system(), readLeads(s), s.commands(), s.table(TAB.SEGMENTS)]);
    const map = company.map as Record<string, unknown>;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: toStr(map["المنطقة الزمنية"]) || "Asia/Riyadh" }).format(new Date());
    const mondayOn = system?.mondayToken === "نعم" && !!boardIdOf_(map["monday Board ID"]);
    const eligible = L.filter((l) => {
      const st = l["حالة التواصل"] || "";
      const dueFollowup = (st === "تم الإرسال" || st.startsWith("متابعة")) && l["المتابعة الجاية"] && l["المتابعة الجاية"].slice(0, 10) <= today;
      const ready = st === "جاهز" && l["كود الـ Segment"] && (!mondayOn || l["monday Item ID"]);
      return dueFollowup || ready;
    }).slice(0, 500).map((l) => ({ id: l["ID"], name: l["اسم الجهة"], email: l["الإيميل"], segment: l["كود الـ Segment"], status: l["حالة التواصل"] }));
    const now = nowMs();
    const upcoming = commands.filter((x) => x.type === "send" && x.status === CMD.PENDING && x.at && Date.parse(x.at) > now)
      .map((x) => { let p: Record<string, unknown> = {}; try { p = JSON.parse(x.payload); } catch { /* */ } return { id: x.id, at: x.at, count: Number(p.count) || 0, segment: p.segment as string | undefined }; })
      .sort((a, b) => a.at.localeCompare(b.at));
    ctx = {
      slug, company: c.name, tz: toStr(map["المنطقة الزمنية"]) || "Asia/Riyadh",
      cap: Number(map["الحد اليومي للإيميلات"]) || 15, sentToday: Number(system?.sentToday) || 0,
      enabled: yes(map["الإرسال شغال"]), inWindow: inSendWindow_(map),
      segments: (segs?.rows ?? []).filter((r) => toStr(r["كود الـ Segment"]) && toStr(r["مفعّل"]) !== "لا").map((r) => toStr(r["كود الـ Segment"])),
      eligible, upcoming, mondayAccount: c.mondayAccount, board: boardIdOf_(map["monday Board ID"]),
    };
  } catch (e) {
    console.error(`[${slug}] page load failed:`, e);
    return <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6"><Notice result={{ ok: false, error: e instanceof SheetsError ? e.message : "مقدرناش نقرا الشيت", detail: (e as Error).message }} /></main>;
  }
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold">الإرسال — {c.name}</h1>
      <SendWorkspace ctx={ctx} />
    </main>
  );
}
