import "server-only";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { assertSafeConfig, env, missingConfig } from "@/lib/env";
import { ensureMockBootstrap } from "@/lib/mock/bootstrap";
import { getCompany, listCompanies, type Company } from "@/lib/store/model";
import { companiesFor } from "./access";
import { auth } from "./auth";

/**
 * Access model: Google Sheets sharing.
 * - Anyone whose Google account can EDIT at least one company sheet can sign in.
 * - Everyone who is in has full permissions and sees every company (settings included).
 * - OWNER_EMAIL always gets in (so the owner can never be locked out).
 * The check is re-done on every request (cached 5 min), so removing someone from the sheets removes their access.
 */
export type User = { email: string; name?: string; role: "owner" | "member" };

export class Forbidden extends Error {}

/** The signed-in user with access to at least one company sheet — or null. */
export async function currentUser(): Promise<User | null> {
  await connection(); // always per request: config, session and sheet data are never prerendered at build time
  assertSafeConfig();
  if (missingConfig().length) return null; // → /login, which explains what to configure
  if (env.authDisabled) return { email: env.ownerEmail, name: "Owner (mock)", role: "owner" };
  const s = await auth();
  const email = s?.user?.email?.toLowerCase();
  if (!email) return null;
  if (email === env.ownerEmail) return { email, name: s?.user?.name || undefined, role: "owner" };
  if (!(await companiesFor(email, false)).length) return null;
  return { email, name: s?.user?.name || undefined, role: "member" };
}

/** Pages: redirect to /login when not allowed. */
export async function requireUser(): Promise<User> {
  await connection();
  if (missingConfig().length) redirect("/login");
  await ensureMockBootstrap(); // mock mode: demo companies exist before any page reads the registry
  const u = await currentUser();
  if (!u) redirect("/login?error=noaccess");
  return u;
}

/** Pages under /c/[slug]: signed-in user + existing company. */
export async function requireCompany(slug: string): Promise<{ user: User; company: Company }> {
  const user = await requireUser();
  const company = await getCompany(slug);
  if (!company) notFound();
  return { user, company };
}

/** Server actions / route handlers: throw instead of redirecting. */
export async function assertUser(): Promise<User> {
  await ensureMockBootstrap();
  const u = await currentUser();
  if (!u) throw new Forbidden("لازم تسجّل دخول بحساب ليه صلاحية تعديل على شيت شركة");
  return u;
}

export async function assertCompany(slug: string): Promise<{ user: User; company: Company }> {
  const user = await assertUser();
  const company = await getCompany(slug);
  if (!company) throw new Forbidden("الشركة مش موجودة");
  return { user, company };
}

/** Everyone who is in sees every company. */
export function visibleCompanies(_u: User) {
  void _u;
  return listCompanies();
}
