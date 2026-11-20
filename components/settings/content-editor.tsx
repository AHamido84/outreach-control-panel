"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyPlusIcon, Loader2Icon, PlusIcon, Trash2Icon, Undo2Icon, XIcon } from "lucide-react";
import { ar } from "@/content/ar";
import { saveContent, type ContentEdit } from "@/app/actions/company";
import { Field, Notice, Warn, type Result } from "@/components/app/basics";
import { toStr } from "@/components/app/company-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fillTemplate, templateVars_, varsIn } from "@/lib/engine-port";
import { cn } from "@/lib/utils";

const C = ar.companySettings.content;

export type PlainRow = Record<string, string | number | boolean> & { _row: number };
export type PlainTable = { headers: string[]; rows: PlainRow[] };
type Draft = { id: string; _row?: number; values: Record<string, string>; cleared?: boolean };

const NUMERIC = new Set(["نصيبه من الحد اليومي", "رقم الخطوة", "بعد كام يوم من الخطوة اللي قبلها"]);

/** Rows whose editable columns are all empty (e.g. only a reference/formula column is filled) are not shown. */
function toDraft(rows: PlainRow[], cols: string[]): Draft[] {
  return rows.filter((r) => cols.some((c) => toStr(r[c]).trim() !== "")).map((r) => ({ id: "r" + r._row, _row: r._row, values: Object.fromEntries(cols.map((c) => [c, toStr(r[c])])) }));
}

function diff(orig: PlainRow[], draft: Draft[], cols: string[]): ContentEdit[] {
  const byRow = new Map(orig.map((r) => [r._row, r]));
  const edits: ContentEdit[] = [];
  for (const d of draft) {
    if (d._row === undefined) {
      if (d.cleared || cols.every((c) => !d.values[c]?.trim())) continue;
      edits.push({ kind: "add", values: Object.fromEntries(cols.map((c) => [c, cast(c, d.values[c] ?? "")])) });
    } else if (d.cleared) edits.push({ kind: "clear", row: d._row });
    else {
      const o = byRow.get(d._row)!;
      for (const c of cols) if ((d.values[c] ?? "") !== toStr(o[c])) edits.push({ kind: "set", row: d._row, header: c, value: cast(c, d.values[c] ?? "") });
    }
  }
  return edits;
}

const cast = (col: string, v: string): string | number => (NUMERIC.has(col) && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : v);

type Rule = { list?: string; ref?: { set: Set<string>; msg: string } };

// ------------------------------------------------------------------ generic table

