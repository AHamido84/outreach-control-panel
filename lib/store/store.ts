import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

export interface Store {
  readonly kind: "upstash" | "file";
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, opts?: { ttlSec?: number }): Promise<void>;
  del(key: string): Promise<void>;
  /** Atomic-enough "set if absent" for short locks. */
  setNx(key: string, value: string, ttlSec: number): Promise<boolean>;
}

const PREFIX = "ocp:";

class UpstashStore implements Store {
  readonly kind = "upstash" as const;
  constructor(private r: Redis) {}
  async get<T>(key: string) {
    return ((await this.r.get<T>(PREFIX + key)) ?? null) as T | null;
  }
  async set<T>(key: string, value: T, opts?: { ttlSec?: number }) {
    if (opts?.ttlSec) await this.r.set(PREFIX + key, value, { ex: opts.ttlSec });
    else await this.r.set(PREFIX + key, value);
  }
  async del(key: string) {
    await this.r.del(PREFIX + key);
  }
  async setNx(key: string, value: string, ttlSec: number) {
    return (await this.r.set(PREFIX + key, value, { nx: true, ex: ttlSec })) === "OK";
  }
}

/** Local development fallback: one JSON file in .data/. */
class FileStore implements Store {
  readonly kind = "file" as const;
  // Vercel's filesystem is read-only except /tmp (mock previews only — real deployments use Upstash)
  private file = process.env.VERCEL ? "/tmp/ocp-data/store.json" : path.join(process.cwd(), ".data", "store.json");
  private chain: Promise<unknown> = Promise.resolve();

  private async load(): Promise<Record<string, { v: unknown; exp?: number }>> {
    try {
      return JSON.parse(await fs.readFile(this.file, "utf8"));
    } catch {
      return {};
    }
  }
  private async save(data: Record<string, unknown>) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = this.file + "." + process.pid + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, this.file);
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => {});
    return next;
  }
  async get<T>(key: string) {
    const d = await this.load();
    const e = d[key];
    if (!e || (e.exp && e.exp < Date.now())) return null;
    return e.v as T;
  }
  set<T>(key: string, value: T, opts?: { ttlSec?: number }) {
    return this.serial(async () => {
      const d = await this.load();
      d[key] = { v: value, exp: opts?.ttlSec ? Date.now() + opts.ttlSec * 1000 : undefined };
      await this.save(d);
    });
  }
  del(key: string) {
    return this.serial(async () => {
      const d = await this.load();
      delete d[key];
      await this.save(d);
    });
  }
  setNx(key: string, value: string, ttlSec: number) {
    return this.serial(async () => {
      const d = await this.load();
      const e = d[key];
      if (e && (!e.exp || e.exp > Date.now())) return false;
      d[key] = { v: value, exp: Date.now() + ttlSec * 1000 };
      await this.save(d);
      return true;
    });
  }
}

const g = globalThis as unknown as { __ocpStore?: Store };

export function store(): Store {
  if (!g.__ocpStore) {
    const u = env.upstash;
    g.__ocpStore = u ? new UpstashStore(new Redis({ url: u.url, token: u.token })) : new FileStore();
  }
  return g.__ocpStore;
}
