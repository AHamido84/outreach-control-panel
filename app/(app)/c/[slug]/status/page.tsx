import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLinkIcon } from "lucide-react";
import { Notice, UrlTabs, Warn } from "@/components/app/basics";
import { CommandButton } from "@/components/app/command";
import { nowMs, toStr } from "@/components/app/shared";
import { gmailLink, MondayMark, mondayItemLink, StatusBadge } from "@/components/data/badges";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { requireAdmin } from "@/lib/auth/guards";
import { boardIdOf_ } from "@/lib/engine-port";
import { SheetsError } from "@/lib/google/transport";
import { sheetsFor } from "@/lib/sheets";
import { attention } from "@/lib/sheets/insights";
import { leads as readLeads, type Lead } from "@/lib/sheets/queries";
import { getCompany } from "@/lib/store/model";
import { fmtInTz } from "@/lib/tz";

const PAGE = 50;
const STATUSES = ["جاهز", "تم الإرسال", "متابعة", "رد", "حجز جلسة", "مافيش رد", "Bounce", "طلب الإزالة"];

function LeadMini({ list, slug, empty }: { list: Lead[]; slug: string; empty: string }) {
  if (!list.length) return <p className="text-sm text-emerald-700 dark:text-emerald-400">{empty}</p>;
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {list.slice(0, 15).map((l) => (
        <li key={l["ID"]} className="flex flex-wrap items-center gap-2 p-2">
          <span className="font-mono text-xs" dir="ltr">{l["ID"]}</span> <span className="truncate">{l["اسم الجهة"]}</span>
          <span className="text-xs text-muted-foreground" dir="ltr">{l["الإيميل"]}</span>
          <span className="ms-auto max-w-72 truncate text-xs text-destructive">{l["حالة monday"]?.startsWith("فشل") ? l["حالة monday"] : l["ملاحظات"]}</span>
        </li>
      ))}
      {list.length > 15 && <li className="p-2 text-xs text-muted-foreground">و {list.length - 15} كمان — <Link className="underline" href={`/c/${slug}/data?tab=leads`}>في جدول الليدز</Link></li>}
    </ul>
  );
}

