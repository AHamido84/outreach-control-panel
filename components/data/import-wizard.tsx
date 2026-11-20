"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, FileUpIcon, Loader2Icon } from "lucide-react";
import { importChunk, importClear, importFinish, importStart } from "@/app/actions/data";
import { Field, Notice, Warn, type Result } from "@/components/app/basics";
import { waitCommand } from "@/components/app/poll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { classifyImport, type PreviewRow } from "@/lib/engine-port/import";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./badges";

export type ImportCtx = {
  sources: { code: string; name: string; active: boolean }[];
  mappings: { source: string; from: string; to: string }[];
  fields: string[];
  sourceTypes: string[];
  leads: { "الإيميل": string; "الموقع": string }[];
  dncRows: { "الإيميل أو الدومين": string; "النوع": string }[];
  segments: Record<string, string>[];
};

type Parsed = { name: string; headers: string[]; rows: string[][] };

const ALIASES: [RegExp, string][] = [
  [/^(e-?mail|email address|mail|البريد|البريد الإلكتروني|ايميل|إيميل)$/i, "الإيميل"],
  [/^(company|company name|organization|organisation|business|business name|اسم الشركة|الشركة|الجهة)$/i, "اسم الجهة"],
  [/^(website|web site|url|domain|site|الموقع الإلكتروني)$/i, "الموقع"],
  [/^(phone|mobile|tel|telephone|phone number|whatsapp|الجوال|الهاتف|رقم الجوال|موبايل)$/i, "التليفون"],
  [/^(first name|name|contact|contact name|full name|الاسم)$/i, "اسم الشخص"],
  [/^(title|job title|position|role|الوظيفة)$/i, "المنصب"],
  [/^(industry|category|sector|niche|التصنيف|القطاع)$/i, "النشاط"],
  [/^(city|المدينه)$/i, "المدينة"],
  [/^(country|الدوله)$/i, "البلد"],
  [/^(language|lang)$/i, "اللغة"],
  [/^(notes?|comments?)$/i, "ملاحظات"],
];

function suggest(header: string, source: string, ctx: ImportCtx): string {
  const h = header.trim();
  const own = ctx.mappings.find((m) => m.source === source && m.from === h);
  if (own) return own.to;
  if (ctx.fields.includes(h)) return h;
  const other = ctx.mappings.find((m) => m.from === h);
  if (other) return other.to;
  return ALIASES.find(([re]) => re.test(h))?.[1] ?? "";
}

