import "server-only";
import { OAuth2Client } from "google-auth-library";
import { env } from "@/lib/env";
import { getSecret, listCompanies, setSecret, type Company } from "@/lib/store/model";

/**
 * Access = Google Sheets sharing. A signed-in user may work on a company only if their own Google account
 * can EDIT that company's sheet. Checked with the user's own token (stored encrypted, never sent to the browser)
 * and cached for 5 minutes, so removing someone from the sheet removes their access shortly after.
 */

export type SheetAccess = "edit" | "view" | "none" | "error";

const API = "https://sheets.googleapis.com/v4/spreadsheets";
const TTL = 5 * 60e3;
const g = globalThis as unknown as {
  __ocpAccess?: Map<string, { at: number; v: SheetAccess }>;
  __ocpUserTok?: Map<string, { token: string; exp: number }>;
};
const accessCache = () => (g.__ocpAccess ??= new Map());
const tokCache = () => (g.__ocpUserTok ??= new Map());
const userSecret = (email: string) => ({ scope: `user:${email}` as const, name: "googleRefreshToken" as const });

/** Called at sign-in with the tokens Google returned. */
export async function saveUserTokens(email: string, t: { refresh_token?: string | null; access_token?: string | null; expires_at?: number | null }) {
  const e = email.toLowerCase();
  if (t.refresh_token) await setSecret(userSecret(e), t.refresh_token);
  if (t.access_token) tokCache().set(e, { token: t.access_token, exp: (t.expires_at ? t.expires_at * 1000 : Date.now() + 50 * 60e3) - 60e3 });
  for (const k of [...accessCache().keys()]) if (k.startsWith(e + "|")) accessCache().delete(k); // fresh checks after sign-in
}

/** A valid access token for the user (refreshes with the stored refresh token). */
export async function userAccessToken(email: string): Promise<string | null> {
  const e = email.toLowerCase();
  const c = tokCache().get(e);
  if (c && c.exp > Date.now()) return c.token;
  const rt = await getSecret(userSecret(e));
  if (!rt) return null;
  try {
    const client = new OAuth2Client(env.googleClientId, env.googleClientSecret);
    client.setCredentials({ refresh_token: rt });
    const r = await client.getAccessToken();
    const exp = client.credentials.expiry_date ?? Date.now() + 50 * 60e3;
    if (!r.token) return null;
    tokCache().set(e, { token: r.token, exp: exp - 60e3 });
    return r.token;
  } catch {
    return null; // revoked or expired refresh token → the user has to sign in again
  }
}

type Fetch = typeof fetch;

/**
 * Edit / view / none for one sheet, using the user's token.
 * Edit is proven with a write that changes nothing (values.batchUpdate with no data);
 * if Google ever rejects that request shape (400), it falls back to re-setting the title to the same title.
 */
export async function probeSheet(token: string, sheetId: string, f: Fetch = fetch): Promise<SheetAccess> {
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const read = await f(`${API}/${sheetId}?fields=properties.title`, { headers: H, cache: "no-store" });
  if (read.status === 404 || read.status === 403) return "none";
  if (!read.ok) return "error";
  const title = ((await read.json()) as { properties?: { title?: string } }).properties?.title ?? "";
  const w = await f(`${API}/${sheetId}/values:batchUpdate`, { method: "POST", headers: H, cache: "no-store", body: JSON.stringify({ valueInputOption: "RAW", data: [] }) });
  if (w.ok) return "edit";
  if (w.status === 403) return "view";
  if (w.status === 400) {
    const t = await f(`${API}/${sheetId}:batchUpdate`, { method: "POST", headers: H, cache: "no-store",
      body: JSON.stringify({ requests: [{ updateSpreadsheetProperties: { properties: { title }, fields: "title" } }] }) });
    if (t.ok) return "edit";
    if (t.status === 403) return "view";
  }
  return "error";
}

/** Cached access of a user to a sheet. `token` lets sign-in check before tokens are stored. */
export async function sheetAccess(email: string, sheetId: string, token?: string): Promise<SheetAccess> {
  if (env.mockSheets) return "edit"; // mock sheets have no sharing
  const key = `${email.toLowerCase()}|${sheetId}`;
  const c = accessCache().get(key);
  if (c && Date.now() - c.at < TTL) return c.v;
  const t = token ?? (await userAccessToken(email));
  if (!t) return "error";
  let v: SheetAccess;
  try { v = await probeSheet(t, sheetId); } catch { v = "error"; }
  if (v !== "error") accessCache().set(key, { at: Date.now(), v });
  return v;
}

/** Companies the user can work on: all for the owner; active companies whose sheet they can edit for everyone else. */
export async function companiesFor(email: string, isOwner: boolean, token?: string): Promise<Company[]> {
  const all = await listCompanies();
  if (isOwner) return all;
  const active = all.filter((c) => c.active);
  const res = await Promise.all(active.map((c) => sheetAccess(email, c.sheetId, token)));
  return active.filter((_, i) => res[i] === "edit");
}

export function forgetAccess(email: string) {
  const e = email.toLowerCase();
  for (const k of [...accessCache().keys()]) if (k.startsWith(e + "|")) accessCache().delete(k);
  tokCache().delete(e);
}