export default async function StatusPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; s?: string; page?: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  const sp = await searchParams;
  const c = await getCompany(slug);
  if (!c) notFound();
  let d;
  try {
    const s = await sheetsFor(c);
    const [L, cmds, sys, company] = await Promise.all([readLeads(s), s.commands(), s.system(), s.companyRows()]);
    d = { L, cmds, sys, board: boardIdOf_(company.map["monday Board ID"]), tz: toStr(company.map["المنطقة الزمنية"]) || "Asia/Riyadh" };
  } catch (e) {
    console.error(`[${slug}] status failed:`, e);
    return <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6"><Notice result={{ ok: false, error: e instanceof SheetsError ? e.message : "مقدرناش نقرا الشيت", detail: (e as Error).message }} /></main>;
  }
  const { L, cmds, sys, board, tz } = d;
  const a = attention(L, cmds, sys, nowMs());
  const tracked = L.filter((l) => l["حالة التواصل"]);
  const f = sp.s && STATUSES.includes(sp.s) ? sp.s : "";
  const rows = tracked.filter((l) => !f || (f === "متابعة" ? l["حالة التواصل"].startsWith("متابعة") : l["حالة التواصل"] === f))
    .sort((x, y) => (y["تاريخ آخر إرسال"] || "").localeCompare(x["تاريخ آخر إرسال"] || ""));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const cnt = (v: string) => tracked.filter((l) => (v === "متابعة" ? l["حالة التواصل"].startsWith("متابعة") : l["حالة التواصل"] === v)).length;
  const attentionCount = a.mondayFailed.length + a.noSegment.length + a.badEmail.length + a.failedCommands.length + (a.senderUnverified ? 1 : 0);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold">المتابعة — {c.name}</h1>
      <UrlTabs value={sp.tab === "attention" ? "attention" : "tracker"} items={[{ value: "tracker", label: `التتبّع (${tracked.length})` }, { value: "attention", label: `محتاج انتباه (${attentionCount})` }]}>
        <TabsContent value="tracker" className="grid gap-3 pt-2">
          <nav className="flex flex-wrap gap-1.5" aria-label="فلتر الحالة">
            <Link href={`?tab=tracker`} className={`rounded-full border px-3 py-1 text-sm ${!f ? "border-primary bg-primary/5" : ""}`}>الكل {tracked.length}</Link>
            {STATUSES.map((s) => (
              <Link key={s} href={`?tab=tracker&s=${encodeURIComponent(s)}`} className={`rounded-full border px-3 py-1 text-sm ${f === s ? "border-primary bg-primary/5" : ""}`}>{s} {cnt(s)}</Link>
            ))}
          </nav>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-max text-sm">
              <thead className="bg-muted/50"><tr>{["العميل", "الإيميل", "الحالة", "الخطوة", "أول إرسال", "آخر إرسال", "المتابعة الجاية", "Gmail", "monday"].map((h) => <th key={h} className="p-2 text-right font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>
                {rows.slice((page - 1) * PAGE, page * PAGE).map((l) => {
                  const item = mondayItemLink(c.mondayAccount, board, l["monday Item ID"]);
                  return (
                    <tr key={l["ID"]} className="border-t">
                      <td className="p-2"><span className="font-mono text-xs" dir="ltr">{l["ID"]}</span> {l["اسم الجهة"]}</td>
                      <td className="p-2" dir="ltr">{l["الإيميل"]}</td>
                      <td className="p-2"><StatusBadge value={l["حالة التواصل"]} />{l["ميعاد الجلسة"] && <span className="ms-1 text-xs" dir="ltr">{l["ميعاد الجلسة"]}</span>}</td>
                      <td className="p-2 tabular-nums">{l["الخطوة الحالية"]}{l["النسخة"] && <span className="text-xs text-muted-foreground"> / {l["النسخة"]}</span>}</td>
                      <td className="p-2" dir="ltr">{l["تاريخ أول إرسال"]}</td>
                      <td className="p-2" dir="ltr">{l["تاريخ آخر إرسال"]}</td>
                      <td className="p-2" dir="ltr">{l["المتابعة الجاية"]}</td>
                      <td className="p-2">{l["Thread ID"] ? <a href={gmailLink(l["Thread ID"])} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline">Gmail <ExternalLinkIcon className="size-3" /></a> : "—"}</td>
                      <td className="p-2"><MondayMark value={l["حالة monday"]} />{item && <a href={item} target="_blank" rel="noreferrer" className="ms-1 text-xs underline">item</a>}</td>
                    </tr>
                  );
                })}
                {!rows.length && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">مافيش</td></tr>}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav className="flex items-center justify-center gap-2 text-sm">
              <Button asChild size="sm" variant="outline"><Link href={`?tab=tracker&s=${encodeURIComponent(f)}&page=${Math.max(1, page - 1)}`}>السابق</Link></Button>
              <span>{page} / {pages}</span>
              <Button asChild size="sm" variant="outline"><Link href={`?tab=tracker&s=${encodeURIComponent(f)}&page=${Math.min(pages, page + 1)}`}>التالي</Link></Button>
            </nav>
          )}
        </TabsContent>

        <TabsContent value="attention" className="grid gap-5 pt-2">
          {a.senderUnverified && <Warn>الإيميل المرسل ({toStr(sys?.sender)}) مش متفعّل كـ «Send mail as» في Gmail — الإرسال هيفشل. <Link className="underline" href={`/c/${slug}/settings?tab=sender`}>إزاي تفعّله</Link></Warn>}
          <section className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">فشل على monday ({a.mondayFailed.length})</h2>
              {a.mondayFailed.length > 0 && <CommandButton slug={slug} type="retryMonday" label="إعادة المحاولة على الكل" />}
            </div>
            <LeadMini list={a.mondayFailed} slug={slug} empty="مافيش ✓" />
          </section>
          <section className="grid gap-2">
            <h2 className="font-semibold">من غير Segment ({a.noSegment.length})</h2>
            <p className="text-xs text-muted-foreground">ليهم إيميل بس مافيش Segment مطابق للنشاط/البلد/المدينة — ضيف Segment أو حدّده يدوي من جدول الليدز.</p>
            <LeadMini list={a.noSegment} slug={slug} empty="مافيش ✓" />
          </section>
          <section className="grid gap-2">
            <h2 className="font-semibold">إيميلات غلط ({a.badEmail.length})</h2>
            <LeadMini list={a.badEmail} slug={slug} empty="مافيش ✓" />
          </section>
          <section className="grid gap-2">
            <h2 className="font-semibold">أوامر فشلت في آخر 7 أيام ({a.failedCommands.length})</h2>
            {a.failedCommands.length === 0 ? <p className="text-sm text-emerald-700 dark:text-emerald-400">مافيش ✓</p> : (
              <ul className="divide-y rounded-lg border text-sm">
                {a.failedCommands.slice(0, 15).map((x) => (
                  <li key={x.id} className="flex flex-wrap gap-2 p-2"><span dir="ltr" className="font-medium">{x.type}</span>
                    <span className="text-xs text-muted-foreground">{fmtInTz(x.executedAt || x.createdAt, tz)}</span>
                    <span className="w-full text-xs text-destructive">{String(x.result?.error ?? x.resultRaw)}</span></li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>
      </UrlTabs>
    </main>
  );
}
