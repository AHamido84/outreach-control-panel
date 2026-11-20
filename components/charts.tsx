"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Single-series charts (no legend: the title names the series).
 * Marks: 4px rounded data-end anchored to the baseline, 2px surface gap between bars,
 * recessive axis, selective direct labels, hover tooltip with a hit target larger than the mark, table view.
 */

export function DailyBars({ data, label, unit = "إيميل" }: { data: { day: string; value: number }[]; label: string; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = Math.max(1, Math.ceil(max / 5) * 5);
  const H = 140;
  const peak = data.reduce((a, d, i) => (d.value > data[a].value ? i : a), 0);
  const fmtDay = (d: string) => new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
  return (
    <figure className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <figcaption className="text-sm font-medium">{label}</figcaption>
        <button type="button" onClick={() => setTable((t) => !t)} className="text-xs text-muted-foreground underline">{table ? "عرض كرسم" : "عرض كجدول"}</button>
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead><tr className="text-muted-foreground"><th className="p-1 text-right font-normal">اليوم</th><th className="p-1 text-right font-normal">{unit}</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.day} className="border-t"><td className="p-1">{fmtDay(d.day)}</td><td className="p-1 tabular-nums">{d.value}</td></tr>)}</tbody>
        </table>
      ) : (
        <div className="relative" dir="ltr">
          <div className="absolute inset-x-0 top-0 flex h-[140px] flex-col justify-between" aria-hidden>
            {[nice, nice / 2, 0].map((v) => (
              <div key={v} className="flex items-center gap-1">
                <span className="w-6 text-right text-[10px] text-muted-foreground tabular-nums">{v}</span>
                <div className="h-px flex-1 bg-border/70" />
              </div>
            ))}
          </div>
          <div className="relative ms-7 flex h-[140px] items-end" role="img" aria-label={`${label}: ${data.map((d) => `${fmtDay(d.day)} ${d.value}`).join("، ")}`}>
            {data.map((d, i) => {
              const h = d.value ? Math.max(3, (d.value / nice) * H) : 0;
              const showLabel = d.value > 0 && (i === peak || i === data.length - 1);
              return (
                <div key={d.day} className="relative flex h-full flex-1 items-end justify-center px-[1px]"
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
                  {showLabel && <span className="absolute text-[10px] font-medium tabular-nums" style={{ bottom: h + 2 }}>{d.value}</span>}
                  <div className={cn("w-full max-w-7 rounded-t-[4px] transition-opacity", hover !== null && hover !== i && "opacity-60")}
                    style={{ height: h, background: "var(--viz-1)" }} />
                  {hover === i && (
                    <div className="pointer-events-none absolute bottom-full z-10 mb-1 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap shadow-md" dir="rtl">
                      {fmtDay(d.day)}: <strong className="tabular-nums">{d.value}</strong> {unit}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="ms-7 mt-1 flex text-[10px] text-muted-foreground">
            {data.map((d, i) => <span key={d.day} className="flex-1 text-center">{i % 3 === 0 || i === data.length - 1 ? fmtDay(d.day) : ""}</span>)}
          </div>
        </div>
      )}
    </figure>
  );
}

/** Horizontal bars with direct name + value labels (text in ink, the bar carries the magnitude). */
export function BarList({ items, label, ordinal = false, empty = "مافيش داتا" }: {
  items: { name: string; value: number; hint?: string }[]; label: string; ordinal?: boolean; empty?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((s, i) => s + i.value, 0);
  const ORD = ["var(--viz-o1)", "var(--viz-o2)", "var(--viz-o3)"];
  return (
    <figure className="grid gap-2">
      <figcaption className="text-sm font-medium">{label}</figcaption>
      {!items.length ? <p className="text-sm text-muted-foreground">{empty}</p> : (
        <ul className="grid gap-1.5">
          {items.map((it, i) => (
            <li key={it.name} className="relative grid grid-cols-[minmax(5rem,9rem)_1fr_auto] items-center gap-2 text-sm"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <span className="truncate" dir="auto" title={it.name}>{it.name}</span>
              <div className="h-4 rounded-e-[4px] bg-muted/40">
                <div className={cn("h-full rounded-e-[4px] transition-opacity", hover !== null && hover !== i && "opacity-60")}
                  style={{ width: `${(it.value / max) * 100}%`, minWidth: it.value ? 3 : 0, background: ordinal ? ORD[Math.min(i, 2)] : "var(--viz-1)" }} />
              </div>
              <span className="tabular-nums">{it.value}</span>
              {hover === i && (
                <div className="pointer-events-none absolute end-0 bottom-full z-10 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap shadow-md">
                  {it.name}: <strong>{it.value}</strong>{total ? ` (${Math.round((it.value / total) * 100)}%)` : ""}{it.hint ? ` — ${it.hint}` : ""}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/** Hero number tile. */
export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "bad" | "warn" }) {
  return (
    <div className="grid gap-0.5 rounded-xl border bg-card p-3.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-2xl font-semibold tabular-nums", tone === "bad" && "text-destructive", tone === "warn" && "text-amber-700 dark:text-amber-400", tone === "good" && "text-emerald-700 dark:text-emerald-400")}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}
