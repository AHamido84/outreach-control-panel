"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DownloadIcon, ExternalLinkIcon, Loader2Icon } from "lucide-react";
import { bulkLeads, editLead, type BulkAction } from "@/app/actions/data";
import { Notice, type Result } from "@/components/app/basics";
import { CommandStatus } from "@/components/app/command";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { gmailLink, MondayMark, mondayItemLink, StatusBadge } from "./badges";

type L = Record<string, string>;
const EDIT = ["اسم الشخص", "كود الـ Segment", "اللغة", "ملاحظات"] as const;

function Cell({ lead, col, options, onSave }: { lead: L; col: string; options?: string[]; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(lead[col] ?? "");
  const commit = () => { setEditing(false); if (v !== (lead[col] ?? "")) onSave(v); };
  if (!editing) {
    return (
      <button type="button" onClick={() => { setV(lead[col] ?? ""); setEditing(true); }} title="تعديل"
        className="min-h-6 w-full rounded px-1 text-right hover:bg-muted" aria-label={`تعديل ${col} — ${lead["ID"]}`}>
        {lead[col] || <span className="text-muted-foreground/50">—</span>}
      </button>
    );
  }
  return options ? (
    <select autoFocus value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} aria-label={col}
      className="h-7 w-28 rounded border bg-background px-1 text-sm">
      <option value="" />
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  ) : (
    <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} aria-label={col}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="h-7 w-36 rounded border bg-background px-1 text-sm" />
  );
}