async function parseFile(f: File): Promise<Parsed> {
  if (/\.(xlsx|xls|ods)$/i.test(f.name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
    const sh = wb.Sheets[wb.SheetNames[0]];
    const all = XLSX.utils.sheet_to_json<string[]>(sh, { header: 1, raw: false, defval: "" }) as string[][];
    return tidy(f.name, all);
  }
  return parseText(f.name, await f.text());
}

async function parseText(name: string, text: string): Promise<Parsed> {
  const Papa = (await import("papaparse")).default;
  const r = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy", delimiter: "" });
  return tidy(name, r.data);
}

function tidy(name: string, all: string[][]): Parsed {
  const rows = all.map((r) => r.map((v) => String(v ?? "").trim())).filter((r) => r.some(Boolean));
  const headers = (rows[0] ?? []).map((h, i) => h || `عمود ${i + 1}`);
  return { name, headers, rows: rows.slice(1).map((r) => headers.map((_, i) => r[i] ?? "")) };
}

const CHUNK = 500;
type Progress = { chunk: number; chunks: number; phase: "import" | "process" | "done"; waitedMs: number; status: string };

export function ImportWizard({ slug, ctx }: { slug: string; ctx: ImportCtx }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Parsed | null>(null);
  const [paste, setPaste] = useState("");
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [srcMode, setSrcMode] = useState<"existing" | "new">(ctx.sources.length ? "existing" : "new");
  const [srcCode, setSrcCode] = useState(ctx.sources.find((s) => s.active)?.code ?? "");
  const nextCode = useMemo(() => "SRC" + String(Math.max(0, ...ctx.sources.map((s) => Number(s.code.replace(/\D/g, "")) || 0)) + 1).padStart(2, "0"), [ctx.sources]);
  const [newSrc, setNewSrc] = useState({ code: nextCode, name: "", type: ctx.sourceTypes[0] ?? "ملف" });
  const [map, setMap] = useState<string[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [summary, setSummary] = useState<{ imp: Record<string, number>; process?: string } | null>(null);
  const [needsClear, setNeedsClear] = useState(false);
  const [cleared, setCleared] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const source = srcMode === "existing" ? srcCode : newSrc.code.trim();
  const sourceActive = srcMode === "new" || !!ctx.sources.find((s) => s.code === srcCode)?.active;

  const load = (p: Parsed) => {
    if (!p.rows.length) { setParseErr("مالقيناش صفوف داتا تحت صف العناوين"); return; }
    setData(p); setParseErr(null);
    setMap(p.headers.map((h) => suggest(h, source, ctx)));
    setStep(2);
  };

  const mapped = useMemo(() => {
    if (!data) return { headers: [] as string[], rows: [] as string[][], objs: [] as Record<string, string>[] };
    const cols = map.map((f, i) => ({ f, i })).filter((x) => x.f);
    const objs = data.rows.map((r) => {
      const o: Record<string, string> = {};
      cols.forEach(({ f, i }) => { if (r[i] !== "" && !o[f]) o[f] = r[i]; }); // engine: first non-empty wins
      return o;
    });
    return { headers: cols.map((c) => c.f), rows: data.rows.map((r) => cols.map((c) => r[c.i])), objs };
  }, [data, map]);

  const preview: PreviewRow[] = useMemo(
    () => (step >= 4 ? classifyImport(mapped.objs, { leads: ctx.leads, dncRows: ctx.dncRows, segments: ctx.segments, sourceActive }) : []),
    [step, mapped.objs, ctx, sourceActive],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    preview.forEach((p) => { c[p.status] = (c[p.status] || 0) + 1; if (p.badEmail) c["إيميل غلط"] = (c["إيميل غلط"] || 0) + 1; if (p.status === "جديد" && !p.segment) c["بدون Segment"] = (c["بدون Segment"] || 0) + 1; });
    return c;
  }, [preview]);

  const newMappings = useMemo(() => (data ? data.headers.map((h, i) => ({ from: h, to: map[i] }))
    .filter((x) => x.to && x.from !== x.to && !ctx.mappings.some((m) => m.source === source && m.from === x.from)) : []), [data, map, ctx.mappings, source]);

  async function run() {
    if (!data) return;
    setRunning(true); setRes(null); setSummary(null); setNeedsClear(false);
    const start = await importStart(slug, {
      source: { code: source, create: srcMode === "new" ? { name: newSrc.name, type: newSrc.type } : undefined },
      newMappings,
    });
    if (!start.ok) { setRes(start); setRunning(false); return; }
    // only non-empty rows are sent
    const rows = mapped.rows.filter((r) => r.some((v) => v.trim()));
    const chunks = Math.max(1, Math.ceil(rows.length / CHUNK));
    const totals: Record<string, number> = { rows: 0, added: 0, duplicate: 0, noEmail: 0, dnc: 0 };
    try {
      for (let i = 0; i < chunks; i++) {
        const last = i === chunks - 1;
        setProgress({ chunk: i + 1, chunks, phase: "import", waitedMs: 0, status: "" });
        const r = await importChunk(slug, source, mapped.headers, rows.slice(i * CHUNK, (i + 1) * CHUNK), last);
        if (!r.ok) { if (/Import فيه داتا/.test(r.error)) setNeedsClear(true); throw Object.assign(new Error(r.error), { detail: r.detail }); }
        const c = await waitCommand(slug, r.data!.importId, (cmd, ms) => setProgress({ chunk: i + 1, chunks, phase: "import", waitedMs: ms, status: cmd?.status ?? "" }));
        if (c.status !== "تم") { setNeedsClear(true); throw Object.assign(new Error("الاستيراد فشل: " + String(c.result?.error ?? c.status)), { detail: c.resultRaw }); }
        for (const k of Object.keys(totals)) totals[k] += Number(c.result?.[k] || 0);
        if (last && r.data!.processId) {
          setProgress({ chunk: i + 1, chunks, phase: "process", waitedMs: 0, status: "" });
          const p = await waitCommand(slug, r.data!.processId, (cmd, ms) => setProgress({ chunk: i + 1, chunks, phase: "process", waitedMs: ms, status: cmd?.status ?? "" }));
          setSummary({ imp: totals, process: p.status === "تم" ? String(p.result?.summary ?? "") : "فشل: " + String(p.result?.error ?? "") });
        }
      }
      setProgress((p) => (p ? { ...p, phase: "done" } : p));
      setRes({ ok: true, message: "الاستيراد خلص ✓" });
      router.refresh();
    } catch (e) {
      setRes({ ok: false, error: (e as Error).message, detail: (e as { detail?: string }).detail });
    } finally {
      await importFinish(slug);
      setRunning(false);
    }
  }

  const Steps = ["الملف", "المصدر", "ربط الأعمدة", "معاينة", "الاستيراد"];
  return (
    <div className="grid gap-5">
      <ol className="flex flex-wrap gap-2 text-xs">
        {Steps.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1", step === i + 1 && "border-primary bg-primary/5 font-medium", step > i + 1 && "text-emerald-700")}>
            {step > i + 1 ? <CheckIcon className="size-3" /> : <span>{i + 1}</span>} {s}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="grid gap-4">
          <div className="grid place-items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center">
            <FileUpIcon className="size-8 text-muted-foreground" />
            <p className="text-sm">CSV أو Excel (أول شيت) — أول صف = أسماء الأعمدة</p>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.ods" className="hidden" aria-label="ملف الداتا"
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { load(await parseFile(f)); } catch (err) { setParseErr((err as Error).message); } } }} />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>اختار ملف</Button>
          </div>
          <Field label="أو الصق جدول (من Excel أو Google Sheets)" htmlFor="paste">
            <Textarea id="paste" dir="auto" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Company\tEmail\tWebsite\n…"} className="font-mono text-xs" />
          </Field>
          <div><Button type="button" disabled={!paste.trim()} onClick={async () => load(await parseText("لصق", paste))}>كمّل</Button></div>
          {parseErr && <Notice result={{ ok: false, error: "مقدرناش نقرا الملف", detail: parseErr }} />}
        </div>
      )}

      {step === 2 && data && (
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">{data.name}: {data.rows.length} صف · {data.headers.length} عمود</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={srcMode === "existing" ? "default" : "outline"} onClick={() => setSrcMode("existing")} disabled={!ctx.sources.length}>مصدر موجود</Button>
            <Button type="button" size="sm" variant={srcMode === "new" ? "default" : "outline"} onClick={() => setSrcMode("new")}>مصدر جديد</Button>
          </div>
          {srcMode === "existing" ? (
            <Field label="المصدر" htmlFor="src">
              <select id="src" value={srcCode} onChange={(e) => setSrcCode(e.target.value)} className="h-9 max-w-sm rounded-md border bg-background px-2 text-sm">
                {ctx.sources.map((s) => <option key={s.code} value={s.code} disabled={!s.active}>{s.code} — {s.name}{s.active ? "" : " (متوقف)"}</option>)}
              </select>
            </Field>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="كود المصدر" htmlFor="ns-code"><Input id="ns-code" dir="ltr" value={newSrc.code} onChange={(e) => setNewSrc({ ...newSrc, code: e.target.value })} /></Field>
              <Field label="اسم المصدر" htmlFor="ns-name"><Input id="ns-name" value={newSrc.name} onChange={(e) => setNewSrc({ ...newSrc, name: e.target.value })} placeholder="Apollo — نوفمبر" /></Field>
              <Field label="النوع" htmlFor="ns-type">
                <select id="ns-type" value={newSrc.type} onChange={(e) => setNewSrc({ ...newSrc, type: e.target.value })} className="h-9 rounded-md border bg-background px-2 text-sm">
                  {(ctx.sourceTypes.length ? ctx.sourceTypes : ["ملف"]).map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              {ctx.sources.some((s) => s.code === newSrc.code.trim()) && <Warn className="sm:col-span-3">الكود ده موجود — اختاره من «مصدر موجود»</Warn>}
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>رجوع</Button>
            <Button type="button" disabled={!source || (srcMode === "new" && ctx.sources.some((s) => s.code === newSrc.code.trim()))}
              onClick={() => { setMap(data.headers.map((h) => suggest(h, source, ctx))); setStep(3); }}>كمّل</Button>
          </div>
        </div>
      )}

      {step === 3 && data && (
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">اربط كل عمود في الملف بحقل في Leads. الاقتراحات من «ربط الأعمدة» والأسماء المطابقة. الربط الجديد بيتحفظ للمرة الجاية.</p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-max text-sm">
              <thead className="bg-muted/50"><tr><th className="p-2 text-right font-medium">عمود الملف</th><th className="p-2 text-right font-medium">مثال</th><th className="p-2 text-right font-medium">الحقل في Leads</th></tr></thead>
              <tbody>{data.headers.map((h, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2 font-medium" dir="auto">{h}</td>
                  <td className="max-w-56 truncate p-2 text-muted-foreground" dir="auto">{data.rows.find((r) => r[i])?.[i] ?? ""}</td>
                  <td className="p-2">
                    <select aria-label={`الحقل لـ ${h}`} value={map[i] ?? ""} onChange={(e) => setMap((m) => m.map((x, j) => (j === i ? e.target.value : x)))}
                      className="h-8 w-44 rounded-md border bg-background px-2 text-sm">
                      <option value="">— تجاهل —</option>
                      {ctx.fields.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {!map.includes("الإيميل") && !map.includes("الموقع") && <Warn>مافيش عمود للإيميل ولا للموقع — كل الصفوف هتبقى «مافيش إيميل»</Warn>}
          {newMappings.length > 0 && <p className="text-xs text-muted-foreground">ربط جديد هيتحفظ في «Field Mapping»: {newMappings.map((m) => `${m.from} ← ${m.to}`).join("، ")}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep(2)}>رجوع</Button>
            <Button type="button" disabled={!map.some(Boolean)} onClick={() => setStep(4)}>معاينة</Button>
          </div>
        </div>
      )}

      {step >= 4 && data && (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {(["جديد", "مكرر", "في Do-Not-Contact", "مافيش إيميل", "إيميل غلط", "بدون Segment", "متجاهل"] as const).filter((k) => counts[k]).map((k) => (
              <button key={k} type="button" onClick={() => setFilter(filter === k ? null : k)}
                className={cn("rounded-lg border px-3 py-1.5 text-sm", filter === k && "border-primary ring-2 ring-primary/20")}>
                <StatusBadge value={k} /> <strong className="ms-1">{counts[k]}</strong>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            المعاينة محسوبة بنفس قواعد المحرك (pickEmail_ / isValidEmail_ / التكرار / Do-Not-Contact / matchSegment_). «إيميل غلط» = الخانة فيها كلام بس مافيهاش إيميل صحيح — المحرك بيعاملها «مافيش إيميل» (أو بيدوّر في الموقع).
          </p>
          <div className="max-h-96 overflow-auto rounded-lg border">
            <table className="w-full min-w-max text-sm">
              <thead className="sticky top-0 bg-muted"><tr>{["#", "الحالة", "اسم الجهة", "الإيميل", "الموقع", "النشاط", "المدينة", "Segment"].map((h) => <th key={h} className="p-2 text-right font-medium">{h}</th>)}</tr></thead>
              <tbody>{preview.filter((p) => !filter || (filter === "إيميل غلط" ? p.badEmail : filter === "بدون Segment" ? p.status === "جديد" && !p.segment : p.status === filter)).slice(0, 300).map((p) => (
                <tr key={p.index} className="border-t">
                  <td className="p-2 text-muted-foreground">{p.index + 2}</td>
                  <td className="p-2"><StatusBadge value={p.status} />{p.badEmail && <StatusBadge value="إيميل غلط" className="ms-1" />}</td>
                  <td className="p-2" dir="auto">{p.lead["اسم الجهة"]}</td>
                  <td className="p-2" dir="ltr">{p.lead["الإيميل"]}</td>
                  <td className="max-w-48 truncate p-2" dir="ltr">{p.lead["الموقع"]}</td>
                  <td className="p-2">{p.lead["النشاط"]}</td>
                  <td className="p-2">{p.lead["المدينة"]}</td>
                  <td className="p-2" dir="ltr">{p.segment ?? (p.status === "جديد" ? <span className="text-amber-700">—</span> : "")}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {step === 4 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep(3)} disabled={running}>رجوع</Button>
              <Button type="button" disabled={running || !counts["جديد"] && !counts["مكرر"] && !counts["مافيش إيميل"]} onClick={() => { setStep(5); run(); }}>
                استورد {mapped.rows.filter((r) => r.some((v) => v.trim())).length} صف للشيت
              </Button>
              <span className="text-xs text-muted-foreground">بيتكتبوا في تاب Import على دفعات ≤{CHUNK}، وبعدين المحرك بيعمل import ثم process.</span>
            </div>
          )}
        </div>
      )}

      {step === 5 && (
        <div className="grid gap-3 rounded-xl border p-4">
          {progress && progress.phase !== "done" && (
            <p className="flex items-center gap-2 text-sm">
              <Loader2Icon className="size-4 animate-spin" />
              {progress.phase === "import" ? `دفعة ${progress.chunk} من ${progress.chunks}: ` : "تجهيز الليدز (إيميلات + Segments + monday): "}
              {progress.status === "جاري التنفيذ" ? "المحرك بينفّذ…" : "في انتظار المحرك… (بيلقط الأوامر كل دقيقة)"}
            </p>
          )}
          {progress && progress.waitedMs > 3 * 60e3 && progress.status === "في الانتظار" && (
            <Warn>المحرك شكله واقف — راجع التشغيل التلقائي <Link className="underline" href={`/c/${slug}/settings?tab=advanced`}>من الإعدادات المتقدمة</Link></Warn>
          )}
          {summary && (
            <div className="grid gap-1 text-sm">
              <p>الاستيراد: <strong>{summary.imp.rows}</strong> صف · جديد {summary.imp.added} · مكرر {summary.imp.duplicate} · بدون إيميل {summary.imp.noEmail} · ممنوع {summary.imp.dnc}</p>
              {summary.process && <p>التجهيز: {summary.process}</p>}
            </div>
          )}
          <Notice result={res} />
          {needsClear && !running && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">تاب Import فيه صفوف ماتنفذتش. امسحها عشان تبدأ من جديد؟</span>
              <Button size="sm" variant="destructive" onClick={async () => { const r = await importClear(slug); setRes(r); setNeedsClear(!r.ok); setCleared(r.ok); }}>امسح تاب Import</Button>
            </div>
          )}
          {cleared && !running && !needsClear && <div><Button size="sm" onClick={() => { setCleared(false); run(); }}>ابدأ الاستيراد تاني</Button></div>}
          {!running && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setStep(1); setData(null); setPaste(""); setRes(null); setSummary(null); setProgress(null); }}>استيراد ملف تاني</Button>
              <Button asChild variant="ghost"><Link href={`/c/${slug}/data?tab=leads`}>شوف الليدز</Link></Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
