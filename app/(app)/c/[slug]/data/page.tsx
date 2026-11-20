import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, UrlTabs } from "@/components/app/basics";
import { toStr } from "@/components/app/shared";
import { DncManager } from "@/components/data/dnc";
import { ImportWizard, type ImportCtx } from "@/components/data/import-wizard";
import { LeadsTable } from "@/components/data/leads-table";
import { Section } from "@/components/settings/company-sections";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { boardIdOf_ } from "@/lib/engine-port";
import { requireAdmin } from "@/lib/auth/guards";
import { SheetsError } from "@/lib/google/transport";
import { sheetsFor } from "@/lib/sheets";
import { dncList, filterLeads, leads as readLeads, type LeadFilter } from "@/lib/sheets/queries";
import { LEAD_BASE_COLS, TAB } from "@/lib/sheets/schema";
import { getCompany } from "@/lib/store/model";

const PAGE = 50;
type SP = LeadFilter & { tab?: string; page?: string };

export default async function DataPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  await requireAdmin();
  const { slug } = await params;
  const sp = await searchParams;
  const c = await getCompany(slug);
  if (!c) notFound();
  const tab = ["import", "leads", "dnc"].includes(sp.tab || "") ? sp.tab! : "leads";

  let d;
  try {
    const s = await sheetsFor(c);
    const t = await s.read([TAB.SOURCES, TAB.MAPPING, TAB.LISTS, TAB.SEGMENTS, TAB.DNC]);
    const [all, dnc, company] = await Promise.all([readLeads(s), dncList(s), s.companyRows()]);
    d = { t, all, dnc, company };
  } catch (e) {
    return <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6"><Notice result={{ ok: false, error: e instanceof SheetsError ? e.message : "مقدرناش نقرا الشيت", detail: (e as Error).message }} /></main>;
  }
  const { t, all, dnc, company } = d;
  const list = (h: string) => (t[TAB.LISTS]?.rows ?? []).map((r) => toStr(r[h]).trim()).filter(Boolean);
  const segments = (t[TAB.SEGMENTS]?.rows ?? []).map((r) => toStr(r["كود الـ Segment"]).trim()).filter(Boolean);
  const sources = (t[TAB.SOURCES]?.rows ?? []).filter((r) => toStr(r["كود المصدر"]).trim())
    .map((r) => ({ code: toStr(r["كود المصدر"]).trim(), name: toStr(r["اسم المصدر"]), active: toStr(r["مفعّل"]) !== "لا" }));

  const ctx: ImportCtx = {
    sources,
    mappings: (t[TAB.MAPPING]?.rows ?? []).map((r) => ({ source: toStr(r["كود المصدر"]).trim(), from: toStr(r["اسم العمود في المصدر"]).trim(), to: toStr(r["الحقل الموحد"]).trim() })).filter((m) => m.from && m.to),
    fields: list("الحقول الموحدة").length ? list("الحقول الموحدة") : LEAD_BASE_COLS.filter((h) => !["ID", "تاريخ الإضافة", "كود المصدر", "حالة المعالجة", "monday Item ID", "كود الـ Segment"].includes(h)),
    sourceTypes: list("أنواع المصادر"),
    leads: all.map((L) => ({ "الإيميل": L["الإيميل"] || "", "الموقع": L["الموقع"] || "" })),
    dncRows: dnc.map((x) => ({ "الإيميل أو الدومين": x.value, "النوع": x.type })),
    segments: (t[TAB.SEGMENTS]?.rows ?? []).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, toStr(v)]))),
  };

  // leads table: server-side filter + pagination
  const f: LeadFilter = { q: sp.q, source: sp.source, segment: sp.segment, proc: sp.proc, contact: sp.contact, monday: sp.monday };
  const filtered = filterLeads(all, f);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const qs = (extra: Record<string, string | number>) => {
    const q = new URLSearchParams();
    Object.entries({ ...f, tab: "leads", ...extra }).forEach(([k, v]) => { if (v !== undefined && v !== "") q.set(k, String(v)); });
    return q.toString();
  };
  const uniq = (h: string) => [...new Set(all.map((L) => L[h]).filter(Boolean))].sort();
  const sel = (name: keyof LeadFilter, label: string, opts: [string, string][]) => (
    <label className="grid gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select name={name} defaultValue={f[name] ?? ""} className="h-8 rounded-md border bg-background px-2 text-sm">
        <option value="">الكل</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold">الداتا — {c.name}</h1>
      <UrlTabs value={tab} items={[{ value: "leads", label: `الليدز (${all.length})` }, { value: "import", label: "استيراد" }, { value: "dnc", label: `Do-Not-Contact (${dnc.length})` }]}>
        <TabsContent value="leads" className="grid gap-3 pt-2">
          <form method="get" className="flex flex-wrap items-end gap-2 rounded-xl border p-3">
            <input type="hidden" name="tab" value="leads" />
            <label className="grid gap-1 text-xs"><span className="text-muted-foreground">بحث</span>
              <input name="q" defaultValue={f.q} placeholder="اسم، إيميل، موقع، ID…" className="h-8 w-52 rounded-md border bg-background px-2 text-sm" /></label>
            {sel("source", "المصدر", uniq("كود المصدر").map((v) => [v, v]))}
            {sel("segment", "Segment", [["_none", "بدون Segment"], ...segments.map((v) => [v, v] as [string, string])])}
            {sel("proc", "حالة المعالجة", ["جديد", "اتنقل لـ monday", "مكرر", "مافيش إيميل", "إيميل غلط", "في Do-Not-Contact"].map((v) => [v, v]))}
            {sel("contact", "حالة التواصل", [["_none", "فاضي"], ...["جاهز", "تم الإرسال", "متابعة", "رد", "حجز جلسة", "مافيش رد", "Bounce", "طلب الإزالة"].map((v) => [v, v] as [string, string])])}
            {sel("monday", "monday", [["تم", "تم ✓"], ["فشل", "فشل ✗"], ["فاضي", "فاضي"]])}
            <Button size="sm">فلتر</Button>
            <Button asChild size="sm" variant="ghost"><Link href={`/c/${slug}/data?tab=leads`}>مسح</Link></Button>
          </form>
          <LeadsTable slug={slug} rows={filtered.slice((page - 1) * PAGE, page * PAGE)} total={filtered.length} allIds={filtered.map((L) => L["ID"])}
            segments={segments} languages={list("اللغات").length ? list("اللغات") : ["AR", "EN"]} exportHref={`/api/c/${slug}/leads/export?${qs({})}`}
            mondayAccount={c.mondayAccount} board={boardIdOf_(company.map["monday Board ID"])} />
          {pages > 1 && (
            <nav className="flex items-center justify-center gap-2 text-sm" aria-label="الصفحات">
              <Button asChild size="sm" variant="outline" disabled={page <= 1}><Link aria-disabled={page <= 1} href={`?${qs({ page: page - 1 })}`}>السابق</Link></Button>
              <span>{page} / {pages}</span>
              <Button asChild size="sm" variant="outline" disabled={page >= pages}><Link aria-disabled={page >= pages} href={`?${qs({ page: page + 1 })}`}>التالي</Link></Button>
            </nav>
          )}
        </TabsContent>
        <TabsContent value="import" className="pt-2">
          <Section title="استيراد داتا" desc="الملف بيتكتب في تاب Import وبعدين المحرك بيضيف الجديد لـ Leads ويطلع الإيميلات ويحدد الـ Segments ويزامن monday.">
            <ImportWizard slug={slug} ctx={ctx} />
          </Section>
        </TabsContent>
        <TabsContent value="dnc" className="pt-2">
          <Section title="Do-Not-Contact" desc="أي إيميل أو دومين هنا المحرك مابيبعتلوش أبداً. الـ Bounce وطلبات الإزالة بتتضاف لوحدها.">
            <DncManager slug={slug} entries={dnc} reasons={list("أسباب المنع")} />
          </Section>
        </TabsContent>
      </UrlTabs>
    </main>
  );
}
