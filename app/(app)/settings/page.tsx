import { ar } from "@/content/ar";
import { AppHeader } from "@/components/app/header";
import { UrlTabs } from "@/components/app/basics";
import { AccessSection, DefaultsSection, GoogleSection, NotificationsSection } from "@/components/settings/app-sections";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TabsContent } from "@/components/ui/tabs";
import { requireAdmin } from "@/lib/auth/guards";
import { APP_VERSION, env } from "@/lib/env";
import { sheetsFor } from "@/lib/sheets";
import { getSettings, listCompanies, recentGoogleErrors, secretInfo, storeKind } from "@/lib/store/model";

const T = ar.appSettings;
const FLASH: Record<string, string> = {
  owner: "الإعداد ده لصاحب الحساب بس", client: T.google.missingClient, state: "انتهت صلاحية طلب الربط — جرّب تاني",
  no_refresh_token: "Google مارجّعش Refresh token — شيل صلاحية التطبيق من حسابك وجرّب تاني", exchange: "فشل تبديل الكود مع Google", access_denied: "اتلغى الربط",
};

export default async function AppSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; error?: string; connected?: string; denied?: string }> }) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const isOwner = user.role === "owner";
  const [settings, companies, errors, rt, sa] = await Promise.all([
    getSettings(), listCompanies(), recentGoogleErrors(),
    secretInfo({ scope: "app", name: "googleRefreshToken" }), secretInfo({ scope: "app", name: "serviceAccountJson" }),
  ]);
  // current «إيميل التنبيهات» per company (best effort)
  const alertCurrent = await Promise.all(companies.map(async (c) => {
    try { return String((await (await sheetsFor(c)).companyRows()).map["إيميل التنبيهات"] ?? "") || null; } catch { return null; }
  }));
  const flash = sp.connected ? { ok: true as const, message: "Google Sheets اتوصّل ✓" } : sp.error ? { ok: false as const, error: FLASH[sp.error] || "فشل الربط", detail: sp.error } : null;
  const tab = sp.tab && Object.keys(T.tabs).includes(sp.tab) ? sp.tab : "google";
  const ownerBadge = (l: string) => <span className="inline-flex items-center gap-1">{l} <Badge variant="outline" className="text-[10px]">{T.ownerOnly}</Badge></span>;

  return (
    <>
      <AppHeader user={user} companies={companies} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <h1 className="mb-4 text-xl font-semibold">{T.title}</h1>
        {sp.denied && <p role="alert" className="mb-4 text-sm text-destructive">{T.denied}</p>}
        <UrlTabs value={tab} items={[
          { value: "google", label: T.tabs.google }, { value: "access", label: T.tabs.access }, { value: "defaults", label: T.tabs.defaults },
          { value: "notifications", label: T.tabs.notifications }, { value: "diagnostics", label: T.tabs.diagnostics },
        ]}>
          <TabsContent value="google">
            <Card><CardHeader><CardTitle>{ownerBadge(T.google.title)}</CardTitle><CardDescription>{T.google.desc}</CardDescription></CardHeader>
              <CardContent>
                <GoogleSection isOwner={isOwner} mock={env.mockSheets} mode={settings.google.mode} oauthEmail={settings.google.oauthEmail}
                  saEmail={settings.google.serviceAccountEmail} connectedAt={settings.google.connectedAt} refreshToken={rt} saInfo={sa}
                  companies={companies.map((c) => ({ slug: c.slug, name: c.name }))} clientConfigured={!!(env.googleClientId && env.googleClientSecret)} flash={flash} />
              </CardContent></Card>
          </TabsContent>
          <TabsContent value="access">
            <Card><CardHeader><CardTitle>{ownerBadge(T.access.title)}</CardTitle><CardDescription>{T.access.desc}</CardDescription></CardHeader>
              <CardContent><AccessSection isOwner={isOwner} owner={env.ownerEmail} admins={settings.admins} /></CardContent></Card>
          </TabsContent>
          <TabsContent value="defaults">
            <Card><CardHeader><CardTitle>{T.defaults.title}</CardTitle><CardDescription>{T.defaults.desc}</CardDescription></CardHeader>
              <CardContent><DefaultsSection initial={settings.defaults} /></CardContent></Card>
          </TabsContent>
          <TabsContent value="notifications">
            <Card><CardHeader><CardTitle>{T.notifications.title}</CardTitle><CardDescription>{T.notifications.desc}</CardDescription></CardHeader>
              <CardContent><NotificationsSection emails={settings.notifications.emails} companies={companies.map((c, i) => ({ slug: c.slug, name: c.name, current: alertCurrent[i] }))} /></CardContent></Card>
          </TabsContent>
          <TabsContent value="diagnostics">
            <Card><CardHeader><CardTitle>{T.diagnostics.title}</CardTitle></CardHeader>
              <CardContent className="grid gap-5">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">{T.diagnostics.version}</dt><dd dir="ltr" className="text-right">{APP_VERSION}</dd>
                  <dt className="text-muted-foreground">{T.diagnostics.store}</dt><dd>{storeKind() === "upstash" ? T.diagnostics.storeUpstash : T.diagnostics.storeFile}</dd>
                  <dt className="text-muted-foreground">{T.diagnostics.mode}</dt><dd>{env.mockSheets ? T.diagnostics.modeMock : T.diagnostics.modeReal}</dd>
                </dl>
                <div className="grid gap-2">
                  <h3 className="font-medium">{T.diagnostics.errors}</h3>
                  {errors.length === 0 ? <p className="text-sm text-emerald-700">{T.diagnostics.noErrors}</p> : (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-right"><tr>{[T.diagnostics.when, T.diagnostics.company, T.diagnostics.op, T.diagnostics.code, T.diagnostics.message].map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
                        <tbody>{errors.map((e, i) => (
                          <tr key={i} className="border-t align-top">
                            <td className="p-2 whitespace-nowrap">{new Date(e.at).toLocaleString("ar-EG")}</td><td className="p-2">{e.company || "—"}</td>
                            <td className="p-2" dir="ltr">{e.op}</td><td className="p-2" dir="ltr">{e.status ?? "—"}</td><td className="p-2 break-all" dir="ltr">{e.message}</td>
                          </tr>))}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              </CardContent></Card>
          </TabsContent>
        </UrlTabs>
      </main>
    </>
  );
}
