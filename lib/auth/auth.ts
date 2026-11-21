import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { env } from "@/lib/env";
import { SHEETS_SCOPE } from "@/lib/google/real";
import { companiesFor, saveUserTokens } from "./access";

/**
 * Google sign-in also asks for the Sheets permission, so the dashboard can check — with the user's own
 * account — which company sheets they can edit. Tokens are stored encrypted on the server, never in the cookie.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET || (env.mockSheets ? "mock-mode-auth-secret-not-secret" : undefined),
  trustHost: true,
  providers: [
    Google({
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      authorization: { params: { scope: `openid email profile ${SHEETS_SCOPE}`, access_type: "offline", prompt: "consent", include_granted_scopes: "true" } },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user, account }) {
      const email = user.email?.toLowerCase();
      if (!email || !account) return false;
      await saveUserTokens(email, account);
      if (email === env.ownerEmail) return true;
      if (!String(account.scope || "").includes(SHEETS_SCOPE)) return "/login?error=scope";
      const cs = await companiesFor(email, false, account.access_token ?? undefined);
      return cs.length ? true : "/login?error=noaccess";
    },
  },
});
