"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLinkIcon, Loader2Icon } from "lucide-react";
import { ar } from "@/content/ar";
import { checkDeliverability, saveRegistry } from "@/app/actions/company";
import { Field, KV, Mark, Notice, Warn, type Result } from "@/components/app/basics";
import { CommandButton } from "@/components/app/command";
import { CompanyKeysForm, toStr, type FieldSpec, type Vals } from "@/components/app/company-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inSendWindow_, signature_ } from "@/lib/engine-port";
import type { SystemInfo } from "@/lib/sheets/schema";

const T = ar.companySettings;
const yes = (v: unknown) => String(v ?? "") === "نعم";

export function Section({ title, desc, children, action }: { title: string; desc?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="grid min-w-0 gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="font-semibold">{title}</h2>{desc && <p className="text-sm text-muted-foreground">{desc}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ Profile


export function RegistryForm({ slug, color, firstSendDate }: { slug: string; color: string; firstSendDate?: string }) {
  const router = useRouter();
  const [c, setC] = useState(color), [d, setD] = useState(firstSendDate || "");
  const [res, setRes] = useState<Result | null>(null), [busy, setBusy] = useState(false);
  return (
    <form className="grid gap-4" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      const r = await saveRegistry(slug, { color: c, firstSendDate: d || undefined });
      setBusy(false); setRes(r); if (r.ok) router.refresh();
    }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={T.profile.color} htmlFor="r-color">
          <div className="flex items-center gap-2">
            <input id="r-color" type="color" value={c} onChange={(e) => setC(e.target.value)} className="h-8 w-12 cursor-pointer rounded border bg-transparent" />
            <code dir="ltr" className="text-xs">{c}</code>
          </div>
        </Field>
        <Field label={T.profile.firstSend} help={T.profile.firstSendHelp} htmlFor="r-first">
          <Input id="r-first" type="date" dir="ltr" value={d} onChange={(e) => setD(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={busy}>{busy && <Loader2Icon className="animate-spin" />} {ar.common.save}</Button>
        <Notice result={res} />
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ Sender

const SENDER_FIELDS: FieldSpec[] = [
  { key: "إيميل الإرسال", type: "email", help: "لازم يكون متضاف في Gmail كـ Send mail as" },
  { key: "اسم المرسل", help: "{اسم_المرسل}" },
  { key: "المنصب" },
  { key: "Reply-To", type: "email", help: "اختياري: الردود تروح على الإيميل ده بدل إيميل الإرسال" },
];

function SignaturePreview({ c }: { c: Record<string, unknown> }) {
  const [lang, setLang] = useState<"AR" | "EN">("AR");
  return (
    <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{T.sender.signature} <span className="text-xs font-normal text-muted-foreground">— {T.sender.signatureHelp}</span></span>
        <div className="flex gap-1">
          {(["AR", "EN"] as const).map((l) => (
            <Button key={l} type="button" size="xs" variant={lang === l ? "default" : "outline"} onClick={() => setLang(l)}>{l === "AR" ? T.sender.sigAr : T.sender.sigEn}</Button>
          ))}
        </div>
      </div>
      <pre dir={lang === "EN" ? "ltr" : "rtl"} className="font-sans text-sm whitespace-pre-wrap" style={{ textAlign: lang === "EN" ? "left" : "right" }}>{signature_(c, lang) || "—"}</pre>
    </div>
  );
}

type SenderCheck = { account?: string; sender?: string; aliases?: string[]; verified?: boolean; quota?: number | null };

function GmailStatus({ slug, sys }: { slug: string; sys: SystemInfo | null }) {
  const router = useRouter();
  const [fresh, setFresh] = useState<SenderCheck | null>(null);
  const v = fresh ?? {
    account: toStr(sys?.gmailAccount), sender: toStr(sys?.sender), verified: sys ? yes(sys.senderVerified) : undefined,
    aliases: toStr(sys?.aliases).split(",").map((s) => s.trim()).filter(Boolean), quota: sys?.gmailQuota === "" || sys?.gmailQuota === undefined ? null : Number(sys.gmailQuota),
  };
  const S = T.sender;
  return (
    <div className="grid gap-4">
      <KV rows={[
        [S.account, <span key="a" dir="ltr">{v.account || "—"}</span>],
        ["الإيميل المرسل", <span key="s" dir="ltr">{v.sender || "—"}</span>],
        [S.verified, <Mark key="v" level={v.verified ?? null} />],
        [S.aliases, <span key="al" dir="ltr" className="text-xs">{v.aliases?.length ? v.aliases.join(", ") : "—"}</span>],
        [S.quota, v.quota ?? "—"],
      ]} />
      <CommandButton slug={slug} type="checkSender" label={S.checkNow}
        onDone={(c) => { if (c.status === "تم" && c.result) { setFresh(c.result as SenderCheck); router.refresh(); } }} />
      {v.verified === false && (
        <div className="grid gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <h3 className="text-sm font-semibold">{S.howTitle}</h3>
          <ol className="list-decimal space-y-1 ps-5 text-sm">{S.how.map((s) => <li key={s}>{s}</li>)}</ol>
          <a className="inline-flex items-center gap-1 text-sm underline" href="https://mail.google.com/mail/u/0/#settings/accounts" target="_blank" rel="noreferrer">
            Gmail ← Settings ← Accounts <ExternalLinkIcon className="size-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}

type DnsItem = { key: "spf" | "dkim" | "dmarc" | "mx"; level: "ok" | "warn" | "fail"; value: string; fix: string };

function Deliverability({ email }: { email: string }) {
  const domain = email.includes("@") ? email.split("@")[1] : "";
  const [selector, setSelector] = useState("");
  const [items, setItems] = useState<DnsItem[] | null>(null);
  const [res, setRes] = useState<Result | null>(null), [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="الدومين"><code dir="ltr" className="rounded bg-muted px-2 py-1.5 text-sm">{domain || "—"}</code></Field>
        <Field label={T.sender.dkimSelector} htmlFor="dkim-sel"><Input id="dkim-sel" dir="ltr" value={selector} onChange={(e) => setSelector(e.target.value)} placeholder="s1" className="w-32" /></Field>
        <Button type="button" variant="outline" disabled={!domain || busy} onClick={async () => {
          setBusy(true); setRes(null);
          const r = await checkDeliverability(domain, selector || undefined);
          setBusy(false);
          if (r.ok) setItems(r.data as DnsItem[]); else setRes(r);
        }}>{busy && <Loader2Icon className="animate-spin" />} {T.sender.dnsRun}</Button>
      </div>
      <Notice result={res} />
      {items && (
        <ul className="divide-y rounded-lg border">
          {items.map((i) => (
            <li key={i.key} className="grid gap-0.5 p-3 text-sm">
              <div className="flex items-center gap-2"><Mark level={i.level} /> <span className="font-medium">{T.sender.dnsKeys[i.key]}</span></div>
              <code dir="ltr" className="text-xs break-all text-muted-foreground">{i.value}</code>
              {i.fix && <p className="text-xs">{i.fix}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function warmupFor(firstSendDate: string | undefined, now = new Date()) {
  if (!firstSendDate) return null;
  const days = Math.floor((now.getTime() - Date.parse(firstSendDate + "T00:00:00Z")) / 864e5);
  if (days < 0) return { week: 0, rec: 15, label: "15" };
  const week = Math.floor(days / 7) + 1;
  const rec = week === 1 ? 15 : week === 2 ? 25 : week === 3 ? 30 : week === 4 ? 40 : 50;
  return { week, rec, label: week <= 2 ? String(rec) : `30–50 (${rec})` };
}

function Warmup({ firstSendDate, cap }: { firstSendDate?: string; cap: number }) {
  const w = warmupFor(firstSendDate);
  if (!w) return <p className="text-sm text-muted-foreground">{T.sender.warmupNoDate}</p>;
  return (
    <div className="grid gap-2 text-sm">
      <p>{T.sender.warmupWeek(Math.max(w.week, 1))} · <strong>{T.sender.warmupRec(w.label)}</strong></p>
      {cap > w.rec ? <Warn>{T.sender.warmupHigh(cap, w.rec)}</Warn> : <p className="text-emerald-700 dark:text-emerald-400">{T.sender.warmupOk}</p>}
    </div>
  );
}

function TestEmail({ slug, me, templates, leads }: { slug: string; me: string; templates: { code: string; versions: string[] }[]; leads: { id: string; name: string }[] }) {
  const [to, setTo] = useState(me);
  const [tpl, setTpl] = useState(""), [ver, setVer] = useState("A"), [lead, setLead] = useState("");
  const versions = templates.find((t) => t.code === tpl)?.versions ?? [];
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={T.sender.testTo} htmlFor="t-to"><Input id="t-to" type="email" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="قالب (اختياري)" help="من غير قالب بيتبعت إيميل تجريبي بسيط">
          <div className="flex flex-wrap gap-2">
            <Select value={tpl || "_"} onValueChange={(v) => { setTpl(v === "_" ? "" : v); setVer("A"); }}>
              <SelectTrigger className="min-w-32" aria-label="القالب"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">بدون قالب</SelectItem>
                {templates.map((t) => <SelectItem key={t.code} value={t.code}>{t.code}</SelectItem>)}
              </SelectContent>
            </Select>
            {tpl && versions.length > 1 && (
              <Select value={ver} onValueChange={setVer}>
                <SelectTrigger aria-label="النسخة"><SelectValue /></SelectTrigger>
                <SelectContent>{versions.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {tpl && (
              <Select value={lead} onValueChange={setLead}>
                <SelectTrigger className="min-w-40" aria-label="العميل"><SelectValue placeholder="على بيانات عميل" /></SelectTrigger>
                <SelectContent>{leads.map((l) => <SelectItem key={l.id} value={l.id}>{l.id} — {l.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
        </Field>
      </div>
      <CommandButton slug={slug} type="sendTest" label={T.sender.testSend}
        validate={() => (tpl && !lead ? "اختار عميل عشان القالب يتملي ببياناته" : null)}
        payload={() => ({ to, ...(tpl ? { template: tpl, version: ver, leadId: lead } : {}) })}
        render={(c) => {
          const tid = String(c.result?.threadId || "");
          return tid ? (
            <a className="inline-flex items-center gap-1 text-sm underline" target="_blank" rel="noreferrer" href={`https://mail.google.com/mail/u/0/#all/${tid}`}>
              {T.sender.openGmail} <ExternalLinkIcon className="size-3.5" />
            </a>
          ) : null;
        }} />
    </div>
  );
}

export function SenderTab({ slug, initial, company, sys, firstSendDate, me, templates, leads }: {
  slug: string; initial: Vals; company: Record<string, unknown>; sys: SystemInfo | null; firstSendDate?: string; me: string;
  templates: { code: string; versions: string[] }[]; leads: { id: string; name: string }[];
}) {
  const [live, setLive] = useState(initial);
  const merged = useMemo(() => ({ ...company, ...live }), [company, live]);
  const cap = Number(company["الحد اليومي للإيميلات"]) || 15;
  return (
    <div className="grid gap-5">
      <Section title={T.sender.title} desc={T.sender.desc}>
        <CompanyKeysForm slug={slug} fields={SENDER_FIELDS} initial={initial} onValuesChange={setLive} extra={(v) => <SignaturePreview c={{ ...company, ...v }} />} />
      </Section>
      <Section title={T.sender.gmail}><GmailStatus slug={slug} sys={sys} /></Section>
      <Section title={T.sender.dns} desc={T.sender.dnsDesc}><Deliverability email={toStr(merged["إيميل الإرسال"])} /></Section>
      <Section title={T.sender.warmup}><Warmup firstSendDate={firstSendDate} cap={cap} /></Section>
      <Section title={T.sender.test} desc={T.sender.testDesc}><TestEmail slug={slug} me={me} templates={templates} leads={leads} /></Section>
    </div>
  );
}

// ------------------------------------------------------------------ Schedule

const SCHEDULE_FIELDS: FieldSpec[] = [
  { key: "الإرسال شغال", type: "toggle", help: T.schedule.enabledHelp },
  { key: "أيام الإرسال", type: "days" },
  { key: "ساعة بداية الإرسال", type: "number", min: 0, max: 23, help: "بتوقيت المنطقة الزمنية" },
  { key: "ساعة نهاية الإرسال", type: "number", min: 1, max: 24 },
  { key: "الحد اليومي للإيميلات", type: "number", min: 1, help: "ابدأ بـ 15 وزوّد تدريجياً لحد 50" },
  { key: "عدد الإيميلات في كل تشغيل", type: "number", min: 1, help: "السكريبت بيشتغل كل 5 دقايق في وقت الإرسال" },
  { key: "الفاصل بين الإيميلات (ثواني)", type: "number", min: 0, help: "المحرك بيقصّه لـ 60 ثانية كحد أقصى" },
  { key: "أقصى نسبة Bounce", type: "number", step: "0.01", min: 0, max: 1, help: T.schedule.bounceHelp },
  { key: "أيام انتظار بعد آخر خطوة", type: "number", min: 0, help: "بعدها الحالة تبقى (مافيش رد)" },
];

export function ScheduleTab({ slug, initial, company, sys, firstSendDate }: { slug: string; initial: Vals; company: Record<string, unknown>; sys: SystemInfo | null; firstSendDate?: string }) {
  return (
    <Section title={T.schedule.title} desc={T.schedule.desc}>
      <CompanyKeysForm slug={slug} fields={SCHEDULE_FIELDS} initial={initial} extra={(v) => {
        const merged = { ...company, ...v };
        const inWin = inSendWindow_(merged);
        const cap = Number(v["الحد اليومي للإيميلات"]) || 0;
        const w = warmupFor(firstSendDate);
        return (
          <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <p><span className="text-muted-foreground">{T.schedule.now}: </span><Mark level={inWin ? "ok" : null} /> {inWin ? T.schedule.inWindow : T.schedule.outWindow}
              <span className="text-xs text-muted-foreground"> ({toStr(merged["المنطقة الزمنية"]) || "Asia/Riyadh"})</span></p>
            <p><span className="text-muted-foreground">{T.schedule.sentToday}: </span><strong>{toStr(sys?.sentToday) || 0}</strong> {T.schedule.of} {cap}</p>
            {w && cap > w.rec && <Warn>{T.sender.warmupHigh(cap, w.rec)}</Warn>}
          </div>
        );
      }} />
    </Section>
  );
}
