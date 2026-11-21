"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, UploadIcon } from "lucide-react";
import { ar } from "@/content/ar";
import {
  disconnectGoogle, saveDefaults, saveNotificationEmails, saveServiceAccount, setGoogleMode, testGoogle, writeAlertEmailToSheet,
} from "@/app/actions/app-settings";
import { CopyButton, Field, KV, Notice, Warn, type Result } from "@/components/app/basics";
import { KeyInput, TIMEZONES } from "@/components/app/company-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Defaults, GoogleMode } from "@/lib/store/model";
import type { SecretInfo } from "@/lib/crypto/secrets";

const T = ar.appSettings;
type Co = { slug: string; name: string };

function useRun() {
  const router = useRouter();
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<Result>, refresh = true) => {
    setBusy(key); setRes(null);
    const r = await fn();
    setBusy(null); setRes(r);
    if (r.ok && refresh) router.refresh();
    return r;
  };
  return { res, busy, run, setRes };
}

const Spin = ({ on }: { on: boolean }) => (on ? <Loader2Icon className="animate-spin" /> : null);

// ------------------------------------------------------------------ Google

export function GoogleSection({ isOwner, mock, mode, oauthEmail, saEmail, connectedAt, refreshToken, saInfo, companies, clientConfigured, flash }: {
  isOwner: boolean; mock: boolean; mode: GoogleMode | null; oauthEmail?: string; saEmail?: string; connectedAt?: string;
  refreshToken: SecretInfo; saInfo: SecretInfo; companies: Co[]; clientConfigured: boolean; flash?: Result | null;
}) {
  const { res, busy, run } = useRun();
  const [json, setJson] = useState("");
  const [testSlug, setTestSlug] = useState(companies[0]?.slug ?? "");
  const test = useRun();
  const G = T.google;
  const connected = mode === "oauth" ? refreshToken.set : mode === "serviceAccount" ? saInfo.set : false;

  return (
    <div className="grid gap-6">
      {mock && <Warn>{G.mockNote}</Warn>}
      {!isOwner && <Warn>{T.denied}</Warn>}
      <Notice result={flash} />
      <fieldset disabled={!isOwner} className="grid gap-3 sm:grid-cols-2">
        {(["oauth", "serviceAccount"] as const).map((m) => (
          <label key={m} className={`grid cursor-pointer gap-1 rounded-xl border p-4 transition ${mode === m ? "border-primary ring-2 ring-primary/20" : "hover:bg-muted/50"}`}>
            <span className="flex items-center gap-2 font-medium">
              <input type="radio" name="mode" checked={mode === m} onChange={() => run("mode", () => setGoogleMode(m))} className="accent-primary" />
              {m === "oauth" ? G.modeOauth : G.modeSa}
            </span>
            <span className="text-sm text-muted-foreground">{m === "oauth" ? G.modeOauthDesc : G.modeSaDesc}</span>
          </label>
        ))}
      </fieldset>

      {mode === "oauth" && (
        <div className="grid gap-3 rounded-xl border p-4">
          <KV rows={[[G.connectedAs, connected ? <span dir="ltr">{oauthEmail || "✓"}</span> : <span className="text-muted-foreground">{G.notConnected}</span>],
            ...(connected ? [[ar.common.updated, new Date(refreshToken.updatedAt || connectedAt || "").toLocaleString("ar-EG")] as [string, string]] : [])]} />
          {!clientConfigured && !mock && <Warn>{G.missingClient}</Warn>}
          {isOwner && (
            <div className="flex flex-wrap gap-2">
              <Button asChild disabled={!clientConfigured}><a href="/api/google/connect">{connected ? G.reconnect : G.connect}</a></Button>
              {connected && <Button variant="destructive" onClick={() => run("disc", disconnectGoogle)} disabled={!!busy}><Spin on={busy === "disc"} /> {G.disconnect}</Button>}
            </div>
          )}
        </div>
      )}

      {mode === "serviceAccount" && (
        <div className="grid gap-3 rounded-xl border p-4">
          {saInfo.set && saEmail && (
            <div className="grid gap-2">
              <Field label={G.saEmail}>
                <div className="flex flex-wrap items-center gap-2">
                  <code dir="ltr" className="rounded bg-muted px-2 py-1 text-sm break-all">{saEmail}</code>
                  <CopyButton value={saEmail} />
                </div>
              </Field>
              <Warn>{G.shareReminder}</Warn>
            </div>
          )}
          {isOwner && (
            <div className="grid gap-2">
              <Field label={G.uploadSa}>
                <Input type="file" accept="application/json,.json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setJson(await f.text()); }} />
              </Field>
              <Field label={G.pasteSa}>
                <Textarea dir="ltr" rows={4} value={json} onChange={(e) => setJson(e.target.value)} placeholder='{ "type": "service_account", "client_email": "…", "private_key": "…" }' className="font-mono text-xs" />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => run("sa", () => saveServiceAccount(json)).then((r) => r.ok && setJson(""))} disabled={!json.trim() || !!busy}>
                  <Spin on={busy === "sa"} /> <UploadIcon /> {G.saveSa}
                </Button>
                {saInfo.set && <Button variant="destructive" onClick={() => run("disc", disconnectGoogle)} disabled={!!busy}><Spin on={busy === "disc"} /> {G.disconnect}</Button>}
              </div>
            </div>
          )}
        </div>
      )}
      <Notice result={res} />

      <div className="grid gap-3 rounded-xl border p-4">
        <div>
          <h3 className="font-medium">{G.testTitle}</h3>
          <p className="text-sm text-muted-foreground">{G.testDesc}</p>
        </div>
        {companies.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={testSlug} onValueChange={setTestSlug}>
              <SelectTrigger className="min-w-48" aria-label={G.testPick}><SelectValue placeholder={G.testPick} /></SelectTrigger>
              <SelectContent>{companies.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" onClick={() => test.run("t", () => testGoogle(testSlug), false)} disabled={!testSlug || !!test.busy}>
              <Spin on={!!test.busy} /> {ar.common.test}
            </Button>
          </div>
        ) : <p className="text-sm text-muted-foreground">{ar.companies.empty}</p>}
        <Notice result={test.res} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Access

/** Access comes from Google Sheets sharing — nothing to manage here except the sheets themselves. */
export function AccessSection({ owner, companies }: { owner: string; companies: { name: string; sheetUrl: string }[] }) {
  return (
    <div className="grid gap-4 text-sm">
      <ul className="grid list-disc gap-1.5 ps-5">
        <li>أي حساب Google عنده صلاحية <strong>Editor</strong> على شيت أي شركة يقدر يدخل — ويشوف <strong>كل الشركات</strong> بكل الصلاحيات.</li>
        <li>عشان تضيف حد: افتح شيت الشركة ← <strong>Share</strong> ← ضيف إيميله كـ <strong>Editor</strong>.</li>
        <li>عشان تشيل حد: شيل الـ Share بتاعه من الشيتات — الدخول بيتقفل عليه خلال 5 دقايق.</li>
        <li>الـ Viewer (عرض بس) مايقدرش يدخل.</li>
        <li>صاحب الحساب <span dir="ltr" className="font-mono">{owner}</span> بيدخل دايماً حتى لو مش على أي شيت.</li>
      </ul>
      <div className="grid gap-1.5">
        <h3 className="font-medium">شيتات الشركات (من هنا بتدير مين يدخل)</h3>
        <ul className="divide-y rounded-lg border">
          {companies.map((c) => (
            <li key={c.sheetUrl} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
              <span>{c.name}</span>
              <a href={c.sheetUrl} target="_blank" rel="noreferrer" className="text-xs underline">افتح الشيت ← Share</a>
            </li>
          ))}
          {!companies.length && <li className="p-2.5 text-muted-foreground">{ar.companies.empty}</li>}
        </ul>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Defaults

export function DefaultsSection({ initial }: { initial: Defaults }) {
  const { res, busy, run } = useRun();
  const [d, setD] = useState(initial);
  const num = (k: keyof Defaults, label: string, help?: string, step = "1") => (
    <Field label={label} help={help} htmlFor={"d-" + k}>
      <Input id={"d-" + k} dir="ltr" type="number" step={step} value={String(d[k])} onChange={(e) => setD({ ...d, [k]: e.target.value as unknown as number })} />
    </Field>
  );
  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); run("save", () => saveDefaults(d)); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        {num("dailyCap", "الحد اليومي للإيميلات", "ابدأ بـ 15 وزوّد تدريجياً")}
        {num("perRun", "عدد الإيميلات في كل تشغيل")}
        {num("startHour", "ساعة بداية الإرسال")}
        {num("endHour", "ساعة نهاية الإرسال")}
        {num("gapSec", "الفاصل بين الإيميلات (ثواني)")}
        {num("maxBounce", "أقصى نسبة Bounce", ar.companySettings.schedule.bounceHelp, "0.01")}
        {num("waitDays", "أيام انتظار بعد آخر خطوة")}
        <Field label="المنطقة الزمنية" htmlFor="d-tz">
          <KeyInput id="d-tz" spec={{ key: "tz", type: "tz" }} value={d.timezone} onChange={(v) => setD({ ...d, timezone: v })} />
        </Field>
        <Field label="أيام الإرسال" className="sm:col-span-2">
          <KeyInput id="d-days" spec={{ key: "days", type: "days" }} value={d.days.join(",")} onChange={(v) => setD({ ...d, days: v.split(",").filter(Boolean) })} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!!busy}><Spin on={!!busy} /> {ar.common.save}</Button>
        <Notice result={res} />
      </div>
      <datalist id="tz-all">{TIMEZONES.map((z) => <option key={z} value={z} />)}</datalist>
    </form>
  );
}

