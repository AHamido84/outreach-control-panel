"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, EyeIcon, EyeOffIcon, Loader2Icon, PlusIcon, RefreshCwIcon, SettingsIcon } from "lucide-react";
import { ar } from "@/content/ar";
import { addCompany, mockSimulate, regenerateEngineKey, revealEngineKey, testCompany, updateCompany } from "@/app/actions/companies";
import { CopyButton, Field, Notice, Warn, type Result } from "@/components/app/basics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const T = ar.companies;
type Co = { slug: string; name: string; color: string; sheetUrl: string; active: boolean; mondayAccount?: string; firstSendDate?: string; linked: boolean | null; alive: boolean };
type Structure = { ok: boolean; missingTabs: string[]; missingHeaders: Record<string, string[]>; needsEngineSetup: boolean; title?: string };

function StructureView({ s }: { s: Structure }) {
  if (s.ok) return <p className="text-sm text-emerald-700 dark:text-emerald-400">{T.structureOk}{s.title ? ` (${s.title})` : ""}</p>;
  return (
    <div className="grid gap-2 text-sm">
      {s.needsEngineSetup && <Warn>{T.needsSetup}</Warn>}
      {s.missingTabs.length > 0 && <p><span className="font-medium">{T.missingTabs}:</span> {s.missingTabs.join("، ")}</p>}
      {Object.entries(s.missingHeaders).map(([t, hs]) => <p key={t}><span className="font-medium">{T.missingHeaders} ({t}):</span> {hs.join("، ")}</p>)}
    </div>
  );
}

function EngineKey({ slug, isOwner }: { slug: string; isOwner: boolean }) {
  const [key, setKey] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null), [busy, setBusy] = useState(false);
  if (!isOwner) return <p className="text-xs text-muted-foreground">{T.engineKey}: {ar.appSettings.ownerOnly}</p>;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{T.engineKey}</span>
        {key ? <code dir="ltr" className="rounded bg-muted px-2 py-1 text-xs break-all">{key}</code> : <code className="text-xs text-muted-foreground">••••••••</code>}
        <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
          if (key) { setKey(null); return; }
          setBusy(true); const r = await revealEngineKey(slug); setBusy(false);
          if (r.ok) setKey(r.data as string); else setRes(r);
        }}>{key ? <EyeOffIcon /> : <EyeIcon />} {key ? T.hide : T.reveal}</Button>
        {key && <CopyButton value={key} />}
        <Dialog>
          <DialogTrigger asChild><Button size="sm" variant="ghost"><RefreshCwIcon /> {T.regenerate}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{T.regenerate}</DialogTitle><DialogDescription>{T.regenerateWarn}</DialogDescription></DialogHeader>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">{ar.common.cancel}</Button></DialogClose>
              <DialogClose asChild><Button variant="destructive" onClick={async () => { const r = await regenerateEngineKey(slug); setRes(r); if (r.ok) setKey(r.data as string); }}>{ar.common.confirm}</Button></DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-xs text-muted-foreground">{T.menuPath}</p>
      <Notice result={res} />
    </div>
  );
}

function CompanyCard({ c, isOwner, mock }: { c: Co; isOwner: boolean; mock: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ name: c.name, sheetUrl: c.sheetUrl, color: c.color, mondayAccount: c.mondayAccount || "", active: c.active });
  const [res, setRes] = useState<Result | null>(null), [busy, setBusy] = useState<string | null>(null);
  const [structure, setStructure] = useState<Structure | null>(null);
  const run = async (k: string, fn: () => Promise<Result>) => { setBusy(k); setRes(null); const r = await fn(); setBusy(null); setRes(r); if (r.ok) router.refresh(); return r; };
  const alive = c.alive;
  return (
    <li className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full" style={{ background: c.color }} />
          <span className="font-medium">{c.name}</span>
          {!c.active && <Badge variant="outline">{ar.common.no} {T.active}</Badge>}
          {c.linked === true && <Badge variant="secondary"><CheckIcon /> {T.linked}</Badge>}
          {c.linked === false && <Badge variant="outline">{T.notLinked}</Badge>}
          {alive ? <Badge variant="secondary">{ar.status.engineAlive}</Badge> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={async () => {
            const r = await run("test", () => testCompany(c.slug));
            if (r.ok) setStructure((r.data as { structure: Structure }).structure);
          }}>{busy === "test" && <Loader2Icon className="animate-spin" />} {T.test}</Button>
          <Button size="sm" variant="ghost" onClick={() => setEdit((e) => !e)}>{T.edit}</Button>
          <Button asChild size="sm" variant="ghost"><Link href={`/c/${c.slug}/settings`}><SettingsIcon /> {ar.nav.settings}</Link></Button>
        </div>
      </div>
      <a href={c.sheetUrl} target="_blank" rel="noreferrer" dir="ltr" className="truncate text-xs text-muted-foreground underline">{c.sheetUrl}</a>
      {edit && (
        <form className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); const r = await run("save", () => updateCompany(c.slug, { ...f, mondayAccount: f.mondayAccount || undefined })); if (r.ok) setEdit(false); }}>
          <Field label={T.name} htmlFor={c.slug + "-n"}><Input id={c.slug + "-n"} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label={T.sheetUrl} htmlFor={c.slug + "-u"}><Input id={c.slug + "-u"} dir="ltr" value={f.sheetUrl} onChange={(e) => setF({ ...f, sheetUrl: e.target.value })} /></Field>
          <Field label={T.color} htmlFor={c.slug + "-c"}><input id={c.slug + "-c"} type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="h-8 w-12 rounded border" /></Field>
          <Field label={ar.companySettings.monday.account} htmlFor={c.slug + "-m"}><Input id={c.slug + "-m"} dir="ltr" value={f.mondayAccount} onChange={(e) => setF({ ...f, mondayAccount: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /> {T.active}</label>
          <div className="sm:col-span-2"><Button disabled={!!busy}>{busy === "save" && <Loader2Icon className="animate-spin" />} {ar.common.save}</Button></div>
        </form>
      )}
      {structure && <StructureView s={structure} />}
      <EngineKey slug={c.slug} isOwner={isOwner} />
      {mock && isOwner && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2 text-xs">
          <span className="text-muted-foreground">{T.mockTools}:</span>
          <Button size="xs" variant="outline" disabled={!!busy} onClick={() => run("ms", () => mockSimulate(c.slug, "setup"))}>{T.mockSetup}</Button>
          <Button size="xs" variant="outline" disabled={!!busy} onClick={() => run("ml", () => mockSimulate(c.slug, "link"))}>{T.mockLink}</Button>
        </div>
      )}
      <Notice result={res} />
    </li>
  );
}

