import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { assertSafeConfig, env, missingConfig } from "@/lib/env";
import { ensureMockBootstrap } from "@/lib/mock/bootstrap";
import { auth, isAllowed } from "./auth";

export type User = { email: string; name?: string; role: "owner" | "admin" };

export class Forbidden extends Error {}

/** The signed-in, allowed user — or null. Re-checks the allowed list on every request. */
export async function currentUser(): Promise<User | null> {
  await connection(); // always per request: config, session and sheet data are never prerendered at build time
  assertSafeConfig();
  if (missingConfig().length) return null; // → /login, which explains what to configure
  if (env.authDisabled) return { email: env.ownerEmail, name: "Owner (mock)", role: "owner" };
  const s = await auth();
  const email = s?.user?.email?.toLowerCase();
  if (!email || !(await isAllowed(email))) return null;
  return { email, name: s?.user?.name || undefined, role: email === env.ownerEmail ? "owner" : "admin" };
}

/** Pages: redirect to /login when not allowed. */
export async function requireAdmin(): Promise<User> {
  await connection();
  if (missingConfig().length) redirect("/login");
  await ensureMockBootstrap(); // mock mode: demo companies exist before any page reads the registry
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireOwner(): Promise<User> {
  const u = await requireAdmin();
  if (u.role !== "owner") redirect("/settings?denied=1");
  return u;
}

/** Server actions / route handlers: throw instead of redirecting. */
export async function assertAdmin(): Promise<User> {
  await ensureMockBootstrap();
  const u = await currentUser();
  if (!u) throw new Forbidden("لازم تسجّل دخول بحساب مسموح له");
  return u;
}

export async function assertOwner(): Promise<User> {
  const u = await assertAdmin();
  if (u.role !== "owner") throw new Forbidden("الإعداد ده لصاحب الحساب بس");
  return u;
}
