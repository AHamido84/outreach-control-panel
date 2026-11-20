"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLinkIcon, Loader2Icon, PauseIcon, TrashIcon } from "lucide-react";
import { ar } from "@/content/ar";
import { pauseSending, removeFromDashboard, saveMondayBoard, saveMondayToken } from "@/app/actions/company";
import { CopyButton, Field, KV, Mark, Notice, Warn, type Result } from "@/components/app/basics";
import { CommandButton, CommandStatus } from "@/components/app/command";
import { CompanyKeysForm, toStr, type FieldSpec, type Vals } from "@/components/app/company-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { SecretInfo } from "@/lib/crypto/secrets";
import type { SystemInfo } from "@/lib/sheets/schema";
import { Section } from "./company-sections";

const T = ar.companySettings;
const M = T.monday;
const yes = (v: unknown) => String(v ?? "") === "نعم";

// ------------------------------------------------------------------ monday

function TokenForm({ slug, info, sys }: { slug: string; info: SecretInfo; sys: SystemInfo | null }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [res, setRes] = useState<Result | null>(null), [busy, setBusy] = useState(false);
  const [cmdId, setCmdId] = useState<string | null>(null);
  const [stage, setStage] = useState(0); // steps reached (1..4)
  const linked = yes(sys?.dashboardLinked);
  return (
    <div className="grid gap-3">
      <KV rows={[
        ["في الداشبورد", info.set ? <span key="d">{ar.common.set} <span dir="ltr" className="text-muted-foreground">••••{info.last4}</span> · {new Date(info.updatedAt!).toLocaleString("ar-EG")}</span> : ar.common.notSet],
        [M.inSheet, <Mark key="s" level={sys ? yes(sys.mondayToken) : null} />],
      ]} />
      {!linked && <Warn>{M.notLinked}</Warn>}
      <form className="grid gap-2" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setRes(null); setCmdId(null); setStage(0);
        const r = await saveMondayToken(slug, token);
        setBusy(false); setRes(r);
        if (r.ok) { setToken(""); setStage(3); setCmdId(r.data!.id); router.refresh(); }
      }}>
        <Field label={M.token} help={M.tokenHelp} htmlFor="m-token">
          <Input id="m-token" type="password" autoComplete="off" dir="ltr" value={token} onChange={(e) => setToken(e.target.value)} placeholder={M.tokenPlaceholder} />
        </Field>
        <div><Button disabled={busy || !token.trim()}>{busy && <Loader2Icon className="animate-spin" />} {M.tokenSave}</Button></div>
      </form>
      {(busy || res) && (
        <ol className="grid gap-1 text-sm">
          {M.tokenSteps.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              {busy && i === 0 ? <Loader2Icon className="size-4 animate-spin" /> : <Mark level={res && !res.ok && i === 0 ? "fail" : stage > i ? "ok" : null} />} {s}
            </li>
          ))}
        </ol>
      )}
      <Notice result={res} />
      <CommandStatus slug={slug} id={cmdId} onDone={(c) => { if (c.status === "تم") setStage(4); router.refresh(); }} />
    </div>
  );
}

function BoardForm({ slug, board, account }: { slug: string; board: string; account: string }) {
  const router = useRouter();
  const [b, setB] = useState(board), [a, setA] = useState(account);
  const [res, setRes] = useState<Result | null>(null), [busy, setBusy] = useState(false);
  return (
    <form className="grid gap-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await saveMondayBoard(slug, b, a); setBusy(false); setRes(r); if (r.ok) router.refresh(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={M.board} help={M.boardHelp} htmlFor="m-board"><Input id="m-board" dir="ltr" value={b} onChange={(e) => setB(e.target.value)} placeholder="https://xxx.monday.com/boards/123…" /></Field>
        <Field label={M.account} help={M.accountHelp} htmlFor="m-acc"><Input id="m-acc" dir="ltr" value={a} onChange={(e) => setA(e.target.value)} placeholder="mycompany" /></Field>
      </div>
      {a && b && <a className="inline-flex items-center gap-1 text-xs underline" href={`https://${a}.monday.com/boards/${b.replace(/\D/g, "") || b}`} target="_blank" rel="noreferrer">افتح البورد <ExternalLinkIcon className="size-3" /></a>}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={busy}>{busy && <Loader2Icon className="animate-spin" />} {ar.common.save}</Button>
        <Notice result={res} />
      </div>
    </form>
  );
}