function AddCompany() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", sheetUrl: "", color: "#2563eb", mondayAccount: "", firstSendDate: "" });
  const [res, setRes] = useState<Result | null>(null), [busy, setBusy] = useState(false);
  const [structure, setStructure] = useState<Structure | null>(null);
  if (!open) return <div><Button onClick={() => setOpen(true)}><PlusIcon /> {T.add}</Button></div>;
  return (
    <form className="grid gap-3 rounded-xl border bg-card p-4" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setRes(null); setStructure(null);
      const r = await addCompany(f);
      setBusy(false); setRes(r);
      if (r.ok) { const d = r.data as { structure: Structure | null; error?: string }; setStructure(d.structure); if (d.error) setRes({ ok: false, error: ar.companySettings.sheetError, detail: d.error }); router.refresh(); }
    }}>
      <h2 className="font-semibold">{T.add}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={T.name} htmlFor="nc-name"><Input id="nc-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={T.sheetUrl} htmlFor="nc-url"><Input id="nc-url" required dir="ltr" value={f.sheetUrl} onChange={(e) => setF({ ...f, sheetUrl: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/…/edit" /></Field>
        <Field label={T.color} htmlFor="nc-color"><input id="nc-color" type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="h-8 w-12 rounded border" /></Field>
        <Field label={ar.companySettings.monday.account} htmlFor="nc-m"><Input id="nc-m" dir="ltr" value={f.mondayAccount} onChange={(e) => setF({ ...f, mondayAccount: e.target.value })} /></Field>
        <Field label={ar.companySettings.profile.firstSend} help={ar.companySettings.profile.firstSendHelp} htmlFor="nc-f"><Input id="nc-f" type="date" dir="ltr" value={f.firstSendDate} onChange={(e) => setF({ ...f, firstSendDate: e.target.value })} /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy}>{busy && <Loader2Icon className="animate-spin" />} {T.add}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{ar.common.cancel}</Button>
      </div>
      <Notice result={res} />
      {structure && <StructureView s={structure} />}
    </form>
  );
}

export function CompaniesView({ companies, isOwner, mock, saMode }: { companies: Co[]; isOwner: boolean; mock: boolean; saMode: boolean }) {
  return (
    <div className="grid gap-6">
      <AddCompany />
      {companies.length === 0 ? <p className="text-sm text-muted-foreground">{T.empty}</p> : (
        <ul className="grid gap-3">{companies.map((c) => <CompanyCard key={c.slug} c={c} isOwner={isOwner} mock={mock} />)}</ul>
      )}
      <section className="grid gap-2 rounded-xl border p-4">
        <h2 className="font-semibold">{T.checklist}</h2>
        <ol className="grid gap-1.5 text-sm">
          {T.steps.map((s, i) => (
            <li key={s} className={`flex items-start gap-2 ${i === 5 && !saMode ? "text-muted-foreground line-through" : ""}`}>
              <span className="grid size-5 shrink-0 place-items-center rounded-full border text-xs">{i + 1}</span> {s}
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">Code.gs v2: <code dir="ltr">apps-script/Code.gs</code></p>
      </section>
    </div>
  );
}
