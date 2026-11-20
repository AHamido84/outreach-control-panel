import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/store/model";

export async function isAllowed(email?: string | null): Promise<boolean> {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  if (e === env.ownerEmail) return true;
  const s = await getSettings();
  return s.admins.map((a) => a.toLowerCase()).includes(e);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET || (env.mockSheets ? "mock-mode-auth-secret-not-secret" : undefined),
  trustHost: true,
  providers: [Google({ clientId: env.googleClientId, clientSecret: env.googleClientSecret })],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user }) {
      return isAllowed(user.email);
    },
  },
});
