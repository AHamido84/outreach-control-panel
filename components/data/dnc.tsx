"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, TrashIcon } from "lucide-react";
import { dncAdd, dncRemove } from "@/app/actions/data";
import { Field, Notice, type Result } from "@/components/app/basics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Entry = { row: number; value: string; type: string; reason: string; date: string; note: string };

export function DncManager({ slug, entries, reasons }: { slug: string; entries: Entry[]; reasons: string[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [reason, setReason] = useState(reasons.includes("يدوي") ? "يدوي" : reasons[0] ?? "يدوي");
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Result | null>(null), [busy, setBusy] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const shown = entries.filter((e) => !hidden.has(e.row) && (!q || e.value.includes(q.toLowerCase()) || e.reason.includes(q)));
  return (
    <div className="grid gap-5">
      <form className="grid gap-3 rounded-xl border p-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy("add"); const r = await dncAdd(slug, text, reason); setBusy(null); setRes(r); if (r.ok) { setText(""); router.refresh(); }
      }}>
        <Field label="إيميلات أو دومينات (واحد في كل سطر)" help="name@company.com أو company.com — الدومين بيمنع كل إيميلاته" htmlFor="dnc-text">
          <Textarea id="dnc-text" dir="ltr" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={"name@company.com\ncompetitor.com"} />
        </Field>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="السبب" htmlFor="dnc-reason">
            <select id="dnc-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
              {(reasons.length ? reasons : ["يدوي"]).map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Button disabled={!text.trim() || !!busy}>{busy === "add" && <Loader2Icon className="animate-spin" />} إضافة</Button>
        </div>
        <Notice result={res} />
      </form>

      <div className="grid gap-2">
        <Input placeholder="بحث" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" aria-label="بحث في Do-Not-Contact" />
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-muted/50"><tr>{["الإيميل أو الدومين", "النوع", "السبب", "التاريخ", "ملاحظات", ""].map((h, i) => <th key={i} className="p-2 text-right font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.row} className="border-t">
                  <td className="p-2" dir="ltr">{e.value}</td><td className="p-2">{e.type || "—"}</td><td className="p-2">{e.reason}</td>
                  <td className="p-2" dir="ltr">{e.date}</td><td className="max-w-56 truncate p-2">{e.note}</td>
                  <td className="p-1">
                    <Button size="icon-sm" variant="ghost" aria-label={`شيل ${e.value}`} disabled={!!busy} onClick={async () => {
                      setBusy("rm" + e.row); setHidden((h) => new Set(h).add(e.row)); // optimistic
                      const r = await dncRemove(slug, e.row, e.value); setBusy(null); setRes(r);
                      if (!r.ok) setHidden((h) => { const n = new Set(h); n.delete(e.row); return n; }); else router.refresh();
                    }}><TrashIcon /></Button>
                  </td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">مافيش</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">الشيل بيمسح الصف (المحرك بيتجاهل الصفوف الفاضية) — مافيش صفوف بتتحرك في الشيت.</p>
      </div>
    </div>
  );
}