export function TableEditor({ slug, tab, cols, table, lists, rules, keyCols, footer }: {
  slug: string; tab: string; cols: string[]; table: PlainTable; lists: Record<string, string[]>;
  rules: Record<string, Rule>; keyCols: string[]; footer?: (rows: Draft[]) => React.ReactNode;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => toDraft(table.rows, cols));
  const [res, setRes] = useState<Result | null>(null), [busy, setBusy] = useState(false);
  const [src, setSrc] = useState(table);
  if (src !== table) { setSrc(table); setDraft(toDraft(table.rows, cols)); } // new data after a save/refresh
  const edits = useMemo(() => diff(table.rows, draft, cols), [table.rows, draft, cols]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    const live = draft.filter((d) => !d.cleared);
    const seen = new Map<string, string>();
    for (const d of live) {
      for (const c of cols) {
        const v = (d.values[c] ?? "").trim(), r = rules[c];
        if (!v || !r) continue;
        if (r.list && lists[r.list]?.length && !lists[r.list].includes(v)) e[d.id + c] = C.notInList(v, r.list);
        if (r.ref && !r.ref.set.has(v)) e[d.id + c] = r.ref.msg;
      }
      if (keyCols.length && keyCols.every((k) => d.values[k]?.trim())) {
        const k = keyCols.map((x) => d.values[x].trim()).join("|");
        if (seen.has(k)) { e[d.id + keyCols[0]] = C.dupKey; e[seen.get(k)! + keyCols[0]] = C.dupKey; } else seen.set(k, d.id);
      }
    }
    return e;
  }, [draft, cols, rules, lists, keyCols]);

  const set = (id: string, c: string, v: string) => setDraft((ds) => ds.map((d) => (d.id === id ? { ...d, values: { ...d.values, [c]: v } } : d)));

  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-max min-w-full text-sm">
          <thead className="bg-muted/50"><tr>{cols.map((c) => <th key={c} className="p-2 text-right font-medium whitespace-nowrap">{c}</th>)}<th className="w-10" /></tr></thead>
          <tbody>
            {draft.map((d) => (
              <tr key={d.id} className={cn("border-t align-top", d.cleared && "bg-destructive/5 opacity-60", d._row === undefined && "bg-emerald-500/5")}>
                {cols.map((c) => {
                  const r = rules[c], err = errors[d.id + c], v = d.values[c] ?? "";
                  const opts = r?.list ? lists[r.list] ?? [] : r?.ref ? [...r.ref.set] : null;
                  return (
                    <td key={c} className="p-1.5">
                      {opts && opts.length ? (
                        <select aria-label={c} disabled={d.cleared} value={v} onChange={(e) => set(d.id, c, e.target.value)}
                          className={cn("h-8 w-28 rounded-md border bg-background px-2 text-sm", err && "border-destructive")}>
                          <option value="" />
                          {!opts.includes(v) && v && <option value={v}>{v}</option>}
                          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <Input aria-label={c} disabled={d.cleared} value={v} dir={NUMERIC.has(c) ? "ltr" : "auto"} inputMode={NUMERIC.has(c) ? "decimal" : undefined}
                          onChange={(e) => set(d.id, c, e.target.value)} className={cn("h-8", NUMERIC.has(c) ? "w-20" : "w-32", err && "border-destructive")} />
                      )}
                      {err && <p className="mt-0.5 max-w-36 text-xs text-destructive">{err}</p>}
                    </td>
                  );
                })}
                <td className="p-1.5">
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={d.cleared ? "تراجع" : C.clearRow} title={d.cleared ? "تراجع" : C.clearRow}
                    onClick={() => setDraft((ds) => d._row === undefined ? ds.filter((x) => x.id !== d.id) : ds.map((x) => (x.id === d.id ? { ...x, cleared: !x.cleared } : x)))}>
                    {d.cleared ? <Undo2Icon /> : d._row === undefined ? <XIcon /> : <Trash2Icon />}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer?.(draft)}
      {draft.some((d) => d.cleared) && <p className="text-xs text-muted-foreground">{C.cleared}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setDraft((ds) => [...ds, { id: "n" + Date.now(), values: {} }])}><PlusIcon /> {C.addRow}</Button>
        <Button type="button" size="sm" disabled={busy || !edits.length || Object.keys(errors).length > 0} onClick={async () => {
          setBusy(true); setRes(null);
          const r = await saveContent(slug, tab, edits);
          setBusy(false); setRes(r);
          if (r.ok) router.refresh(); else setDraft(toDraft(table.rows, cols)); // rollback
        }}>{busy && <Loader2Icon className="animate-spin" />} {C.saveChanges}</Button>
        {edits.length > 0 && <span className="text-xs text-muted-foreground">{C.pending(edits.length)}</span>}
        <Notice result={res} />
      </div>
    </div>
  );
}

/** Segments footer: total share of active segments must be 100%. */
export function shareFooter(rows: Draft[]) {
  const active = rows.filter((d) => !d.cleared && d.values["كود الـ Segment"]?.trim() && d.values["مفعّل"] !== "لا");
  const total = active.reduce((s, d) => s + (Number(d.values["نصيبه من الحد اليومي"]) || 0), 0);
  const pct = Math.round(total * 1000) / 10;
  const ok = Math.abs(total - 1) < 0.0005;
  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-sm", ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/10")}>
      <span>{C.share}:</span> <strong dir="ltr">{pct}%</strong> {ok ? "✓" : <span className="text-amber-800 dark:text-amber-200">— {C.shareBad}</span>}
      <span className="text-xs text-muted-foreground">(0.6 = 60%)</span>
    </div>
  );
}

// ------------------------------------------------------------------ Lists (column-oriented)

export function ListsEditor({ slug, table }: { slug: string; table: PlainTable }) {
  const router = useRouter();
  const [add, setAdd] = useState<Record<string, string>>({});
  const [res, setRes] = useState<Result | null>(null), [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, edits: ContentEdit[]) => {
    setBusy(key); const r = await saveContent(slug, "Lists", edits); setBusy(null); setRes(r); if (r.ok) router.refresh();
  };
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {table.headers.filter(Boolean).map((h) => {
          const cells = table.rows.filter((r) => toStr(r[h]) !== "");
          return (
            <div key={h} className="grid content-start gap-2 rounded-lg border p-3">
              <h4 className="text-sm font-medium">{h}</h4>
              <div className="flex flex-wrap gap-1.5">
                {cells.map((r) => (
                  <span key={r._row} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 ps-2.5 pe-1 text-xs">
                    {toStr(r[h])}
                    <button type="button" aria-label={ar.common.remove + " " + toStr(r[h])} disabled={!!busy} className="rounded-full p-0.5 hover:bg-destructive/10"
                      onClick={() => run("rm" + h + r._row, [{ kind: "set", row: r._row, header: h, value: "" }])}><XIcon className="size-3" /></button>
                  </span>
                ))}
              </div>
              <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); const v = add[h]?.trim(); if (v) run("add" + h, [{ kind: "add", values: { [h]: v } }]).then(() => setAdd((s) => ({ ...s, [h]: "" }))); }}>
                <Input aria-label={`${ar.common.add} — ${h}`} value={add[h] ?? ""} onChange={(e) => setAdd((s) => ({ ...s, [h]: e.target.value }))} className="h-7 text-xs" />
                <Button size="sm" variant="outline" disabled={!!busy}>{busy === "add" + h ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}</Button>
              </form>
            </div>
          );
        })}
      </div>
      <Notice result={res} />
    </div>
  );
}

