"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";
import { ar } from "@/content/ar";
import { queueCommand } from "@/app/actions/company";
import { Button } from "@/components/ui/button";
import type { CommandType } from "@/lib/sheets/schema";
import { Notice, Warn, type Result } from "./basics";

export type CmdView = { id: string; type: string; status: string; createdAt: string; executedAt: string; result: Record<string, unknown> | null; resultRaw: string };

const FINAL = ["تم", "فشل", "ملغي"];

/** Polls a command until it is تم / فشل / ملغي. */
export function useCommand(slug: string, id: string | null, intervalMs = 3000) {
  // state is tagged with the command id, so a new id starts clean without resetting state in the effect
  const [st, setSt] = useState<{ id: string; cmd: CmdView | null; error: string | null; stuck: boolean } | null>(null);
  useEffect(() => {
    if (!id) return;
    const started = Date.now();
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await fetch(`/api/c/${slug}/commands/${id}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || r.statusText);
        if (stop) return;
        setSt({ id, cmd: j, error: null, stuck: j.status === "في الانتظار" && Date.now() - started > 3 * 60e3 });
        if (FINAL.includes(j.status)) return;
      } catch (e) {
        if (!stop) setSt((s) => ({ id, cmd: s?.id === id ? s.cmd : null, error: (e as Error).message, stuck: s?.id === id && s.stuck }));
      }
      if (!stop) t = setTimeout(tick, intervalMs);
    };
    tick();
    return () => { stop = true; clearTimeout(t); };
  }, [slug, id, intervalMs]);
  const cur = st && st.id === id ? st : null;
  const cmd = cur?.cmd ?? null;
  return { cmd, error: cur?.error ?? null, done: !!cmd && FINAL.includes(cmd.status), stuck: !!cur?.stuck };
}

/** "waiting for the engine…" → running → result. Warns when pending > 3 min. */
export function CommandStatus({ slug, id, render, onDone }: { slug: string; id: string | null; render?: (c: CmdView) => ReactNode; onDone?: (c: CmdView) => void }) {
  const { cmd, error, stuck, done } = useCommand(slug, id);
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (done && cmd && fired.current !== cmd.id) { fired.current = cmd.id; onDone?.(cmd); }
  }, [done, cmd, onDone]);
  if (!id) return null;
  if (error && !cmd) return <Notice result={{ ok: false, error: "مقدرناش نتابع الأمر", detail: error }} />;
  if (!cmd || cmd.status === "في الانتظار" || cmd.status === "جاري التنفيذ") {
    return (
      <div className="grid gap-2">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" /> {cmd?.status === "جاري التنفيذ" ? ar.command.running : ar.command.waiting}
        </p>
        {stuck && (
          <Warn>{ar.command.stuck} — <Link className="underline" href={`/c/${slug}/settings?tab=advanced`}>{ar.command.stuckLink}</Link></Warn>
        )}
      </div>
    );
  }
  if (cmd.status === "فشل") {
    const err = String(cmd.result?.error ?? cmd.resultRaw ?? "");
    return <Notice result={{ ok: false, error: `${ar.command.failed}: ${err.slice(0, 200)}`, detail: cmd.resultRaw || undefined }} />;
  }
  if (cmd.status === "ملغي") return <p className="text-sm text-muted-foreground">{ar.command.cancelled}</p>;
  return (
    <div className="grid gap-2">
      <Notice result={{ ok: true, message: String(cmd.result?.summary ?? ar.command.done) }} />
      {render?.(cmd)}
    </div>
  );
}

/** A button that queues an engine command and shows its progress + result below. */
export function CommandButton({ slug, type, payload, label, variant = "outline", disabled, render, onQueued, onDone, validate }: {
  slug: string; type: CommandType; payload?: () => Record<string, unknown>; label: ReactNode; variant?: "default" | "outline" | "secondary";
  disabled?: boolean; render?: (c: CmdView) => ReactNode; onQueued?: (id: string) => void; onDone?: (c: CmdView) => void; validate?: () => string | null;
}) {
  const [id, setId] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-2">
      <div>
        <Button type="button" variant={variant} disabled={disabled || busy} onClick={async () => {
          const v = validate?.();
          if (v) { setRes({ ok: false, error: v }); return; }
          setBusy(true); setRes(null); setId(null);
          const r = await queueCommand(slug, type, payload?.() ?? {});
          setBusy(false);
          if (r.ok) { const nid = r.data!.id; setId(nid); onQueued?.(nid); } else setRes(r);
        }}>
          {busy && <Loader2Icon className="animate-spin" />} {label}
        </Button>
      </div>
      <Notice result={res} />
      <CommandStatus slug={slug} id={id} render={render} onDone={onDone} />
    </div>
  );
}
