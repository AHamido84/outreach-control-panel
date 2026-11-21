import Link from "next/link";
import { Notice, UrlTabs } from "@/components/app/basics";
import { toStr } from "@/components/app/shared";
import { CommandsTable } from "@/components/activity/commands-table";
import { StatusBadge } from "@/components/data/badges";
import { TabsContent } from "@/components/ui/tabs";
import { requireCompany } from "@/lib/auth/guards";
import { SheetsError } from "@/lib/google/transport";
import { sheetsFor } from "@/lib/sheets";
import { logRows } from "@/lib/sheets/queries";

export default async function ActivityPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; status?: string; type?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { company: c } = await requireCompany(slug);
  let d;
  try {
    const s = await sheetsFor(c);
    const [cmds, log, company] = await Promise.all([s.commands(true), logRows(s, 300), s.companyRows()]);
    d = { cmds, log, tz: toStr(company.map["المنطقة الزمنية"]) || "Asia/Riyadh" };
  } catch (e) {
    console.error(`[${slug}] activity failed:`, e);
    return <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6"><Notice result={{ ok: false, error: e instanceof SheetsError ? e.message : "مقدرناش نقرا الشيت", detail: (e as Error).message }} /></main>;
  }
  const { cmds, log, tz } = d;
  const types = [...new Set(cmds.map((x) => x.type))].sort();
  const shown = cmds.filter((x) => (!sp.status || x.status === sp.status) && (!sp.type || x.type === sp.type)).slice(0, 200)
    // البيانات can hold a sealed token: never send it to the browser
    .map(({ payload, ...x }) => ({ ...x, payload: payload === "***" || /"sealed"/.test(payload) ? "***" : payload }));
  const chip = (k: "status" | "type", v: string, label: string) => {
    const on = (sp[k] || "") === v;
    const q = new URLSearchParams({ ...(sp.status ? { status: sp.status } : {}), ...(sp.type ? { type: sp.type } : {}), [k]: v });
    if (!v) q.delete(k);
    return <Link key={k + v} href={`?${q}`} className={`rounded-full border px-3 py-1 text-xs ${on ? "border-primary bg-primary/5" : ""}`}>{label}</Link>;
  };
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold">السجل — {c.name}</h1>
      <UrlTabs value={sp.tab === "log" ? "log" : "commands"} items={[{ value: "commands", label: `الأوامر (${cmds.length})` }, { value: "log", label: "Log" }]}>
        <TabsContent value="commands" className="grid gap-3 pt-2">
          <div className="flex flex-wrap gap-1.5">
            {chip("status", "", "كل الحالات")}{["في الانتظار", "جاري التنفيذ", "تم", "فشل", "ملغي"].map((s) => chip("status", s, s))}
          </div>
          <div className="flex flex-wrap gap-1.5">{chip("type", "", "كل الأنواع")}{types.map((t) => chip("type", t, t))}</div>
          <CommandsTable slug={slug} tz={tz} commands={shown} />
        </TabsContent>
        <TabsContent value="log" className="pt-2">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-max text-sm">
              <thead className="bg-muted/50"><tr>{["الوقت", "الدالة", "العدد", "النتيجة", "التفاصيل"].map((h) => <th key={h} className="p-2 text-right font-medium">{h}</th>)}</tr></thead>
              <tbody>{log.map((l, i) => (
                <tr key={i} className="border-t align-top">
                  <td className="p-2 whitespace-nowrap" dir="ltr">{l.time}</td><td className="p-2" dir="ltr">{l.fn}</td><td className="p-2 tabular-nums">{l.count}</td>
                  <td className="p-2"><StatusBadge value={l.result} /></td><td className="max-w-xl p-2 text-xs break-words">{l.details}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </TabsContent>
      </UrlTabs>
    </main>
  );
}
