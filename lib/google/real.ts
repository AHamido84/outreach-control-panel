import "server-only";
import { OAuth2Client, JWT } from "google-auth-library";
import { env } from "@/lib/env";
import { getSecret, getSettings, recordGoogleError } from "@/lib/store/model";
import { SheetsError, type CellValue, type InputOption, type SheetMeta, type SheetsTransport } from "./transport";

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

type TokenSource = { key: string; token: () => Promise<string> };
const g = globalThis as unknown as { __ocpToken?: TokenSource };

/** Access token for the configured connection (mode A: refresh token, mode B: service account). */
export async function accessToken(): Promise<string> {
  const s = await getSettings();
  if (s.google.mode === "serviceAccount") {
    const raw = await getSecret({ scope: "app", name: "serviceAccountJson" });
    if (!raw) throw new SheetsError("لسه مارفعتش ملف الـ Service Account");
    const key = "sa:" + raw.length + ":" + raw.slice(-24);
    if (g.__ocpToken?.key !== key) {
      const j = JSON.parse(raw) as { client_email: string; private_key: string };
      const jwt = new JWT({ email: j.client_email, key: j.private_key, scopes: [SHEETS_SCOPE] });
      g.__ocpToken = { key, token: async () => (await jwt.getAccessToken()).token! };
    }
    return g.__ocpToken.token();
  }
  if (s.google.mode === "oauth") {
    const rt = await getSecret({ scope: "app", name: "googleRefreshToken" });
    if (!rt) throw new SheetsError("حساب Google مش متوصّل — من الإعدادات ← اتصال Google");
    const key = "oauth:" + rt.slice(-24);
    if (g.__ocpToken?.key !== key) {
      const c = new OAuth2Client(env.googleClientId, env.googleClientSecret);
      c.setCredentials({ refresh_token: rt });
      g.__ocpToken = { key, token: async () => (await c.getAccessToken()).token! };
    }
    return g.__ocpToken.token();
  }
  throw new SheetsError("لسه مااخترتش طريقة الاتصال بـ Google Sheets");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(op: string, url: string, init: RequestInit = {}): Promise<T> {
  let lastErr: SheetsError | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    let res: Response;
    try {
      const token = await accessToken();
      res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, cache: "no-store" });
    } catch (e) {
      lastErr = e instanceof SheetsError ? e : new SheetsError(String((e as Error).message || e));
      if (e instanceof SheetsError) break;
      await sleep(backoff(attempt));
      continue;
    }
    if (res.ok) return (await res.json()) as T;
    const text = await res.text();
    let msg = text;
    try { msg = JSON.parse(text).error?.message || text; } catch { /* not json */ }
    lastErr = new SheetsError(friendly(res.status, msg), res.status, msg);
    if (res.status === 429 || res.status >= 500) { await sleep(backoff(attempt)); continue; }
    break;
  }
  await recordGoogleError({ at: new Date().toISOString(), op, status: lastErr?.status, message: lastErr?.detail || lastErr?.message || "?" });
  throw lastErr!;
}

const backoff = (n: number) => Math.min(8000, 500 * 2 ** n) + Math.random() * 300;

function friendly(status: number, msg: string): string {
  if (status === 403) return "مافيش صلاحية على الشيت ده — لو بتستخدم Service Account اعمله Share كـ Editor";
  if (status === 404) return "الشيت مش موجود أو اللينك غلط";
  if (status === 400 && /Unable to parse range/i.test(msg)) return "تاب أو عمود مش موجود في الشيت";
  if (status === 429) return "Google بيطلب نهدّى شوية (حد الطلبات) — جرّب كمان دقيقة";
  if (status === 401) return "صلاحية الاتصال بـ Google انتهت — اعمل Re-connect";
  return "حصل خطأ من Google Sheets";
}

export const realTransport: SheetsTransport = {
  async meta(sheetId): Promise<SheetMeta> {
    const j = await call<{ properties: { title: string; locale: string; timeZone: string }; sheets: { properties: { title: string } }[] }>(
      "meta", `${API}/${sheetId}?fields=properties(title,locale,timeZone),sheets.properties.title`);
    return { ...j.properties, tabs: j.sheets.map((s) => s.properties.title) };
  },
  async batchGet(sheetId, ranges) {
    const qs = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "FORMATTED_STRING", majorDimension: "ROWS" });
    ranges.forEach((r) => qs.append("ranges", r));
    const j = await call<{ valueRanges: { values?: CellValue[][] }[] }>("batchGet", `${API}/${sheetId}/values:batchGet?${qs}`);
    return j.valueRanges.map((v) => v.values || []);
  },
  async batchUpdate(sheetId, data, input: InputOption) {
    if (!data.length) return;
    await call("batchUpdate", `${API}/${sheetId}/values:batchUpdate`, {
      method: "POST", body: JSON.stringify({ valueInputOption: input, data: data.map((d) => ({ ...d, majorDimension: "ROWS" })) }),
    });
  },
  async append(sheetId, range, values, input: InputOption) {
    if (!values.length) return;
    const qs = new URLSearchParams({ valueInputOption: input, insertDataOption: "INSERT_ROWS" });
    await call("append", `${API}/${sheetId}/values/${encodeURIComponent(range)}:append?${qs}`, {
      method: "POST", body: JSON.stringify({ values, majorDimension: "ROWS" }),
    });
  },
};
