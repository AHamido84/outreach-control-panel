import "server-only";
import { env } from "@/lib/env";
import { ensureEngineKey, listCompanies, saveCompany, setSecret, mondayTokenOf, updateSettings } from "@/lib/store/model";
import { MOCK_COMPANIES } from "./seed";

const g = globalThis as unknown as { __ocpMockBoot?: Promise<void> };

/** Mock mode: register the two demo companies on first run. No-op otherwise. */
export function ensureMockBootstrap(): Promise<void> {
  if (!env.mockSheets) return Promise.resolve();
  return (g.__ocpMockBoot ??= (async () => {
    if ((await listCompanies()).length) return;
    const now = new Date().toISOString();
    for (const c of MOCK_COMPANIES) {
      await saveCompany({
        slug: c.slug, name: c.name, color: c.color, sheetId: c.sheetId,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${c.sheetId}/edit`, mondayAccount: c.mondayAccount || undefined,
        active: true, firstSendDate: c.slug === "arab-computers" ? new Date(Date.now() - 9 * 864e5).toISOString().slice(0, 10) : undefined,
        createdAt: now, updatedAt: now,
      });
      await ensureEngineKey(c.slug);
    }
    await setSecret(mondayTokenOf("arab-computers"), "mock-monday-token-0000000000000000");
    await updateSettings((s) => { s.setupDone = true; s.admins = ["teammate@mock.local"]; s.notifications.emails = ["alerts@mock.local"]; });
  })().catch((e) => { g.__ocpMockBoot = undefined; throw e; }));
}
