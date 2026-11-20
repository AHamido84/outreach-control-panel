import Link from "next/link";
import { ExternalLinkIcon, LogOutIcon, SettingsIcon, Building2Icon, TriangleAlertIcon } from "lucide-react";
import { ar } from "@/content/ar";
import { signOut } from "@/lib/auth/auth";
import type { User } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { sheetsFor } from "@/lib/sheets";
import { yes, type SystemInfo } from "@/lib/sheets/schema";
import type { Company } from "@/lib/store/model";
import { Button } from "@/components/ui/button";
import { companyAlerts, type Alert } from "@/lib/sheets/insights";
import { CompanyNav } from "./nav";
import { CompanySwitcher } from "./switcher";
import { heartbeatAgeMin } from "./shared";

function Pill({ ok, label, title }: { ok: boolean | null; label: string; title?: string }) {
  const cls = ok === null ? "bg-muted text-muted-foreground" : ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 text-destructive";
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${cls}`}>
      <span className={`size-1.5 rounded-full ${ok === null ? "bg-muted-foreground" : ok ? "bg-emerald-500" : "bg-destructive"}`} /> {label}
    </span>
  );
}

/** Engine status from the System tab: alive (heartbeat age), sending, window, sender, monday. */
export function StatusPills({ sys }: { sys: SystemInfo | null }) {
  const S = ar.status;
  if (!sys || !sys._rows?.length) return <Pill ok={null} label={S.engineUnknown} />;
  const age = heartbeatAgeMin(sys.heartbeat);
  const alive = age <= 10;
  const monday = sys.mondayToken !== "نعم" ? null : yes(sys.mondayBoard);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill ok={alive} label={alive ? S.engineAlive : S.engineStale} title={S.ago(age)} />
      <Pill ok={yes(sys.sendingEnabled)} label={yes(sys.sendingEnabled) ? S.sendingOn : S.sendingOff} />
      <Pill ok={yes(sys.inWindow) ? true : null} label={yes(sys.inWindow) ? S.inWindow : S.outWindow} />
      <Pill ok={yes(sys.senderVerified)} label={yes(sys.senderVerified) ? S.senderOk : S.senderBad} />
      <Pill ok={monday} label={monday === null ? S.mondayOff : monday ? S.mondayOk : S.mondayBad} />
    </div>
  );
}

export async function AppHeader({ user, companies, current }: { user: User; companies: Company[]; current?: Company }) {
  let sys: SystemInfo | null = null;
  let alerts: Alert[] = [];
  if (current) {
    try {
      const s = await sheetsFor(current);
      sys = await s.system();
      alerts = await companyAlerts(s, current.slug, sys);
    } catch { sys = null; }
  }
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      {env.mockSheets && <div className="bg-amber-400/90 px-4 py-1 text-center text-xs font-medium text-amber-950">{ar.app.mock}</div>}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <Link href="/" className="font-semibold">{ar.app.name}</Link>
        <CompanySwitcher companies={companies.map((c) => ({ slug: c.slug, name: c.name, color: c.color }))} current={current?.slug} />
        {current && (
          <a href={current.sheetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ExternalLinkIcon className="size-3.5" /> {ar.app.openSheet}
          </a>
        )}
        <nav className="ms-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="sm"><Link href="/companies"><Building2Icon /> <span className="hidden sm:inline">{ar.nav.companies}</span></Link></Button>
          <Button asChild variant="ghost" size="sm"><Link href="/settings"><SettingsIcon /> <span className="hidden sm:inline">{ar.nav.appSettings}</span></Link></Button>
          {!env.authDisabled && (
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <Button variant="ghost" size="sm" title={user.email}><LogOutIcon /> <span className="hidden sm:inline">{ar.app.signOut}</span></Button>
            </form>
          )}
        </nav>
        {current && <div className="w-full"><StatusPills sys={sys} /></div>}
      </div>
      {current && <CompanyNav slug={current.slug} />}
      {alerts.length > 0 && (
        <div className="border-t bg-destructive/5">
          <ul className="mx-auto grid max-w-6xl gap-1 px-4 py-1.5 text-sm">
            {alerts.map((a) => (
              <li key={a.kind} className="flex items-start gap-1.5 text-destructive">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" /> <Link href={a.href} className="hover:underline">{a.text}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
