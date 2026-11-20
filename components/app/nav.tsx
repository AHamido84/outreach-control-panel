"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ar } from "@/content/ar";
import { cn } from "@/lib/utils";

export function CompanyNav({ slug }: { slug: string }) {
  const path = usePathname();
  const items = [["", ar.nav.overview], ["/data", ar.nav.data], ["/send", ar.nav.send], ["/status", ar.nav.status], ["/activity", ar.nav.activity], ["/settings", ar.nav.settings]] as const;
  return (
    <div className="mx-auto max-w-6xl overflow-x-auto px-4">
      <nav className="flex gap-1 pb-2 text-sm">
        {items.map(([p, l]) => {
          const href = `/c/${slug}${p}`;
          const active = p === "" ? path === href : path.startsWith(href);
          return (
            <Link key={p} href={href} aria-current={active ? "page" : undefined}
              className={cn("rounded-md px-2.5 py-1 whitespace-nowrap hover:bg-muted", active && "bg-muted font-medium")}>{l}</Link>
          );
        })}
      </nav>
    </div>
  );
}
