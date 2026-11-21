import { ar } from "@/content/ar";
import { AppHeader } from "@/components/app/header";
import { CompaniesView } from "@/components/settings/companies";
import { heartbeatAgeMin } from "@/components/app/shared";
import { requireUser, visibleCompanies } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { sheetsFor } from "@/lib/sheets";
import { getSettings } from "@/lib/store/model";

export default async function CompaniesPage() {
  const user = await requireUser();
  const [companies, settings] = await Promise.all([visibleCompanies(user), getSettings()]);
  // linked + heartbeat from each System tab (best effort, cached)
  const status = await Promise.all(companies.map(async (c) => {
    try { const s = await (await sheetsFor(c)).system(); return { linked: s?._rows?.length ? s.dashboardLinked === "نعم" : null, alive: !!s?.heartbeat && heartbeatAgeMin(s.heartbeat) <= 10 }; }
    catch { return { linked: null, alive: false }; }
  }));
  return (
    <>
      <AppHeader user={user} companies={companies} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <h1 className="mb-4 text-xl font-semibold">{ar.companies.title}</h1>
        <CompaniesView isOwner={true} mock={env.mockSheets} saMode={settings.google.mode === "serviceAccount"}
          companies={companies.map((c, i) => ({ slug: c.slug, name: c.name, color: c.color, sheetUrl: c.sheetUrl, active: c.active, mondayAccount: c.mondayAccount, firstSendDate: c.firstSendDate, ...status[i] }))} />
      </main>
    </>
  );
}