export function LeadsTable({ slug, rows, total, allIds, segments, languages, exportHref, mondayAccount, board }: {
  slug: string; rows: L[]; total: number; allIds: string[]; segments: string[]; languages: string[]; exportHref: string; mondayAccount?: string; board: string;
}) {
  const router = useRouter();
  const [data, setData] = useState(rows);
  const [src, setSrc] = useState(rows);
  if (src !== rows) { setSrc(rows); setData(rows); }
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<BulkAction | null>(null);
  const [seg, setSeg] = useState(segments[0] ?? "");
  const [cmdId, setCmdId] = useState<string | null>(null);

  const save = async (id: string, col: string, value: string) => {
    const before = data;
    setData((d) => d.map((l) => (l["ID"] === id ? { ...l, [col]: value } : l))); // optimistic
    const r = await editLead(slug, id, { [col]: value });
    if (!r.ok) { setData(before); setRes(r); } else setRes(null);
  };
  const runBulk = async (a: BulkAction) => {
    setBusy(true); setRes(null); setCmdId(null);
    const r = await bulkLeads(slug, a, [...sel], a === "segment" ? seg : undefined);
    setBusy(false); setRes(r);
    if (r.ok) { if (r.data && (r.data as { id?: string }).id) setCmdId((r.data as { id: string }).id); setSel(new Set()); router.refresh(); }
  };
  const allOnPage = data.length > 0 && data.every((l) => sel.has(l["ID"]));
  const LABEL: Record<BulkAction, string> = { segment: "تغيير الـ Segment", dnc: "نقل لـ Do-Not-Contact", ready: "رجّعهم «جاهز»", retryMonday: "إعادة المحاولة على monday" };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2 text-sm">
        <span>{sel.size ? `مختار ${sel.size}` : `${total} عميل`}</span>
        {sel.size > 0 && sel.size < allIds.length && <Button size="xs" variant="link" onClick={() => setSel(new Set(allIds))}>اختار كل الـ {allIds.length} المطابقين</Button>}
        {sel.size > 0 && <Button size="xs" variant="link" onClick={() => setSel(new Set())}>إلغاء الاختيار</Button>}
        <span className="mx-1 h-4 w-px bg-border" />
        <select aria-label="Segment" value={seg} onChange={(e) => setSeg(e.target.value)} className="h-7 rounded border bg-background px-1 text-xs" disabled={!sel.size}>
          {segments.map((s) => <option key={s}>{s}</option>)}
        </select>
        <Button size="xs" variant="outline" disabled={!sel.size || busy} onClick={() => setConfirm("segment")}>{LABEL.segment}</Button>
        <Button size="xs" variant="outline" disabled={!sel.size || busy} onClick={() => setConfirm("ready")}>{LABEL.ready}</Button>
        <Button size="xs" variant="outline" disabled={!sel.size || busy} onClick={() => setConfirm("retryMonday")}>{LABEL.retryMonday}</Button>
        <Button size="xs" variant="destructive" disabled={!sel.size || busy} onClick={() => setConfirm("dnc")}>{LABEL.dnc}</Button>
        <Button asChild size="xs" variant="ghost" className="ms-auto"><a href={exportHref}><DownloadIcon /> تصدير CSV</a></Button>
        {busy && <Loader2Icon className="size-4 animate-spin" />}
      </div>
      <Notice result={res} />
      <CommandStatus slug={slug} id={cmdId} onDone={() => router.refresh()} />

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-8 p-2"><input type="checkbox" aria-label="اختار الصفحة" checked={allOnPage}
                onChange={() => setSel((s) => { const n = new Set(s); data.forEach((l) => (allOnPage ? n.delete(l["ID"]) : n.add(l["ID"]))); return n; })} /></th>
              {["ID", "اسم الجهة", "اسم الشخص", "الإيميل", "المصدر", "Segment", "اللغة", "المعالجة", "التواصل", "monday", "ملاحظات"].map((h) => <th key={h} className="p-2 text-right font-medium whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map((l) => {
              const item = mondayItemLink(mondayAccount, board, l["monday Item ID"]);
              return (
                <tr key={l["ID"]} className={cn("border-t align-middle", sel.has(l["ID"]) && "bg-primary/5")}>
                  <td className="p-2"><input type="checkbox" aria-label={`اختار ${l["ID"]}`} checked={sel.has(l["ID"])}
                    onChange={() => setSel((s) => { const n = new Set(s); if (n.has(l["ID"])) n.delete(l["ID"]); else n.add(l["ID"]); return n; })} /></td>
                  <td className="p-2 font-mono text-xs" dir="ltr">{l["ID"]}</td>
                  <td className="max-w-48 truncate p-2" title={l["اسم الجهة"]}>{l["اسم الجهة"]}</td>
                  <td className="p-1"><Cell lead={l} col={EDIT[0]} onSave={(v) => save(l["ID"], EDIT[0], v)} /></td>
                  <td className="max-w-56 truncate p-2" dir="ltr">{l["الإيميل"]}</td>
                  <td className="p-2 text-xs" dir="ltr">{l["كود المصدر"]}</td>
                  <td className="p-1" dir="ltr"><Cell lead={l} col={EDIT[1]} options={segments} onSave={(v) => save(l["ID"], EDIT[1], v)} /></td>
                  <td className="p-1" dir="ltr"><Cell lead={l} col={EDIT[2]} options={languages} onSave={(v) => save(l["ID"], EDIT[2], v)} /></td>
                  <td className="p-2"><StatusBadge value={l["حالة المعالجة"]} /></td>
                  <td className="p-2">
                    <StatusBadge value={l["حالة التواصل"]} />
                    {l["Thread ID"] && <a className="ms-1 inline-block align-middle text-muted-foreground hover:text-foreground" href={gmailLink(l["Thread ID"])} target="_blank" rel="noreferrer" aria-label="Gmail"><ExternalLinkIcon className="size-3.5" /></a>}
                  </td>
                  <td className="p-2">
                    <MondayMark value={l["حالة monday"]} />
                    {item && <a className="ms-1 inline-block align-middle text-muted-foreground hover:text-foreground" href={item} target="_blank" rel="noreferrer" aria-label="monday item"><ExternalLinkIcon className="size-3.5" /></a>}
                  </td>
                  <td className="p-1"><Cell lead={l} col={EDIT[3]} onSave={(v) => save(l["ID"], EDIT[3], v)} /></td>
                </tr>
              );
            })}
            {!data.length && <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">مافيش عملاء مطابقين</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm ? LABEL[confirm] : ""}</DialogTitle>
            <DialogDescription>
              {sel.size} عميل{confirm === "segment" ? ` ← ${seg}` : ""}.
              {confirm === "ready" && " اللي ردّوا أو حجزوا أو طلبوا الإزالة أو Bounce مش هيتغيّروا. اللي اتبعتلهم قبل كده هيبدأوا من أول خطوة في thread جديد."}
              {confirm === "dnc" && " الإيميلات هتتضاف لتاب Do-Not-Contact والمحرك مش هيبعتلهم تاني."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">إلغاء</Button></DialogClose>
            <Button variant={confirm === "dnc" ? "destructive" : "default"} onClick={() => { const a = confirm!; setConfirm(null); runBulk(a); }}>تأكيد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
