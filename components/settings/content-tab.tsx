"use client";

import { useMemo } from "react";
import { ar } from "@/content/ar";
import { UrlTabs } from "@/components/app/basics";
import { TabsContent } from "@/components/ui/tabs";
import { CONTENT_TABS, LIST_VALIDATIONS, TAB } from "@/lib/sheets/schema";
import { ListsEditor, shareFooter, TableEditor, TemplatesEditor, type PlainTable } from "./content-editor";

const C = ar.companySettings.content;
const col = (t: PlainTable | undefined, h: string) => new Set((t?.rows ?? []).map((r) => String(r[h] ?? "").trim()).filter(Boolean));

export function ContentTab({ slug, sub, tables, leads, company }: {
  slug: string; sub: string; tables: Record<string, PlainTable | undefined>; leads: Record<string, string>[]; company: Record<string, unknown>;
}) {
  const lists = useMemo(() => {
    const t = tables[TAB.LISTS];
    const out: Record<string, string[]> = {};
    t?.headers.filter(Boolean).forEach((h) => { out[h] = t.rows.map((r) => String(r[h] ?? "").trim()).filter(Boolean); });
    return out;
  }, [tables]);

  const rules = useMemo(() => {
    const r: Record<string, Record<string, { list?: string; ref?: { set: Set<string>; msg: string } }>> = {};
    for (const [tab, m] of Object.entries(LIST_VALIDATIONS)) r[tab] = Object.fromEntries(Object.entries(m).map(([c, l]) => [c, { list: l }]));
    r[TAB.SEQUENCE] = { ...r[TAB.SEQUENCE],
      "كود الـ Segment": { ref: { set: col(tables[TAB.SEGMENTS], "كود الـ Segment"), msg: C.unknownSegment } },
      "كود القالب": { ref: { set: col(tables[TAB.TEMPLATES], "كود القالب"), msg: C.unknownTemplate } } };
    r[TAB.MAPPING] = { ...r[TAB.MAPPING], "كود المصدر": { ref: { set: col(tables[TAB.SOURCES], "كود المصدر"), msg: C.unknownSource } } };
    return r;
  }, [tables]);

  const tabs = [TAB.SEGMENTS, TAB.SEQUENCE, TAB.TEMPLATES, TAB.SOURCES, TAB.MAPPING, TAB.LISTS] as const;
  return (
    <UrlTabs param="sub" value={tabs.includes(sub as (typeof tabs)[number]) ? sub : TAB.SEGMENTS} items={tabs.map((t) => ({ value: t, label: C.tabs[t] }))}>
      {tabs.map((t) => {
        const table = tables[t];
        return (
          <TabsContent key={t} value={t} className="pt-2">
            {!table ? <p className="text-sm text-destructive">التاب «{t}» مش موجود في الشيت</p>
              : t === TAB.TEMPLATES ? <TemplatesEditor slug={slug} table={table} lists={lists} leads={leads} company={company} />
              : t === TAB.LISTS ? <ListsEditor slug={slug} table={table} />
              : <TableEditor slug={slug} tab={t} cols={CONTENT_TABS[t].cols} table={table} lists={lists} rules={rules[t] ?? {}} keyCols={CONTENT_TABS[t].key}
                  footer={t === TAB.SEGMENTS ? shareFooter : undefined} />}
          </TabsContent>
        );
      })}
    </UrlTabs>
  );
}
