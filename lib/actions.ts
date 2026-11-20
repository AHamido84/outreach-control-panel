import "server-only";
import { Forbidden } from "@/lib/auth/guards";
import { SheetsError } from "@/lib/google/transport";

export type ActionResult<T = unknown> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; detail?: string };

type Unwrap<R> = R extends { ok: true; data?: infer U } ? U : R extends { ok: false } ? never : R;

/** Runs a server action body; every failure comes back as a friendly Arabic message + technical detail. */
export async function act<R>(fn: () => Promise<R>, okMessage?: string): Promise<ActionResult<Unwrap<R>>> {
  try {
    const r = await fn();
    if (r && typeof r === "object" && "ok" in (r as object)) return r as unknown as ActionResult<Unwrap<R>>;
    return { ok: true, message: okMessage, data: r as Unwrap<R> };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_")) throw e; // redirect()/notFound()
    if (e instanceof Forbidden) return { ok: false, error: e.message };
    if (e instanceof SheetsError) return { ok: false, error: e.message, detail: e.detail || (e.status ? `HTTP ${e.status}` : undefined) };
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: "حصل خطأ ومقدرناش نكمّل", detail: msg };
  }
}

export const fail = (error: string, detail?: string): ActionResult<never> => ({ ok: false, error, detail });
