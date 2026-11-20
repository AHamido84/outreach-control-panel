import "server-only";

/** Bootstrap env only. Everything else is configured from the UI. */
export const env = {
  get mockSheets() {
    if (process.env.MOCK_SHEETS === "1") return true;
    // Vercel Preview without real config → mock mode, so previews always build and render.
    if (process.env.VERCEL_ENV === "preview" && !process.env.AUTH_GOOGLE_ID) return true;
    return false;
  },
  get authDisabled() {
    return process.env.AUTH_DISABLED === "1";
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

/** AUTH_DISABLED is only honoured together with MOCK_SHEETS. */
export function assertSafeConfig() {
  if (env.authDisabled && !env.mockSheets) {
    throw new Error("AUTH_DISABLED=1 is only allowed with MOCK_SHEETS=1");
  }
}