// ------------------------------------------------------------------ Templates

const TPL_COLS = ["كود القالب", "اللغة", "النسخة", "الموضوع", "النص"];
const COMPUTED_VARS = ["اسم_الشخص", "اسم_الجهة", "اسم_شركتنا", "اسم_المرسل", "وصف_الخدمة", "لينك_الحجز", "لينك_البروفايل", "التوقيع", "النشاط", "المدينة", "البلد", "المنصب"];

export function TemplatesEditor({ slug, table, lists, leads, company }: {
  slug: string; table: PlainTable; lists: Record<string, string[]>; leads: Record<string, string>[]; company: Record<string, unknown>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => toDraft(table.rows, TPL_COLS));
  const [sel, setSel] = useState(draft[0]?.id ?? "");
  const [leadId, setLeadId] = useState(leads[0]?.["ID"] ?? "");
  const [res, setRes] = useState<Result | null>(null), [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [src, setSrc] = useState(table);
  if (src !== table) { setSrc(table); setDraft(toDraft(table.rows, TPL_COLS)); }
  const edits = useMemo(() => diff(table.rows, draft, TPL_COLS), [table.rows, draft]);
  const cur = draft.find((d) => d.id === sel);
  const lead = useMemo(() => leads.find((l) => l["ID"] === leadId) ?? {}, [leads, leadId]);
  const lang = String(lead["اللغة"] || "AR").toUpperCase(); // the engine uses the lead's language
  const set = (c: string, v: string) => setDraft((ds) => ds.map((d) => (d.id === sel ? { ...d, values: { ...d.values, [c]: v } } : d)));

  const insertVar = (name: string) => {
    if (!cur) return;
    const ta = bodyRef.current, tok = `{${name}}`, body = cur.values["النص"] ?? "";
    const a = ta?.selectionStart ?? body.length, b = ta?.selectionEnd ?? body.length;
    set("النص", body.slice(0, a) + tok + body.slice(b));
    requestAnimationFrame(() => { ta?.focus(); ta?.setSelectionRange(a + tok.length, a + tok.length); });
  };
  const allVars = useMemo(() => {
    const keys = Object.keys(templateVars_(lead, company, lang));
    return [...COMPUTED_VARS, ...keys.filter((k) => !COMPUTED_VARS.includes(k))];
  }, [lead, company, lang]);

  const subj = cur?.values["الموضوع"] ?? "", body = cur?.values["النص"] ?? "";
  const isFollowup = /^\(/.test(subj.trim());
  const pBody = fillTemplate(body, lead, company, lang), pSubj = fillTemplate(subj, lead, company, lang);
  const missing = [...new Set([...pBody.missing, ...(isFollowup ? [] : pSubj.missing)])];
  const versionErr = cur && lists["النسخ"]?.length && cur.values["النسخة"] && !lists["النسخ"].includes(cur.values["النسخة"]);
  const langErr = cur && lists["اللغات"]?.length && cur.values["اللغة"] && !lists["اللغات"].includes(cur.values["اللغة"]);
  const dupKey = cur && draft.some((d) => d.id !== cur.id && !d.cleared && d.values["كود القالب"] === cur.values["كود القالب"] && d.values["النسخة"] === cur.values["النسخة"]);

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <div className="grid min-w-0 content-start gap-1.5">
        {draft.map((d) => (
          <button key={d.id} type="button" onClick={() => setSel(d.id)}
            className={cn("flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-right text-sm", sel === d.id && "border-primary bg-primary/5", d.cleared && "line-through opacity-50")}>
            <span className="truncate" dir="ltr">{d.values["كود القالب"] || "(جديد)"}</span>
            <span className="text-xs text-muted-foreground">{d.values["النسخة"]} · {d.values["اللغة"]}</span>
          </button>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => { const id = "n" + Date.now(); setDraft((ds) => [...ds, { id, values: { "اللغة": "AR", "النسخة": "A" } }]); setSel(id); }}>
          <PlusIcon /> قالب جديد
        </Button>
      </div>

      {cur ? (
        <div className="grid min-w-0 gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={C.tpl.code} htmlFor="t-code"><Input id="t-code" dir="ltr" value={cur.values["كود القالب"] ?? ""} onChange={(e) => set("كود القالب", e.target.value)} /></Field>
            <Field label={C.tpl.lang} htmlFor="t-lang">
              <select id="t-lang" value={cur.values["اللغة"] ?? ""} onChange={(e) => set("اللغة", e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm">
                {(lists["اللغات"]?.length ? lists["اللغات"] : ["AR", "EN"]).map((l) => <option key={l}>{l}</option>)}
              </select>
            </Field>
            <Field label={C.tpl.version} htmlFor="t-ver">
              <select id="t-ver" value={cur.values["النسخة"] ?? ""} onChange={(e) => set("النسخة", e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm">
                {(lists["النسخ"]?.length ? lists["النسخ"] : ["A", "B", "-"]).map((l) => <option key={l}>{l}</option>)}
              </select>
            </Field>
          </div>
          {(versionErr || langErr) && <Warn>{versionErr ? C.notInList(cur.values["النسخة"], "النسخ") : C.notInList(cur.values["اللغة"], "اللغات")}</Warn>}
          {dupKey && <Warn>{C.dupKey}: {cur.values["كود القالب"]} / {cur.values["النسخة"]}</Warn>}
          <Field label={C.tpl.subject} help={isFollowup ? C.tpl.followup : undefined} htmlFor="t-subj">
            <Input id="t-subj" dir="auto" value={subj} onChange={(e) => set("الموضوع", e.target.value)} />
          </Field>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{C.tpl.vars}</span>
            <div className="flex flex-wrap gap-1">
              {allVars.slice(0, 40).map((v) => (
                <button key={v} type="button" onClick={() => insertVar(v)} className="rounded-full border bg-muted/40 px-2 py-0.5 text-xs hover:bg-muted">{`{${v}}`}</button>
              ))}
            </div>
          </div>
          <Field label={C.tpl.body} htmlFor="t-body">
            <Textarea id="t-body" ref={bodyRef} rows={10} dir={cur.values["اللغة"] === "EN" ? "ltr" : "rtl"} value={body} onChange={(e) => set("النص", e.target.value)} />
          </Field>

          <div className="grid gap-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{C.tpl.preview}</span>
              {leads.length ? (
                <select aria-label={C.tpl.pickLead} value={leadId} onChange={(e) => setLeadId(e.target.value)} className="h-8 max-w-64 rounded-md border bg-background px-2 text-sm">
                  {leads.map((l) => <option key={l["ID"]} value={l["ID"]}>{l["ID"]} — {l["اسم الجهة"]} ({l["اللغة"] || "AR"})</option>)}
                </select>
              ) : <span className="text-xs text-muted-foreground">{C.tpl.noLeads}</span>}
            </div>
            {missing.length > 0 && <Warn>{C.tpl.missing}: {missing.map((m) => `{${m}}`).join("، ")}</Warn>}
            <div dir={lang === "EN" ? "ltr" : "rtl"} className="grid gap-2 rounded-md border bg-background p-3" style={{ textAlign: lang === "EN" ? "left" : "right" }}>
              {!isFollowup && <p className="font-semibold">{pSubj.text || "—"}</p>}
              <div className="font-sans text-sm leading-relaxed whitespace-pre-wrap">{pBody.text}</div>
            </div>
            <p className="text-xs text-muted-foreground">النسخة اللي هتتبعت للعميل ده في أول خطوة: A/B بالتناوب حسب رقم الـ ID · المتغيرات الموجودة: {varsIn(body).length}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => {
              const id = "n" + Date.now();
              const nextV = cur.values["النسخة"] === "A" ? "B" : "A";
              setDraft((ds) => [...ds, { id, values: { ...cur.values, "النسخة": nextV } }]); setSel(id);
            }}><CopyPlusIcon /> نسخة A/B</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDraft((ds) => cur._row === undefined ? ds.filter((d) => d.id !== cur.id) : ds.map((d) => (d.id === cur.id ? { ...d, cleared: !d.cleared } : d)))}>
              {cur.cleared ? <Undo2Icon /> : <Trash2Icon />} {cur.cleared ? "تراجع" : C.clearRow}
            </Button>
            <Button type="button" size="sm" disabled={busy || !edits.length || !!versionErr || !!langErr || !!dupKey} onClick={async () => {
              setBusy(true); setRes(null);
              const r = await saveContent(slug, "Templates", edits);
              setBusy(false); setRes(r);
              if (r.ok) router.refresh(); else setDraft(toDraft(table.rows, TPL_COLS));
            }}>{busy && <Loader2Icon className="animate-spin" />} {C.saveChanges}</Button>
            {edits.length > 0 && <span className="text-xs text-muted-foreground">{C.pending(edits.length)}</span>}
            <Notice result={res} />
          </div>
        </div>
      ) : <p className="text-sm text-muted-foreground">—</p>}
    </div>
  );
}
