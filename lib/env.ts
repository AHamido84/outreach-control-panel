import "server-only";

/** Bootstrap env only. Everything else is configured from the UI. */
export const env = {
  get mockSheets() {
    if (process.env.MOCK_SHEETS === "1") return true;
    // Vercel Preview without real config → mock mode, so previews always build and render.
    if (process.env.VERCEL_ENV === "preview" && !process.env.AUTH_GOOGLE_ID) return true;
    return false;
  },
  /** A Vercel Preview with no real config: mock data, viewable without Google sign-in (previews sit behind Vercel's deployment protection). */
  get autoMockPreview() {
    return process.env.VERCEL_ENV === "preview" && !process.env.AUTH_GOOGLE_ID && process.env.MOCK_SHEETS !== "0";
  },
  get authDisabled() {
    return process.env.AUTH_DISABLED === "1" || this.autoMockPreview;
  },
  get ownerEmail() {
    return (process.env.OWNER_EMAIL || (this.mockSheets ? "owner@mock.local" : "")).trim().toLowerCase();
  },
  get googleClientId() {
    return process.env.AUTH_GOOGLE_ID || "";
  },
  get googleClientSecret() {
    return process.env.AUTH_GOOGLE_SECRET || "";
  },
  get upstash() {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    return url && token ? { url, token } : null;
  },
};

export const APP_VERSION = "0.1.0";

/**
 * Bootstrap variables that are missing for a real (non-mock) deployment.
 * When this is not empty the app shows a "configuration needed" page instead of failing.
 */
export function missingConfig(): string[] {
  if (env.mockSheets) return [];
  const need = ["ENCRYPTION_KEY", "AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "OWNER_EMAIL"].filter((k) => !process.env[k]);
  // on Vercel the filesystem is temporary: settings and secrets need Upstash
  if (process.env.VERCEL && !env.upstash) need.push("UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN");
  return need;
}

/** AUTH_DISABLED is only honoured together with MOCK_SHEETS. */
export function assertSafeConfig() {
  if (env.authDisabled && !env.mockSheets) {
    throw new Error("AUTH_DISABLED=1 is only allowed with MOCK_SHEETS=1");
  }
}
