"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { ar } from "@/content/ar";
import { saveCompanyKeys } from "@/app/actions/company";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { WEEK_AR } from "@/lib/engine-port";
import { Field, Notice, type Result } from "./basics";

export type FieldType = "text" | "url" | "email" | "number" | "tz" | "toggle" | "days" | "textarea" | "tel";
export type FieldSpec = { key: string; label?: string; type?: FieldType; help?: ReactNode; step?: string; min?: number; max?: number; placeholder?: string; dir?: "ltr" | "rtl" };
export type Vals = Record<string, string>;

export const TIMEZONES = ["Asia/Riyadh", "Africa/Cairo", "Asia/Dubai", "Asia/Kuwait", "Asia/Qatar", "Asia/Bahrain", "Asia/Muscat", "Asia/Amman",
  "Asia/Beirut", "Asia/Baghdad", "Africa/Casablanca", "Africa/Tunis", "Africa/Algiers", "Europe/London", "Europe/Berlin", "America/New_York", "UTC"];

export { toStr } from "./shared";

/** One input bound to a Company key. */
export function KeyInput({ spec, value, onChange, id }: { spec: FieldSpec; value: string; onChange: (v: string) => void; id: string }) {
  const t = spec.type || "text";
  if (t === "toggle") {
    return (
      <div className="flex items-center gap-2">
        <Switch id={id} checked={value === "نعم"} onCheckedChange={(c) => onChange(c ? "نعم" : "لا")} />
        <span className="text-sm">{value === "نعم" ? ar.common.yes : ar.common.no}</span>
      </div>
    );
  }
  if (t === "days") {
    const sel = value.split(/[,،]/).map((d) => d.trim()).filter(Boolean);
    return (
      <div id={id} role="group" className="flex flex-wrap gap-1.5">
        {WEEK_AR.map((d) => {
          const on = sel.includes(d);
          return (
            <button key={d} type="button" aria-pressed={on}
              onClick={() => onChange(WEEK_AR.filter((x) => (x === d ? !on : sel.includes(x))).join(","))}
              className={`rounded-full border px-3 py-1 text-sm transition ${on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
              {d}
            </button>
          );
        })}
      </div>
    );
  }
  if (t === "textarea") return <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} dir={spec.dir} rows={3} />;
  if (t === "tz") {
    return (
      <>
        <Input id={id} dir="ltr" list={id + "-list"} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Asia/Riyadh" />
        <datalist id={id + "-list"}>{TIMEZONES.map((z) => <option key={z} value={z} />)}</datalist>
      </>
    );
  }
  const ltr = ["url", "email", "number", "tel"].includes(t) || spec.dir === "ltr";
  return (
    <Input id={id} type={t === "tel" ? "tel" : t === "number" ? "number" : t === "email" ? "email" : t === "url" ? "url" : "text"}
      dir={ltr ? "ltr" : spec.dir} step={spec.step} min={spec.min} max={spec.max} placeholder={spec.placeholder}
      value={value} onChange={(e) => onChange(e.target.value)} />
  );
}

/**
 * Form over Company-tab keys: sends only changed keys, keeps the edit on screen (optimistic),
 * rolls back to the last saved values when the write fails.
 */
export function CompanyKeysForm({ slug, fields, initial, extra, columns = 2, onSaved, onValuesChange }: {
  slug: string; fields: FieldSpec[]; initial: Vals; extra?: (v: Vals) => ReactNode; columns?: 1 | 2; onSaved?: (v: Vals) => void; onValuesChange?: (v: Vals) => void;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<Vals>(initial);
  const [vals, setVals] = useState<Vals>(initial);
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const changed = useMemo(() => fields.filter((f) => (vals[f.key] ?? "") !== (saved[f.key] ?? "")), [fields, vals, saved]);

  return (
    <form className="grid gap-4" onSubmit={async (e) => {
      e.preventDefault();
      if (!changed.length) { setRes({ ok: true, message: ar.common.unchanged }); return; }
      setBusy(true); setRes(null);
      const payload = Object.fromEntries(changed.map((f) => [f.key, vals[f.key] ?? ""]));
      const r = await saveCompanyKeys(slug, payload);
      setBusy(false); setRes(r);
      if (r.ok) { setSaved(vals); onSaved?.(vals); router.refresh(); }
      else { setVals(saved); onValuesChange?.(saved); } // rollback
    }}>
      <div className={`grid gap-4 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
        {fields.map((f) => (
          <Field key={f.key} label={f.label || f.key} help={f.help} htmlFor={`f-${f.key}`}
            className={f.type === "days" || f.type === "textarea" ? "sm:col-span-2" : undefined}>
            <KeyInput id={`f-${f.key}`} spec={f} value={vals[f.key] ?? ""} onChange={(v) => { const next = { ...vals, [f.key]: v }; setVals(next); onValuesChange?.(next); }} />
          </Field>
        ))}
      </div>
      {extra?.(vals)}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>{busy && <Loader2Icon className="animate-spin" />} {busy ? ar.common.saving : ar.common.save}</Button>
        {changed.length > 0 && !busy && <span className="text-xs text-muted-foreground">{ar.companySettings.content.pending(changed.length)}</span>}
        <Notice result={res} />
      </div>
    </form>
  );
}
