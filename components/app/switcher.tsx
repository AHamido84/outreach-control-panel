"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CompanySwitcher({ companies, current }: { companies: { slug: string; name: string; color: string }[]; current?: string }) {
  const router = useRouter();
  if (!companies.length) return null;
  return (
    <Select value={current ?? ""} onValueChange={(s) => router.push(`/c/${s}`)}>
      <SelectTrigger size="sm" className="min-w-40" aria-label="الشركة">
        <SelectValue placeholder="اختار شركة" />
      </SelectTrigger>
      <SelectContent>
        {companies.map((c) => (
          <SelectItem key={c.slug} value={c.slug}>
            <span className="size-2.5 rounded-full" style={{ background: c.color }} /> {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
