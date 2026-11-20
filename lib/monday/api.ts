import "server-only";
import { env } from "@/lib/env";

/** Validates a monday token server-side (`me { name }`). In mock mode: any token ≥ 20 chars without "bad". */
export async function validateMondayToken(token: string): Promise<{ name: string }> {
  const t = token.trim();
  if (env.mockSheets) {
    if (t.length < 20 || /bad|invalid/i.test(t)) throw new Error("monday رفض التوكن (Not Authenticated)");
    return { name: "Mock monday user" };
  }
  const r = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { Authorization: t, "Content-Type": "application/json", "API-Version": "2024-10" },
    body: JSON.stringify({ query: "query { me { name } }" }),
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as { data?: { me?: { name: string } }; errors?: unknown; error_message?: string };
  if (!r.ok || j.errors || j.error_message || !j.data?.me) {
    throw new Error("monday رفض التوكن: " + (j.error_message || JSON.stringify(j.errors || r.status)).slice(0, 200));
  }
  return { name: j.data.me.name };
}
