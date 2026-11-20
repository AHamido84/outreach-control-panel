import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { currentUser } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { setSecret, updateSettings, recordGoogleError } from "@/lib/store/model";

export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL("/settings?tab=google&" + q, req.url));
  const u = await currentUser();
  if (!u || u.role !== "owner") return back("error=owner");
  const jar = await cookies();
  const state = jar.get("ocp_google_state")?.value;
  jar.delete("ocp_google_state");
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back("error=" + encodeURIComponent(p.get("error")!));
  if (!state || state !== p.get("state") || !p.get("code")) return back("error=state");
  try {
    const client = new OAuth2Client(env.googleClientId, env.googleClientSecret, new URL("/api/google/callback", req.url).toString());
    const { tokens } = await client.getToken(p.get("code")!);
    if (!tokens.refresh_token) return back("error=no_refresh_token");
    let email = "";
    if (tokens.id_token) {
      const t = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.googleClientId });
      email = t.getPayload()?.email || "";
    }
    await setSecret({ scope: "app", name: "googleRefreshToken" }, tokens.refresh_token);
    await updateSettings((s) => { s.google = { ...s.google, mode: "oauth", oauthEmail: email, connectedAt: new Date().toISOString() }; });
    return back("connected=1");
  } catch (e) {
    await recordGoogleError({ at: new Date().toISOString(), op: "oauth-callback", message: (e as Error).message });
    return back("error=exchange");
  }
}
