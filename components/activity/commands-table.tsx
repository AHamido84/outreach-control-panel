"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, Loader2Icon, XIcon } from "lucide-react";
import { cancelCommand } from "@/app/actions/company";
import { Notice, type Result } from "@/components/app/basics";
import { StatusBadge } from "@/components/data/badges";
import { Button } from "@/components/ui/button";
import { fmtInTz } from "@/lib/tz";

type C = { id: string; type: string; payload: string; at: string; status: string; createdAt: string; executedAt: string; result: Record<string, unknown> | null; resultRaw: string; creator: string };

export function CommandsTable({ slug, tz, commands }: { slug: string; tz: string; commands: C[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  return (
    <div className="grid gap-2">
      <Notice result={res} />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-muted/50"><tr>{["", "النوع", "الحالة", "النتيجة", "اتعمل", "الميعاد", "اتنفذ", "المنشئ", ""].map((h, i) => <th key={i} className="p-2 text-right font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {commands.map((c) => (
              <Fragment key={c.id}>
                <tr className="border-t align-top">
                  <td className="p-1"><Button size="icon-xs" variant="ghost" aria-label="تفاصيل" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}><ChevronDownIcon className={open === c.id ? "rotate-180" : ""} /></Button></td>
                  <td className="p-2" dir="ltr">{c.type}</td>
                  <td className="p-2"><StatusBadge value={c.status} /></td>
                  <td className="max-w-md p-2 text-xs">{c.result?.error ? <span className="text-destructive">{String(c.result.error)}</span> : String(c.result?.summary ?? (c.resultRaw && !c.result ? c.resultRaw.slice(0, 120) : ""))}</td>
                  <td className="p-2 text-xs whitespace-nowrap">{fmtInTz(c.createdAt, tz)}</td>
                  <td className="p-2 text-xs whitespace-nowrap">{c.at ? fmtInTz(c.at, tz) : "فوراً"}</td>
                  <td className="p-2 text-xs whitespace-nowrap">{c.executedAt ? fmtInTz(c.executedAt, tz) : "—"}</td>
                  <td className="p-2 text-xs" dir="ltr">{c.creator}</td>
                  <td className="p-1">
                    {c.status === "في الانتظار" && (
                      <Button size="xs" variant="ghost" disabled={!!busy} onClick={async () => { setBusy(c.id); const r = await cancelCommand(slug, c.id); setBusy(null); setRes(r); router.refresh(); }}>
                        {busy === c.id ? <Loader2Icon className="animate-spin" /> : <XIcon />} إلغاء
                      </Button>
                    )}
                  </td>
                </tr>
                {open === c.id && (
                  <tr className="bg-muted/20"><td colSpan={9} className="p-3">
                    <div className="grid gap-2 text-xs">
                      <p><span className="text-muted-foreground">ID: </span><code dir="ltr">{c.id}</code></p>
                      <p className="text-muted-foreground">البيانات:</p><pre dir="ltr" className="overflow-auto rounded bg-muted p-2 text-left">{c.payload || "{}"}</pre>
                      <p className="text-muted-foreground">النتيجة:</p><pre dir="ltr" className="max-h-72 overflow-auto rounded bg-muted p-2 text-left whitespace-pre-wrap">{c.result ? JSON.stringify(c.result, null, 2) : c.resultRaw || "—"}</pre>
                    </div>
                  </td></tr>
                )}
              </Fragment>
            ))}
            {!commands.length && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">مافيش أوامر</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
