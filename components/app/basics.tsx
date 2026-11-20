"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckIcon, ChevronDownIcon, CopyIcon, CircleAlertIcon, CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import { ar } from "@/content/ar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type Result = { ok: true; message?: string; data?: unknown } | { ok: false; error: string; detail?: string };

/** Tabs whose selection lives in the URL (?tab= or another param), so links and reloads keep it. */
export function UrlTabs({ param = "tab", value, items, children, className }: {
  param?: string; value: string; items: { value: string; label: ReactNode }[]; children: ReactNode; className?: string;
}) {
  const router = useRouter(), pathname = usePathname(), sp = useSearchParams();
  const [v, setV] = useState(value);
  return (
    <Tabs value={v} onValueChange={(nv) => {
      setV(nv);
      const q = new URLSearchParams(sp.toString());
      q.set(param, nv);
      router.replace(`${pathname}?${q}`, { scroll: false });
    }} className={cn("min-w-0", className)}>
      <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <TabsList className="w-max">
          {items.map((i) => <TabsTrigger key={i.value} value={i.value}>{i.label}</TabsTrigger>)}
        </TabsList>
      </div>
      {children}
    </Tabs>
  );
}

/** Friendly Arabic message + the technical detail in an expandable section. */
export function Notice({ result, className }: { result: Result | null | undefined; className?: string }) {
  if (!result) return null;
  if (result.ok) {
    if (!result.message) return null;
    return (
      <p role="status" className={cn("flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400", className)}>
        <CircleCheckIcon className="size-4 shrink-0" /> {result.message}
      </p>
    );
  }
  return (
    <div role="alert" className={cn("rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm", className)}>
      <p className="flex items-start gap-1.5 font-medium text-destructive"><CircleAlertIcon className="mt-0.5 size-4 shrink-0" /> {result.error}</p>
      {result.detail && (
        <Collapsible className="mt-1">
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:underline">
            {ar.common.details} <ChevronDownIcon className="size-3" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre dir="ltr" className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-left text-xs whitespace-pre-wrap">{result.detail}</pre>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

export function Warn({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm text-amber-900 dark:text-amber-200", className)}>
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" /> <span>{children}</span>
    </p>
  );
}

export function CopyButton({ value, label = ar.common.copy, className }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button type="button" variant="outline" size="sm" className={className} onClick={async () => {
      try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ }
    }}>
      {done ? <CheckIcon /> : <CopyIcon />} {done ? ar.common.copied : label}
    </Button>
  );
}

export function Field({ label, help, htmlFor, children, className }: { label: ReactNode; help?: ReactNode; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

export function Mark({ level }: { level: "ok" | "warn" | "fail" | boolean | null | undefined }) {
  const l = level === true ? "ok" : level === false ? "fail" : level;
  if (l === "ok") return <span aria-label="ok" className="font-bold text-emerald-600">✓</span>;
  if (l === "warn") return <span aria-label="warning" className="font-bold text-amber-600">⚠</span>;
  if (l === "fail") return <span aria-label="fail" className="font-bold text-destructive">✗</span>;
  return <span className="text-muted-foreground">—</span>;
}

export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
