import Link from "next/link";
import { ar } from "@/content/ar";
import { Notice } from "@/components/app/basics";
import { AppHeader } from "@/components/app/header";
import { toStr } from "@/components/app/shared";
import { EngineKey } from "@/components/settings/companies";
import { SenderTab } from "@/components/settings/company-sections";
import { MondayTab } from "@/components/settings/company-sections-2";
import { GoogleSection } from "@/components/settings/app-sections";
import { FinishStep, FirstCompanyStep, StepShell, WaitStep } from "@/components/setup/shell";
import { Button } from "@/components/ui/button";
import { requireOwner } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { sheetsFor } from "@/lib/sheets";
import { COMPANY_KEYS, TAB } from "@/lib/sheets/schema";
import { getCompany, getSettings, listCompanies, mondayTokenOf, secretInfo } from "@/lib/store/model";

/** First-run wizard (owner only). Each step is server-rendered from ?step=&c=. */
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string; c?: string }> }) {
  const user = await requireOwner();
  const sp = await searchParams;
  const step = Math.min(6, Math.max(1, Number(sp.step) || 1));
  const [settings, companies] = await Promise.all([getSettings(), listCompanies()]);
  const company = sp.c ? await getCompany(sp.c) : null;
  const next = (n: number) => `/setup?step=${n}${company ? `&c=${company.slug}` : ""}`;

  let body: React.ReactNode = null;
  if (step === 1) {
    const [rt, sa] = await Promise.all([secretInfo({ scope: "app", name: "googleRefreshToken" }), secretInfo({ scope: "app", name: "serviceAccountJson" })]);
    const connected = env.mockSheets || (settings.google.mode === "oauth" ? rt.set : settings.google.mode === "serviceAccount" ? sa.set : false);
    body = (
      <>
        <GoogleSection isOwner mock={env.mockSheets} mode={settings.google.mode} oauthEmail={settings.google.oauthEmail} saEmail={settings.google.serviceAccountEmail}
          connectedAt={settings.google.connectedAt} refreshToken={rt} saInfo={sa} companies={companies.map((c) => ({ slug: c.slug, name: c.name }))}
          clientConfigured={!!(env.googleClientId && env.googleClientSecret)} />
        <div><Button asChild disabled={!connected}><Link aria-disabled={!connected} href={connected ? next(2) : "#"}>التالي</Link></Button></div>
      </>
    );
  } else if (step === 2) {
    body = <FirstCompanyStep existing={companies.map((c) => ({ slug: c.slug, name: c.name }))} mock={env.mockSheets} defaultSlug={company?.slug} />;
  } else if (!company) {
    body = <Notice result={{ ok: false, error: "اختار الشركة الأول" }} />;
  } else if (step === 3) {
    body = (
      <div className="grid gap-4">
        <ol className="list-decimal space-y-1 ps-5 text-sm">
          <li>افتح الشيت ← قائمة <strong>Outreach</strong> ← <strong>ربط الداشبورد (ENGINE_KEY)</strong></li>
          <li>الصق المفتاح ده ودوس OK</li>
        </ol>
        <EngineKey slug={company.slug} isOwner />
        <WaitStep slug={company.slug} mock={env.mockSheets} />
      </div>
    );
  } else if (step === 4 || step === 5) {
    // load first, render after (no JSX inside try/catch)
    let loaded: { map: Record<string, unknown>; system: Awaited<ReturnType<Awaited<ReturnType<typeof sheetsFor>>["system"]>>; templates: { code: string; versions: string[] }[]; leads: { id: string; name: string }[]; mondayInfo: Awaited<ReturnType<typeof secretInfo>> } | null = null;
    let loadErr: string | null = null;
    try {
      const s = await sheetsFor(company);
      const [rows, system, tpls, leads, mondayInfo] = await Promise.all([s.companyRows(), s.system(true), s.table(TAB.TEMPLATES), s.table(TAB.LEADS), secretInfo(mondayTokenOf(company.slug))]);
      loaded = {
        map: rows.map as Record<string, unknown>, system, mondayInfo,
        templates: Object.values((tpls?.rows ?? []).reduce<Record<string, { code: string; versions: string[] }>>((acc, r) => {
          const code = toStr(r["كود القالب"]).trim(); if (code && r["النص"]) (acc[code] ??= { code, versions: [] }).versions.push(toStr(r["النسخة"]) || "-"); return acc;
        }, {})),
        leads: (leads?.rows ?? []).filter((r) => r["الإيميل"]).slice(0, 100).map((r) => ({ id: toStr(r["ID"]), name: toStr(r["اسم الجهة"]) })),
      };
    } catch (e) {
      loadErr = (e as Error).message;
    }
    if (!loaded) body = <Notice result={{ ok: false, error: ar.companySettings.sheetError, detail: loadErr ?? undefined }} />;
    else if (step === 4) {
      body = (
        <>
          <SenderTab slug={company.slug} initial={Object.fromEntries(COMPANY_KEYS.sender.map((k) => [k, toStr(loaded.map[k])]))} company={loaded.map} sys={loaded.system}
            firstSendDate={company.firstSendDate} me={user.email} templates={loaded.templates} leads={loaded.leads} />
          <div><Button asChild><Link href={next(5)}>التالي</Link></Button></div>
        </>
      );
    } else {
      body = (
        <>
          <MondayTab slug={company.slug} info={loaded.mondayInfo} sys={loaded.system} board={toStr(loaded.map["monday Board ID"])} account={company.mondayAccount || ""} />
          <div className="flex gap-2"><Button asChild><Link href={next(6)}>التالي</Link></Button><Button asChild variant="ghost"><Link href={next(6)}>تخطي (من غير monday)</Link></Button></div>
        </>
      );
    }
  } else {
    body = <FinishStep slug={company.slug} />;
  }

  return (
    <>
      <AppHeader user={user} companies={companies} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <StepShell step={step} done={settings.setupDone}>{body}</StepShell>
      </main>
    </>
  );
}
