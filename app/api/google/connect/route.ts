import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { currentUser } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { SHEETS_SCOPE } from "@/lib/google/real";

/** Mode A: a separate "Connect Google Sheets" consent (offline access, spreadsheets scope). Owner only. */
export async function GET(req: NextRequest) {
  const u = await currentUser();
  if (!u || u.role !== "owner") return NextResponse.redirect(new URL("/settings?tab=google&error=owner", req.url));
  if (!env.googleClientId || !env.googleClientSecret) return NextResponse.redirect(new URL("/settings?tab=google&error=client", req.url));
  const state = randomBytes(16).toString("base64url");
  (await cookies()).set("ocp_google_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/google", maxAge: 600 });
  const client = new OAuth2Client(env.googleClientId, env.googleClientSecret, new URL("/api/google/callback", req.url).toString());
  const url = client.generateAuthUrl({
    access_type: "offline", prompt: "consent", include_granted_scopes: true, state,
    scope: [SHEETS_SCOPE, "openid", "email"],
    login_hint: u.email,
  });
  return NextResponse.redirect(url);
}