export function MondayTab({ slug, info, sys, board, account }: { slug: string; info: SecretInfo; sys: SystemInfo | null; board: string; account: string }) {
  return (
    <div className="grid gap-5">
      <Section title={M.token} desc={M.desc}><TokenForm slug={slug} info={info} sys={sys} /></Section>
      <Section title="البورد"><BoardForm slug={slug} board={board} account={account} /></Section>
      <Section title={M.testConn}>
        <div className="grid gap-4 sm:grid-cols-2">
          <CommandButton slug={slug} type="testMonday" label={M.testConn} render={(c) => {
            const r = c.result as { account?: string; board?: string | null; boardReachable?: boolean; missingColumns?: string[] };
            return (
              <div className="grid gap-2 text-sm">
                <KV rows={[["الحساب", r.account || "—"], ["البورد", r.board || "—"], ["", <span key="b"><Mark level={!!r.boardReachable} /> {r.boardReachable ? M.boardOk : M.boardBad}</span>]]} />
                {r.missingColumns?.length ? (
                  <div><p className="font-medium">{M.missingCols}:</p><ul className="list-disc ps-5">{r.missingColumns.map((m) => <li key={m}>{m}</li>)}</ul></div>
                ) : r.boardReachable ? <p className="text-emerald-700">{M.noMissing}</p> : null}
              </div>
            );
          }} />
          <CommandButton slug={slug} type="setup" label={M.runSetup} />
        </div>
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ Advanced

export function AdvancedTab({ slug, name, sheetUrl, sys, extra }: {
  slug: string; name: string; sheetUrl: string; sys: SystemInfo | null; extra: { fields: FieldSpec[]; initial: Vals };
}) {
  const router = useRouter();
  const A = T.advanced;
  const [res, setRes] = useState<Result | null>(null), [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const rows = sys?._rows ?? [];
  return (
    <div className="grid gap-5">
      <Section title={A.sheet}>
        <div className="flex flex-wrap items-center gap-2">
          <a href={sheetUrl} target="_blank" rel="noreferrer" dir="ltr" className="text-sm break-all underline">{sheetUrl}</a>
          <CopyButton value={sheetUrl} />
        </div>
      </Section>

      <Section title={A.system} action={<Button size="sm" variant="ghost" onClick={() => router.refresh()}>{ar.common.refresh}</Button>}>
        {rows.length === 0 ? <Warn>{A.systemEmpty}</Warn> : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <tbody>{rows.map((r) => {
                const ts = /^(heartbeat|last[A-Z])/.test(r.key) && Number(r.value) > 1e12 ? new Date(Number(r.value)).toLocaleString("ar-EG") : null;
                return (
                  <tr key={r.key} className="border-t first:border-t-0 align-top">
                    <td className="p-2 font-mono text-xs whitespace-nowrap" dir="ltr">{r.key}</td>
                    <td className="p-2 break-all"><span dir="auto">{ts ?? toStr(r.value)}</span></td>
                    <td className="hidden p-2 text-xs text-muted-foreground sm:table-cell">{r.desc}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={A.reinstall} desc={A.reinstallDesc}><CommandButton slug={slug} type="setup" label={A.reinstall} /></Section>

      <Section title={A.pause} desc={A.pauseDesc}>
        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger asChild><Button variant="destructive"><PauseIcon /> {A.pause}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{A.pause}</DialogTitle><DialogDescription>{name}: {A.pauseDesc}</DialogDescription></DialogHeader>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">{ar.common.cancel}</Button></DialogClose>
                <DialogClose asChild>
                  <Button variant="destructive" onClick={async () => { setBusy("pause"); const r = await pauseSending(slug); setBusy(null); setRes(r); router.refresh(); }}>{ar.common.confirm}</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {busy === "pause" && <Loader2Icon className="size-4 animate-spin" />}
          <Notice result={res} />
        </div>
      </Section>

      <Section title={A.extra} desc={A.extraDesc}>
        {extra.fields.length ? <CompanyKeysForm slug={slug} fields={extra.fields} initial={extra.initial} /> : <p className="text-sm text-muted-foreground">{A.noExtra}</p>}
      </Section>

      <Section title={A.remove} desc={A.removeDesc}>
        <Dialog>
          <DialogTrigger asChild><Button variant="destructive"><TrashIcon /> {A.remove}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{A.remove}</DialogTitle><DialogDescription>{A.removeDesc}</DialogDescription></DialogHeader>
            <Field label={A.removeConfirm(name)} htmlFor="rm-confirm"><Input id="rm-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">{ar.common.cancel}</Button></DialogClose>
              <Button variant="destructive" disabled={confirm.trim() !== name || busy === "rm"} onClick={async () => {
                setBusy("rm"); const r = await removeFromDashboard(slug, confirm); setBusy(null); if (r && !r.ok) setRes(r);
              }}>{busy === "rm" && <Loader2Icon className="animate-spin" />} {ar.common.remove}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>
    </div>
  );
}
