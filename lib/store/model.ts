import "server-only";
import { store } from "./store";
import { decrypt, encrypt, infoOf, keyFrom, type SecretEnvelope, type SecretInfo } from "@/lib/crypto/secrets";
import { newEngineKey } from "@/lib/crypto/seal";
import { env } from "@/lib/env";

// ============================== types ==============================

export type GoogleMode = "oauth" | "serviceAccount";

export type Defaults = {
  dailyCap: number;
  days: string[];
  startHour: number;
  endHour: number;
  perRun: number;
  gapSec: number;
  maxBounce: number;
  waitDays: number;
  timezone: string;
};

export type AppSettings = {
  setupDone: boolean;
  google: { mode: GoogleMode | null; oauthEmail?: string; serviceAccountEmail?: string; connectedAt?: string };
  admins: string[];
  defaults: Defaults;
  notifications: { emails: string[] };
};

export type Company = {
  slug: string;
  name: string;
  color: string;
  sheetUrl: string;
  sheetId: string;
  mondayAccount?: string;
  active: boolean;
  firstSendDate?: string;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_DEFAULTS: Defaults = {
  dailyCap: 15,
  days: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"],
  startHour: 9,
  endHour: 12,
  perRun: 2,
  gapSec: 90,
  maxBounce: 0.03,
  waitDays: 4,
  timezone: "Asia/Riyadh",
};

const DEFAULT_SETTINGS: AppSettings = {
  setupDone: false,
  google: { mode: null },
  admins: [],
  defaults: DEFAULT_DEFAULTS,
  notifications: { emails: [] },
};

// ============================== keys ==============================

const K = {
  settings: "app:settings",
  index: "company:index",
  company: (slug: string) => `company:${slug}`,
  secret: (scope: string, name: string) => `secret:${scope}:${name}`,
  googleErrors: "diag:googleErrors",
};

export type SecretName =
  | { scope: "app"; name: "googleRefreshToken" | "serviceAccountJson" }
  | { scope: `company:${string}`; name: "engineKey" | "mondayToken" };

// ============================== settings ==============================

export async function getSettings(): Promise<AppSettings> {
  const s = await store().get<AppSettings>(K.settings);
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    google: { ...DEFAULT_SETTINGS.google, ...s?.google },
    defaults: { ...DEFAULT_DEFAULTS, ...s?.defaults },
    notifications: { ...DEFAULT_SETTINGS.notifications, ...s?.notifications },
  };
}

export async function updateSettings(patch: (s: AppSettings) => AppSettings | void): Promise<AppSettings> {
  const s = await getSettings();
  const next = patch(s) || s;
  await store().set(K.settings, next);
  return next;
}

// ============================== companies ==============================

export async function listCompanies(): Promise<Company[]> {
  const slugs = (await store().get<string[]>(K.index)) || [];
  const all = await Promise.all(slugs.map((s) => store().get<Company>(K.company(s))));
  return all.filter((c): c is Company => !!c);
}

export async function getCompany(slug: string): Promise<Company | null> {
  return store().get<Company>(K.company(slug));
}

export async function saveCompany(c: Company): Promise<void> {
  const slugs = (await store().get<string[]>(K.index)) || [];
  if (!slugs.includes(c.slug)) await store().set(K.index, [...slugs, c.slug]);
  await store().set(K.company(c.slug), { ...c, updatedAt: new Date().toISOString() });
}

export async function removeCompany(slug: string): Promise<void> {
  const slugs = (await store().get<string[]>(K.index)) || [];
  await store().set(K.index, slugs.filter((s) => s !== slug));
  await store().del(K.company(slug));
  await store().del(K.secret(`company:${slug}`, "engineKey"));
  await store().del(K.secret(`company:${slug}`, "mondayToken"));
}

export function sheetIdFromUrl(url: string): string {
  const m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(url.trim()) ? url.trim() : "";
}

export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "c-" + Math.random().toString(36).slice(2, 8);
}

// ============================== secrets ==============================

function encKey() {
  // Mock mode without a key: a fixed dev key so the UI works out of the box.
  return keyFrom(process.env.ENCRYPTION_KEY || (env.mockSheets ? "mock-mode-dev-key-not-secret" : undefined));
}

export async function setSecret(s: SecretName, plaintext: string): Promise<SecretInfo> {
  const envl = encrypt(plaintext, encKey());
  await store().set(K.secret(s.scope, s.name), envl);
  return infoOf(envl);
}

export async function getSecret(s: SecretName): Promise<string | null> {
  const envl = await store().get<SecretEnvelope>(K.secret(s.scope, s.name));
  return envl ? decrypt(envl, encKey()) : null;
}

export async function secretInfo(s: SecretName): Promise<SecretInfo> {
  return infoOf(await store().get<SecretEnvelope>(K.secret(s.scope, s.name)));
}

export async function deleteSecret(s: SecretName): Promise<void> {
  await store().del(K.secret(s.scope, s.name));
}

export const engineKeyOf = (slug: string): SecretName => ({ scope: `company:${slug}`, name: "engineKey" });
export const mondayTokenOf = (slug: string): SecretName => ({ scope: `company:${slug}`, name: "mondayToken" });

export async function ensureEngineKey(slug: string): Promise<string> {
  const k = await getSecret(engineKeyOf(slug));
  if (k) return k;
  const nk = newEngineKey();
  await setSecret(engineKeyOf(slug), nk);
  return nk;
}

// ============================== diagnostics ==============================

export type GoogleError = { at: string; company?: string; op: string; status?: number; message: string };

export async function recordGoogleError(e: GoogleError) {
  try {
    const list = (await store().get<GoogleError[]>(K.googleErrors)) || [];
    list.unshift(e);
    await store().set(K.googleErrors, list.slice(0, 200));
  } catch {
    /* diagnostics must never break a request */
  }
}

export async function recentGoogleErrors(): Promise<GoogleError[]> {
  const list = (await store().get<GoogleError[]>(K.googleErrors)) || [];
  const since = Date.now() - 24 * 3600e3;
  return list.filter((e) => Date.parse(e.at) > since);
}

export const storeKind = () => store().kind;
