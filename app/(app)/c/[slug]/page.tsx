import Link from "next/link";
import { notFound } from "next/navigation";
import { FileUpIcon, EyeIcon, MailCheckIcon, RefreshCwIcon } from "lucide-react";
import { Notice } from "@/components/app/basics";
import { CommandButton } from "@/components/app/command";
import { toStr } from "@/components/app/shared";
import { BarList, DailyBars, Stat } from "@/components/charts";
import { StatusBadge } from "@/components/data/badges";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { boardIdOf_ } from "@/lib/engine-port";
import { SheetsError } from "@/lib/google/transport";
import { sheetsFor } from "@/lib/sheets";
import { overview } from "@/lib/sheets/insights";
import { getCompany } from "@/lib/store/model";
import { fmtInTz } from "@/lib/tz";

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="grid min-w-0 content-start gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{title}</h2>{action}</div>
      {children}
    </section>
  );
}

export default async function Overview({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  const c = await getCompany(slug);
  if (!c) notFound();
  let o, tz = "Asia/Riyadh";
  try {
    const s = await sheetsFor(c);
    const [company, sys] = await Promise.all([s.companyRows(), s.system()]);
    tz = toStr(company.map["المنطقة الزمنية"]) || tz;
    o = await overview(s, sys, sys?.mondayToken === "نعم" && !!boardIdOf_(company.map["monday Board ID"]), tz);
  } catch (e) {
    console.error(`[${slug}] overview failed:`, e);
    return <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6"><Notice result={{ ok: false, error: e instanceof SheetsError ? e.message : "مقدرناش نقرا الشيت", detail: (e as Error).message }} /></main>;
  }
  const remaining = Math.max(0, o.cap - o.sentToday);
  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-5 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{c.name}</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline"><Link href={`/c/${slug}/data?tab=import`}><FileUpIcon /> استيراد داتا</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href={`/c/${slug}/send`}><EyeIcon /> معاينة / إرسال</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href={`/c/${slug}/settings?tab=sender`}><MailCheckIcon /> الإيميل المرسل</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="إجمالي الليدز" value={o.total} sub={`اتبعتلهم ${o.contacted}`} />
        <Stat label="اتبعت النهارده" value={<span dir="ltr">{o.sentToday} / {o.cap}</span>} sub={`المتبقي ${remaining}`} />
        <Stat label="ردود" value={o.replies} tone={o.replies ? "good" : undefined} />
        <Stat label="حجوزات" value={o.bookings} tone={o.bookings ? "good" : undefined} />
        <Stat label="Bounce" value={o.bounces} sub={`النسبة ${pct(o.bounceRate)}`} tone={o.bounceRate > 0.03 ? "bad" : undefined} />
        <Stat label="monday" value={<span><span className="text-emerald-700 dark:text-emerald-400">{o.monday.synced}</span> · <span className={o.monday.failed ? "text-destructive" : ""}>{o.monday.failed}</span> · <span className="text-muted-foreground">{o.monday.pending}</span></span>}
          sub="اتزامن · فشل · مستني" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card title="الإرسال في آخر 14 يوم"><DailyBars data={o.perDay} label="إيميلات اتبعتت في اليوم (من Send Results)" /></Card>
        <Card title="القمع"><BarList ordinal items={o.funnel} label="تم الإرسال ← رد ← حجز جلسة" /></Card>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <Card title="حالة المعالجة"><BarList items={o.byProc} label="الليدز حسب حالة المعالجة" /></Card>
        <Card title="حالة التواصل"><BarList items={o.byContact} label="الليدز حسب حالة التواصل" empty="لسه مافيش تواصل" /></Card>
        <Card title="حسب المصدر"><BarList items={o.bySource} label="عدد الليدز لكل مصدر" /></Card>
        <Card title="حسب الـ Segment"><BarList items={o.bySegment} label="عدد الليدز لكل Segment" /></Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="آخر الأوامر" action={<Link className="text-xs underline" href={`/c/${slug}/activity`}>الكل</Link>}>
          <ul className="divide-y text-sm">
            {o.commands.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2 py-2">
                <StatusBadge value={x.status} /> <span className="font-medium" dir="ltr">{x.type}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{String(x.result?.summary ?? x.result?.error ?? "")}</span>
                <span className="text-xs text-muted-foreground">{fmtInTz(x.createdAt, tz)}</span>
              </li>
            ))}
            {!o.commands.length && <li className="py-2 text-muted-foreground">لسه مافيش أوامر</li>}
          </ul>
        </Card>
        <Card title="آخر السجل (Log)" action={<Link className="text-xs underline" href={`/c/${slug}/activity?tab=log`}>الكل</Link>}>
          <ul className="divide-y text-sm">
            {o.log.map((l, i) => (
              <li key={i} className="grid gap-0.5 py-2">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium" dir="ltr">{l.fn}</span> <StatusBadge value={l.result} /> <span className="text-xs text-muted-foreground" dir="ltr">{l.time}</span></div>
                <span className="truncate text-xs text-muted-foreground">{l.details}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="إجراءات سريعة">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid content-start gap-1"><p className="text-sm text-muted-foreground">جهّز الليدز الجديدة دلوقتي (إيميلات + Segments + monday) بدل ما تستنى الساعة.</p>
            <CommandButton slug={slug} type="process" label={<><RefreshCwIcon /> جهّز الليدز دلوقتي</>} /></div>
          <div className="grid content-start gap-1"><p className="text-sm text-muted-foreground">افحص الإيميل المرسل في Gmail.</p>
            <CommandButton slug={slug} type="checkSender" label={<><MailCheckIcon /> افحص الإيميل المرسل</>} /></div>
          <div className="grid content-start gap-1"><p className="text-sm text-muted-foreground">أعد المحاولة على كل الليدز اللي فشلت على monday.</p>
            <CommandButton slug={slug} type="retryMonday" label="إعادة المحاولة على monday" disabled={!o.monday.failed} /></div>
        </div>
      </Card>
    </main>
  );
}