// ------------------------------------------------------------------ Notifications

export function NotificationsSection({ emails, companies }: { emails: string[]; companies: (Co & { current: string | null })[] }) {
  const { res, busy, run } = useRun();
  const [text, setText] = useState(emails.join("\n"));
  const [sheetRes, setSheetRes] = useState<Record<string, Result>>({});
  const N = T.notifications;
  return (
    <div className="grid gap-6">
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); run("save", () => saveNotificationEmails(text)); }}>
        <Field label={N.emails} htmlFor="n-emails">
          <Textarea id="n-emails" dir="ltr" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="alerts@example.com" />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!!busy}><Spin on={busy === "save"} /> {ar.common.save}</Button>
          <Notice result={res} />
        </div>
      </form>
      <div className="grid gap-3 rounded-xl border p-4">
        <div>
          <h3 className="font-medium">{N.writeToSheet}</h3>
          <p className="text-sm text-muted-foreground">{N.writeToSheetDesc}</p>
        </div>
        <ul className="grid gap-3">
          {companies.map((c) => (
            <li key={c.slug} className="grid gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{c.name}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {N.current}: <span dir="ltr">{c.current || ar.common.none}</span>
                  <Button size="sm" variant="outline" disabled={!text.trim() || !!busy} onClick={async () => {
                    const r = await run("w" + c.slug, () => writeAlertEmailToSheet(c.slug, text), true);
                    setSheetRes((s) => ({ ...s, [c.slug]: r }));
                  }}><Spin on={busy === "w" + c.slug} /> {N.writeToSheet}</Button>
                </span>
              </div>
              <Notice result={sheetRes[c.slug]} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
