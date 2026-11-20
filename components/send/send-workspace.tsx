"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClockIcon, ExternalLinkIcon, EyeIcon, Loader2Icon, RotateCwIcon, SendIcon, XIcon } from "lucide-react";
import { cancelCommand } from "@/app/actions/company";
import { queueSend, retryMondayLead, setSendingEnabled, type SendInput } from "@/app/actions/send";
import { Field, Notice, Warn, type Result } from "@/components/app/basics";
import { CommandStatus } from "@/components/app/command";
import { gmailLink, MondayMark, mondayItemLink, StatusBadge } from "@/components/data/badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { fmtInTz, utcToZonedInput, zonedToUtc } from "@/lib/tz";

type Eligible = { id: string; name: string; email: string; segment: string; status: string };
type Upcoming = { id: string; at: string; count: number; segment?: string };
export type SendCtx = {
  slug: string; company: string; tz: string; cap: number; sentToday: number; enabled: boolean; inWindow: boolean;
  segments: string[]; eligible: Eligible[]; upcoming: Upcoming[]; mondayAccount?: string; board: string;
};

function Section({ title, icon, children, desc }: { title: string; icon?: React.ReactNode; desc?: string; children: React.ReactNode }) {
  return (
    <section className="grid min-w-0 content-start gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div><h2 className="flex items-center gap-2 font-semibold">{icon}{title}</h2>{desc && <p className="text-sm text-muted-foreground">{desc}</p>}</div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ manual

function Manual({ ctx, onQueued }: { ctx: SendCtx; onQueued: (id: string) => void }) {
  const remaining = Math.max(0, ctx.cap - ctx.sentToday);
  const [count, setCount] = useState(String(remaining || 1));
  const [target, setTarget] = useState<"all" | "segment" | "leads">("all");
  const [segment, setSegment] = useState(ctx.segments[0] ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [ignoreEnabled, setIgnoreEnabled] = useState(false);
  const [ignoreWindow, setIgnoreWindow] = useState(false);
  const [previewedKey, setPreviewedKey] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null), [busy, setBusy] = useState<"dry" | "send" | null>(null);

  const input = (): SendInput => ({
    count: Number(count),
    segment: target === "segment" ? segment : undefined,
    leadIds: target === "leads" ? [...picked] : undefined,
  });
  const key = JSON.stringify(input());
  const run = async (dry: boolean) => {
    setBusy(dry ? "dry" : "send"); setRes(null);
    const r = await queueSend(ctx.slug, { ...input(), dryRun: dry, ignoreEnabled: !dry && ignoreEnabled, ignoreWindow: !dry && ignoreWindow });
    setBusy(null); setRes(r);
    if (r.ok) { onQueued(r.data!.id); if (dry) setPreviewedKey(key); }
  };
  const shown = ctx.eligible.filter((l) => !q || [l.id, l.name, l.email, l.segment].some((x) => x.toLowerCase().includes(q.toLowerCase())));
  const invalid = !Number(count) || Number(count) < 1 || Number(count) > ctx.cap || (target === "leads" && !picked.size);

  return (
    <Section title="إرسال يدوي" icon={<SendIcon className="size-4" />} desc="ابدأ بمعاينة (Dry run): المحرك بيحسب مين هيتبعتله وأنهي قالب من غير ما يبعت.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="العدد" help={`المتبقي من الحد النهارده: ${remaining} من ${ctx.cap}`} htmlFor="m-count">
          <Input id="m-count" type="number" dir="ltr" min={1} max={ctx.cap} value={count} onChange={(e) => setCount(e.target.value)} className="w-28" />
        </Field>
        <Field label="لمين">
          <div className="flex flex-wrap gap-1.5">
            {([["all", "حسب نصيب الـ Segments"], ["segment", "Segment واحد"], ["leads", "عملاء مختارين"]] as const).map(([v, l]) => (
              <Button key={v} type="button" size="sm" variant={target === v ? "default" : "outline"} onClick={() => setTarget(v)}>{l}</Button>
            ))}
          </div>
        </Field>
      </div>
      {target === "segment" && (
        <select aria-label="Segment" value={segment} onChange={(e) => setSegment(e.target.value)} className="h-9 w-48 rounded-md border bg-background px-2 text-sm">
          {ctx.segments.map((s) => <option key={s}>{s}</option>)}
        </select>
      )}
      {target === "leads" && (
        <div className="grid gap-2">
          <Input placeholder="بحث" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" aria-label="بحث في العملاء" />
          <div className="max-h-56 overflow-auto rounded-lg border">
            {shown.map((l) => (
              <label key={l.id} className="flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-sm last:border-0 hover:bg-muted/50">
                <input type="checkbox" checked={picked.has(l.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })} />
                <span className="font-mono text-xs" dir="ltr">{l.id}</span> <span className="truncate">{l.name}</span>
                <span className="ms-auto text-xs text-muted-foreground" dir="ltr">{l.segment}</span> <StatusBadge value={l.status} />
              </label>
            ))}
            {!shown.length && <p className="p-4 text-center text-sm text-muted-foreground">مافيش عملاء جاهزين أو متابعات مستحقة</p>}
          </div>
          <p className="text-xs text-muted-foreground">مختار {picked.size} — العملاء «جاهز» (ليهم Segment) والمتابعات المستحقة النهارده.</p>
        </div>
      )}
      {!ctx.enabled && <Warn>«الإرسال شغال» = لا — الإرسال اليدوي محتاج تأكيد «ابعت برضه».</Warn>}
      {!ctx.inWindow && <p className="text-xs text-muted-foreground">إحنا برّه وقت الإرسال دلوقتي — في الإرسال اليدوي تقدر تتجاهل الوقت.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={invalid || !!busy} onClick={() => run(true)}>{busy === "dry" ? <Loader2Icon className="animate-spin" /> : <EyeIcon />} معاينة (Dry run)</Button>
        <Button type="button" variant="outline" disabled={invalid || !!busy} onClick={() => { setIgnoreEnabled(false); setIgnoreWindow(false); setOpen(true); }}>
          {busy === "send" ? <Loader2Icon className="animate-spin" /> : <SendIcon />} إرسال…
        </Button>
        <Notice result={res} />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الإرسال</DialogTitle>
            <DialogDescription>
              هيتبعت لحد <strong>{count}</strong> إيميل من <strong>{ctx.company}</strong>
              {target === "segment" ? ` — Segment ${segment}` : target === "leads" ? ` — ${picked.size} عميل مختار` : " — حسب نصيب الـ Segments"}.
            </DialogDescription>
          </DialogHeader>
          {previewedKey !== key && <Warn>ماعملتش معاينة للاختيار ده — يُفضّل تعمل Dry run الأول.</Warn>}
          {!ctx.enabled && (
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={ignoreEnabled} onChange={(e) => setIgnoreEnabled(e.target.checked)} />
              <span>«الإرسال شغال» = لا. <strong>ابعت برضه</strong> المرة دي بس.</span></label>
          )}
          {!ctx.inWindow && (
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={ignoreWindow} onChange={(e) => setIgnoreWindow(e.target.checked)} />
              <span>إحنا برّه وقت الإرسال. <strong>ابعت دلوقتي</strong> (من غير كده المحرك هيرجع «برّه وقت الإرسال»).</span></label>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">إلغاء</Button></DialogClose>
            <Button disabled={!ctx.enabled && !ignoreEnabled} onClick={() => { setOpen(false); run(false); }}><SendIcon /> ابعت {count}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

// ------------------------------------------------------------------ scheduled

function Scheduled({ ctx, onQueued }: { ctx: SendCtx; onQueued: (id: string) => void }) {
  const router = useRouter();
  const [when, setWhen] = useState(() => utcToZonedInput(new Date(Date.now() + 24 * 3600e3), ctx.tz).slice(0, 11) + "09:30");
  const [count, setCount] = useState(String(Math.min(ctx.cap, 10)));
  const [segment, setSegment] = useState("");
  const [ignoreWindow, setIgnoreWindow] = useState(false);
  const [ignoreEnabled, setIgnoreEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<Result | null>(null), [busy, setBusy] = useState<string | null>(null);
  const utc = (() => { try { return zonedToUtc(when, ctx.tz); } catch { return null; } })();
  return (
    <Section title="إرسال مجدول" icon={<CalendarClockIcon className="size-4" />} desc={`الميعاد بتوقيت الشركة (${ctx.tz}) وبيتحفظ UTC. المحرك بينفّذه أول دقيقة بعد الميعاد.`}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="الميعاد" htmlFor="s-when"><Input id="s-when" type="datetime-local" dir="ltr" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        <Field label="العدد" htmlFor="s-count"><Input id="s-count" type="number" dir="ltr" min={1} max={ctx.cap} value={count} onChange={(e) => setCount(e.target.value)} /></Field>
        <Field label="Segment (اختياري)" htmlFor="s-seg">
          <select id="s-seg" value={segment} onChange={(e) => setSegment(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">حسب النصيب</option>{ctx.segments.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ignoreWindow} onChange={(e) => setIgnoreWindow(e.target.checked)} /> تجاهل وقت الإرسال في الميعاد ده</label>
      {utc && <p className="text-xs text-muted-foreground" dir="ltr">UTC: {utc.toISOString().slice(0, 16).replace("T", " ")}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={!utc || !Number(count) || !!busy} onClick={() => setOpen(true)}><CalendarClockIcon /> جدول</Button>
        <Notice result={res} />
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد الجدولة</DialogTitle>
            <DialogDescription>هيتبعت لحد <strong>{count}</strong> إيميل من <strong>{ctx.company}</strong> يوم {utc ? fmtInTz(utc.toISOString(), ctx.tz) : ""}{segment ? ` — ${segment}` : ""}.</DialogDescription>
          </DialogHeader>
          {!ctx.enabled && (
            <>
              <Warn>«الإرسال شغال» = لا دلوقتي — لو فضل كده وقت الميعاد، الأمر هيفشل. شغّله قبل الميعاد، أو:</Warn>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={ignoreEnabled} onChange={(e) => setIgnoreEnabled(e.target.checked)} />
                <span><strong>ابعت في الميعاد ده</strong> حتى لو الإرسال التلقائي متوقف.</span></label>
            </>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">إلغاء</Button></DialogClose>
            <Button onClick={async () => {
              setOpen(false); setBusy("q");
              const r = await queueSend(ctx.slug, { count: Number(count), segment: segment || undefined, ignoreWindow, ignoreEnabled, at: utc!.toISOString() });
              setBusy(null); setRes(r); if (r.ok) { onQueued(r.data!.id); router.refresh(); }
            }}>جدول</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="grid gap-2">
        <h3 className="text-sm font-medium">الجاي</h3>
        {ctx.upcoming.length === 0 ? <p className="text-sm text-muted-foreground">مافيش إرسال مجدول</p> : (
          <ul className="divide-y rounded-lg border">
            {ctx.upcoming.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-2 p-2.5 text-sm">
                <span>{fmtInTz(u.at, ctx.tz)}</span> · <span>{u.count} إيميل</span>{u.segment && <span dir="ltr">· {u.segment}</span>}
                <span className="font-mono text-xs text-muted-foreground" dir="ltr">{u.id}</span>
                <Button size="xs" variant="ghost" className="ms-auto" disabled={!!busy} onClick={async () => {
                  setBusy(u.id); const r = await cancelCommand(ctx.slug, u.id); setBusy(null); setRes(r); router.refresh();
                }}>{busy === u.id ? <Loader2Icon className="animate-spin" /> : <XIcon />} إلغاء</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ automatic

function Automatic({ ctx }: { ctx: SendCtx }) {
  const router = useRouter();
  const [on, setOn] = useState(ctx.enabled);
  const [res, setRes] = useState<Result | null>(null), [busy, setBusy] = useState(false);
  return (
    <Section title="إرسال تلقائي" desc="المحرك بيبعت كل 5 دقايق في أيام وساعات الإرسال، لحد الحد اليومي — المتابعات المستحقة الأول.">
      <label className="flex items-center gap-3">
        <Switch checked={on} disabled={busy} aria-label="الإرسال شغال" onCheckedChange={async (v) => {
          setOn(v); setBusy(true); const r = await setSendingEnabled(ctx.slug, v); setBusy(false); setRes(r);
          if (!r.ok) setOn(!v); else router.refresh();
        }} />
        <span className="font-medium">الإرسال شغال: {on ? "نعم" : "لا"}</span> {busy && <Loader2Icon className="size-4 animate-spin" />}
      </label>
      <p className="text-sm text-muted-foreground">{ctx.inWindow ? "جوه وقت الإرسال دلوقتي ✓" : "برّه وقت الإرسال دلوقتي"} · اتبعت النهارده {ctx.sentToday} من {ctx.cap}</p>
      <Link href={`/c/${ctx.slug}/settings?tab=schedule`} className="text-sm underline">مواعيد الإرسال والحد اليومي ←</Link>
      <Notice result={res} />
    </Section>
  );
}

// ------------------------------------------------------------------ results

type Cmd = { id: string; type: string; status: string; createdAt: string; executedAt: string; result: Record<string, unknown> | null; resultRaw: string; dryRun: boolean; count: number; at: string };
type Row = { commandId: string; time: string; leadId: string; email: string; step: string; template: string; sent: string; error: string; threadId: string; monday: string; mondayError: string };
type Payload = { commands: Cmd[]; id: string; rows: Row[]; items: Record<string, { item: string; monday: string; name: string }> };
const FINAL = ["تم", "فشل", "ملغي"];

function RetryButton({ slug, leadId, onDone }: { slug: string; leadId: string; onDone: () => void }) {
  const [id, setId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Result | null>(null);
  if (id) return <div className="min-w-40"><CommandStatus slug={slug} id={id} onDone={onDone} /></div>;
  return (
    <>
      <Button size="xs" variant="outline" disabled={busy} onClick={async () => { setBusy(true); const r = await retryMondayLead(slug, leadId); setBusy(false); if (r.ok) setId(r.data!.id); else setErr(r); }}>
        {busy ? <Loader2Icon className="animate-spin" /> : <RotateCwIcon />} Retry
      </Button>
      <Notice result={err} />
    </>
  );
}

function Results({ ctx, selected, setSelected }: { ctx: SendCtx; selected: string | null; setSelected: (id: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(0); // time of the last poll (render stays pure)
  const tick = useRef(0);
  const load = useCallback(async (fresh = false) => {
    try {
      const r = await fetch(`/api/c/${ctx.slug}/results?${new URLSearchParams({ ...(selected ? { commandId: selected } : {}), ...(fresh ? { fresh: "1" } : {}) })}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j); setErr(null); setNow(Date.now());
      return j as Payload;
    } catch (e) { setErr((e as Error).message); return null; }
  }, [ctx.slug, selected]);

  useEffect(() => {
    let stop = false, t: ReturnType<typeof setTimeout>;
    const loop = async () => {
      const j = await load(tick.current++ === 0);
      const active = j?.commands.some((c) => !FINAL.includes(c.status) && (!c.at || Date.parse(c.at) <= Date.now() + 60e3));
      if (!stop) t = setTimeout(loop, active ? 5000 : 20000); // poll every 5 s while something runs
    };
    loop();
    return () => { stop = true; clearTimeout(t); };
  }, [load]);

  const cmd = data?.commands.find((c) => c.id === data.id);
  const sends = (data?.commands ?? []).filter((c) => c.type === "send");
  return (
    <Section title="النتائج" desc="صف لكل عميل من تاب Send Results — بيتحدّث كل 5 ثواني والمحرك شغال.">
      {err && <Notice result={{ ok: false, error: "مقدرناش نقرا النتائج", detail: err }} />}
      <div className="flex flex-wrap gap-1.5">
        {sends.map((c) => (
          <button key={c.id} type="button" onClick={() => setSelected(c.id)}
            className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs", data?.id === c.id && "border-primary ring-2 ring-primary/20")}>
            <StatusBadge value={c.status} /> {c.dryRun ? "معاينة" : "إرسال"} · {c.count}
            <span className="text-muted-foreground">{c.at ? fmtInTz(c.at, ctx.tz) : fmtInTz(c.createdAt, ctx.tz)}</span>
          </button>
        ))}
        {!sends.length && <p className="text-sm text-muted-foreground">لسه مافيش إرسال</p>}
      </div>
      {cmd && (
        <div className="grid gap-1 text-sm">
          {!FINAL.includes(cmd.status) ? (
            <p className="flex items-center gap-2 text-muted-foreground"><Loader2Icon className="size-4 animate-spin" />
              {cmd.status === "جاري التنفيذ" ? "المحرك بينفّذ…" : cmd.at && Date.parse(cmd.at) > now ? `مجدول: ${fmtInTz(cmd.at, ctx.tz)}` : "في انتظار المحرك… (بيلقط الأوامر كل دقيقة)"}</p>
          ) : cmd.status === "فشل" ? (
            <Notice result={{ ok: false, error: "فشل: " + String(cmd.result?.error ?? ""), detail: cmd.resultRaw }} />
          ) : <p><strong>{String(cmd.result?.summary ?? cmd.status)}</strong></p>}
          {cmd.status === "في الانتظار" && now - Date.parse(cmd.at || cmd.createdAt) > 3 * 60e3 && (
            <Warn>المحرك شكله واقف — راجع التشغيل التلقائي <Link className="underline" href={`/c/${ctx.slug}/settings?tab=advanced`}>من الإعدادات المتقدمة</Link></Warn>
          )}
        </div>
      )}
      {!!data?.rows.length && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-muted/50"><tr>{["العميل", "الإيميل", "الخطوة", "القالب", "اتبعت", "الخطأ", "Gmail", "monday", ""].map((h, i) => <th key={i} className="p-2 text-right font-medium">{h}</th>)}</tr></thead>
            <tbody>{data.rows.map((r, i) => {
              const it = data.items[r.leadId];
              const link = mondayItemLink(ctx.mondayAccount, ctx.board, it?.item ?? "");
              const mFailed = r.monday === "فشل" && !(it?.monday === "تم");
              return (
                <tr key={i} className="border-t align-top">
                  <td className="p-2"><span className="font-mono text-xs" dir="ltr">{r.leadId}</span> <span className="text-xs text-muted-foreground">{it?.name}</span></td>
                  <td className="p-2" dir="ltr">{r.email}</td>
                  <td className="p-2">{r.step}</td>
                  <td className="p-2" dir="ltr">{r.template}</td>
                  <td className="p-2">{r.sent === "نعم" ? <span className="font-bold text-emerald-600">✓</span> : r.sent === "معاينة" ? <StatusBadge value="معاينة" /> : <span className="font-bold text-destructive">✗</span>}</td>
                  <td className="max-w-64 p-2 text-xs text-destructive">{r.error}</td>
                  <td className="p-2">{r.threadId && r.sent !== "معاينة" ? <a href={gmailLink(r.threadId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline">Gmail <ExternalLinkIcon className="size-3" /></a> : "—"}</td>
                  <td className="p-2 text-xs">
                    {r.monday ? <MondayMark value={mFailed ? "فشل: " + r.mondayError : it?.monday === "تم" || r.monday === "تم" ? "تم" : r.monday} /> : "—"}
                    {r.monday === "فشل" && it?.monday === "تم" && <span className="ms-1 text-emerald-700">(اتصلّح)</span>}
                    {mFailed && <p className="mt-0.5 max-w-48 text-destructive">{r.mondayError}</p>}
                    {link && <a href={link} target="_blank" rel="noreferrer" className="ms-1 inline-flex items-center gap-0.5 underline">item <ExternalLinkIcon className="size-3" /></a>}
                  </td>
                  <td className="p-2">{mFailed && <RetryButton slug={ctx.slug} leadId={r.leadId} onDone={() => load(true)} />}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      {cmd && FINAL.includes(cmd.status) && !data?.rows.length && <p className="text-sm text-muted-foreground">مافيش صفوف للأمر ده في Send Results.</p>}
    </Section>
  );
}

export function SendWorkspace({ ctx }: { ctx: SendCtx }) {
  const [selected, setSelected] = useState<string | null>(null);
  const onQueued = useMemo(() => (id: string) => setSelected(id), []);
  return (
    <div className="grid gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Manual ctx={ctx} onQueued={onQueued} />
        <div className="grid content-start gap-5">
          <Automatic ctx={ctx} />
          <Scheduled ctx={ctx} onQueued={onQueued} />
        </div>
      </div>
      <Results ctx={ctx} selected={selected} setSelected={setSelected} />
    </div>
  );
}
