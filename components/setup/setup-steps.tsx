"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { addCompany, mockSimulate, testCompany } from "@/app/actions/companies";
import { completeSetup } from "@/app/actions/app-settings";
import { Field, Notice, type Result } from "@/components/app/basics";
import { StructureView } from "@/components/settings/companies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Structure = { ok: boolean; missingTabs: string[]; missingHeaders: Record<string, string[]>; needsEngineSetup: boolean; title?: string };

export const STEPS = ["اتصال Google", "أول شركة", "ربط المحرك", "الإيميل المرسل", "monday", "خلاص"];

export function StepBar({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {STEPS.map((s, i) => (
        <li key={s} className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1", step === i + 1 && "border-primary bg-primary/5 font-medium", step > i + 1 && "text-emerald-700")}>
          {step > i + 1 ? <CheckIcon className="size-3" /> : <span>{i + 1}</span>} {s}
        </li>
      ))}
    </ol>
  );
}

/** Step 2: add (or pick) the first company and check its tabs/headers. */
export function FirstCompany({ existing, mock, defaultSlug }: { existing: { slug: string; name: string }[]; mock: boolean; defaultSlug?: string }) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", sheetUrl: "" });
  const [slug, setSlug] = useState(defaultSlug ?? "");
  const [structure, setStructure] = useState<Structure | null>(null);
  const [res, setRes] = useState<Result | null>(null), [busy, setBusy] = useState<string | null>(null);
  const check = async (s: string) => {
    setBusy("check"); const r = await testCompany(s); setBusy(null);
    if (r.ok) setStructure(r.data!.structure as Structure); else setRes(r);
  };
  return (
    <div className="grid gap-4">
      {existing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">شركة موجودة:</span>
          {existing.map((c) => <Button key={c.slug} size="sm" variant={slug === c.slug ? "default" : "outline"} onClick={() => { setSlug(c.slug); setStructure(null); check(c.slug); }}>{c.name}</Button>)}
        </div>
      )}
      {!slug && (
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy("add"); setRes(null);
          const r = await addCompany({ ...f, color: "#0f766e" });
          setBusy(null); setRes(r);
          if (r.ok) { const d = r.data as { slug: string; structure: Structure | null }; setSlug(d.slug); setStructure(d.structure); router.refresh(); }
        }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="اسم الشركة" htmlFor="w-name"><Input id="w-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="لينك الشيت" help="نسخة من شيت الـ Master" htmlFor="w-url"><Input id="w-url" required dir="ltr" value={f.sheetUrl} onChange={(e) => setF({ ...f, sheetUrl: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/…/edit" /></Field>
          </div>
          <div><Button disabled={!!busy}>{busy === "add" && <Loader2Icon className="animate-spin" />} إضافة وفحص الشيت</Button></div>
        </form>
      )}
      <Notice result={res} />
      {structure && <StructureView s={structure} />}
      {slug && structure && !structure.ok && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!!busy} onClick={() => check(slug)}>{busy === "check" && <Loader2Icon className="animate-spin" />} افحص تاني</Button>
          {mock && <Button variant="outline" size="sm" onClick={async () => { await mockSimulate(slug, "setup"); check(slug); }}>محاكاة «إعداد أول مرة» (تجريبي)</Button>}
        </div>
      )}
      {slug && structure?.ok && <div><Button asChild><Link href={`/setup?step=3&c=${slug}`}>التالي</Link></Button></div>}
    </div>
  );
}

/** Step 3: wait for System.dashboardLinked = نعم (polls every 5 s). */
export function WaitForLink({ slug, mock }: { slug: string; mock: boolean }) {
  const [linked, setLinked] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stop = false, t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const r = await testCompany(slug);
      if (stop) return;
      if (r.ok && r.data!.linked) { setLinked(true); return; }
      if (!r.ok) setErr(r.error);
      t = setTimeout(tick, 5000);
    };
    tick();
    return () => { stop = true; clearTimeout(t); };
  }, [slug]);
  return (
    <div className="grid gap-3">
      {linked ? <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">المحرك مربوط ✓ (System ← dashboardLinked = نعم)</p> : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2Icon className="size-4 animate-spin" /> مستنيين المحرك يتربط… الصفحة بتفحص كل 5 ثواني</p>
      )}
      {err && <Notice result={{ ok: false, error: err }} />}
      {!linked && mock && <div><Button variant="outline" size="sm" onClick={() => mockSimulate(slug, "link")}>محاكاة «ربط الداشبورد» (تجريبي)</Button></div>}
      <div className="flex gap-2">
        <Button asChild disabled={!linked}><Link aria-disabled={!linked} href={linked ? `/setup?step=4&c=${slug}` : "#"}>التالي</Link></Button>
      </div>
    </div>
  );
}

export function Finish({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  return (
    <div className="grid gap-3">
      <p className="text-sm">كل حاجة جاهزة. تقدر ترجع لأي إعداد بعدين من «إعدادات الشركة» و«إعدادات التطبيق».</p>
      <div><Button disabled={busy} onClick={async () => { setBusy(true); const r = await completeSetup(slug); setBusy(false); if (r && !r.ok) setRes(r); }}>
        {busy && <Loader2Icon className="animate-spin" />} افتح النظرة العامة</Button></div>
      <Notice result={res} />
    </div>
  );
}
