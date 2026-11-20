import { notFound } from "next/navigation";
import { ar } from "@/content/ar";
import { Notice, UrlTabs } from "@/components/app/basics";
import { CompanyKeysForm, type FieldSpec } from "@/components/app/company-form";
import { toStr } from "@/components/app/shared";
import { PROFILE_FIELDS } from "@/components/settings/fields";
import { RegistryForm, ScheduleTab, Section, SenderTab } from "@/components/settings/company-sections";
import { AdvancedTab, MondayTab } from "@/components/settings/company-sections-2";
import { ContentTab } from "@/components/settings/content-tab";
import type { PlainTable } from "@/components/settings/content-editor";
import { TabsContent } from "@/components/ui/tabs";
import { requireAdmin } from "@/lib/auth/guards";
import { SheetsError } from "@/lib/google/transport";
import { sheetsFor, type Table } from "@/lib/sheets";
import { COMPANY_KEYS, KNOWN_COMPANY_KEYS, TAB } from "@/lib/sheets/schema";
import { getCompany, mondayTokenOf, secretInfo } from "@/lib/store/model";

const T = ar.companySettings;
const TABS = ["profile", "sender", "schedule", "monday", "booking", "content", "advanced"] as const;

const plain = (t: Table | null): PlainTable | undefined => (t ? { headers: t.headers, rows: t.rows } : undefined);

export default async function CompanySettingsPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; sub?: string }>;
}) {
  const user = await requireAdmin();
  const { slug } = await params;
  const sp = await searchParams;
  const c = await getCompany(slug);
  if (!c) notFound();
  const tab = TABS.includes(sp.tab as (typeof TABS)[number]) ? sp.tab! : "profile";

  let data;
  try {
    const s = await sheetsFor(c);
    const tabs = await s.read([TAB.COMPANY, TAB.SEGMENTS, TAB.SEQUENCE, TAB.TEMPLATES, TAB.SOURCES, TAB.MAPPING, TAB.LISTS, TAB.LEADS]);
    const [company, system, mondayInfo] = await Promise.all([s.companyRows(), s.system(), secretInfo(mondayTokenOf(slug))]);
    data = { tabs, company, system, mondayInfo };
  } catch (e) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <h1 className="mb-4 text-xl font-semibold">{T.title} — {c.name}</h1>
        <Notice result={{ ok: false, error: e instanceof SheetsError ? e.message : T.sheetError, detail: e instanceof SheetsError ? e.detail : (e as Error).message }} />
      </main>
    );
  }

  const { tabs, company, system, mondayInfo } = data;
  const map = company.map as Record<string, unknown>;
  const vals = (keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, toStr(map[k])]));
  const extraKeys = ["إيميل التنبيهات", ...company.rows.map((r) => r.label).filter((l) => !KNOWN_COMPANY_KEYS.has(l))];
  const extraFields: FieldSpec[] = extraKeys.map((k) => ({ key: k, help: company.rows.find((r) => r.label === k)?.note || undefined }));
  const leads = (tabs[TAB.LEADS]?.rows ?? []).filter((r) => r["الإيميل"]).slice(0, 150)
    .map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "_row").map(([k, v]) => [k, toStr(v)])));
  const templates = Object.values((tabs[TAB.TEMPLATES]?.rows ?? []).reduce<Record<string, { code: string; versions: string[] }>>((acc, r) => {
    const code = toStr(r["كود القالب"]).trim();
    if (code && r["النص"]) (acc[code] ??= { code, versions: [] }).versions.push(toStr(r["النسخة"]) || "-");
    return acc;
  }, {}));

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold">
        <span className="size-3 rounded-full" style={{ background: c.color }} /> {T.title} — {c.name}
      </h1>
      <UrlTabs value={tab} items={TABS.map((t) => ({ value: t, label: T.tabs[t] }))}>
        <TabsContent value="profile" className="grid gap-5 pt-2">
          <Section title={T.profile.title} desc={T.profile.desc}>
            <CompanyKeysForm slug={slug} fields={PROFILE_FIELDS} initial={vals(COMPANY_KEYS.profile)} />
          </Section>
          <Section title={T.profile.registry}>
            <RegistryForm slug={slug} color={c.color} firstSendDate={c.firstSendDate} />
          </Section>
        </TabsContent>

        <TabsContent value="sender" className="pt-2">
          <SenderTab slug={slug} initial={vals(COMPANY_KEYS.sender)} company={map} sys={system} firstSendDate={c.firstSendDate} me={user.email}
            templates={templates} leads={leads.map((l) => ({ id: l["ID"], name: l["اسم الجهة"] }))} />
        </TabsContent>

        <TabsContent value="schedule" className="pt-2">
          <ScheduleTab slug={slug} initial={vals(COMPANY_KEYS.schedule)} company={map} sys={system} firstSendDate={c.firstSendDate} />
        </TabsContent>

        <TabsContent value="monday" className="pt-2">
          <MondayTab slug={slug} info={mondayInfo} sys={system} board={toStr(map["monday Board ID"])} account={c.mondayAccount || ""} />
        </TabsContent>

        <TabsContent value="booking" className="pt-2">
          <Section title={T.booking.title} desc={T.booking.desc}>
            <CompanyKeysForm slug={slug} columns={1} initial={vals(["كلمة في عنوان الحجز", "لينك صفحة الحجز"])} fields={[
              { key: "كلمة في عنوان الحجز", help: T.booking.keywordHelp }, { key: "لينك صفحة الحجز", type: "url", help: "{لينك_الحجز}" },
            ]} />
          </Section>
        </TabsContent>

        <TabsContent value="content" className="pt-2">
          <Section title={T.content.title} desc={T.content.desc}>
            <ContentTab slug={slug} sub={sp.sub || ""} company={map} leads={leads} tables={{
              [TAB.SEGMENTS]: plain(tabs[TAB.SEGMENTS]), [TAB.SEQUENCE]: plain(tabs[TAB.SEQUENCE]), [TAB.TEMPLATES]: plain(tabs[TAB.TEMPLATES]),
              [TAB.SOURCES]: plain(tabs[TAB.SOURCES]), [TAB.MAPPING]: plain(tabs[TAB.MAPPING]), [TAB.LISTS]: plain(tabs[TAB.LISTS]),
            }} />
          </Section>
        </TabsContent>

        <TabsContent value="advanced" className="pt-2">
          <AdvancedTab slug={slug} name={c.name} sheetUrl={c.sheetUrl} sys={system} extra={{ fields: extraFields, initial: vals(extraKeys) }} />
        </TabsContent>
      </UrlTabs>
    </main>
  );
}
