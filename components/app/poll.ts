"use client";

import type { CmdView } from "./command";

const FINAL = ["تم", "فشل", "ملغي"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls one command until it's final. onTick gets every status (for "waiting…" / stuck UI). */
export async function waitCommand(slug: string, id: string, onTick?: (c: CmdView | null, waitedMs: number) => void, signal?: { stop: boolean }): Promise<CmdView> {
  const t0 = Date.now();
  for (;;) {
    if (signal?.stop) throw new Error("اتوقف");
    try {
      const r = await fetch(`/api/c/${slug}/commands/${id}`, { cache: "no-store" });
      if (r.ok) {
        const c = (await r.json()) as CmdView;
        onTick?.(c, Date.now() - t0);
        if (FINAL.includes(c.status)) return c;
      } else onTick?.(null, Date.now() - t0);
    } catch { onTick?.(null, Date.now() - t0); }
    await sleep(3000);
  }
}
