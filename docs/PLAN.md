# Outreach Control Panel — Plan (workflow step 1)

This is the proposal you asked for in `PROMPT.md` step 1: the page map, the settings model and the data-access layer. Nothing gets built until you approve it.

---

## 0. What I learned from `Code.gs` v2 and the Master sheet

The contract in `PROMPT.md` matches the engine. A few details shape how the dashboard has to be built:

| # | Finding | What the dashboard does about it |
|---|---|---|
| 1 | The engine reads `Commands` once a minute, runs due commands **in row order** in one lock, and stops starting new ones after 4 min. | I can queue `import` then `process` together, and they run back to back. Users should expect a wait of about 60–90 s before anything happens. |
| 2 | `Import` is **one shared staging area**: row 2 holds the headers, data starts at row 3, and the tab is cleared only after a successful import. | Chunks are written **one at a time**: write chunk N, queue `import`, wait for `تم`, then write chunk N+1. A lock per company in Redis stops two admins importing into the same company at once. If an import fails, the dashboard clears row 3 onward itself, with the user's confirmation. |
| 3 | In `importFromSheet`, a header that is already a Leads header is used directly, even when Field Mapping has no row for it. | The dashboard writes the **mapped (unified) header names** into Import row 2, so the result doesn't depend on Field Mapping. New mapping pairs are still saved to Field Mapping, but only to drive auto-suggest next time. |
| 4 | Rows from a source whose `مفعّل = لا` are skipped without notice, and the source code must already exist in `Sources`. | The wizard blocks inactive sources and creates any new Source row **before** writing to Import. |
| 5 | `pickEmail_` drops invalid addresses at import time, so import never returns `إيميل غلط`. Only `process` sets that, for emails added later. | The preview shows "bad email" when the cell had text but no valid address. Next to it, it says what the engine will actually do (`مافيش إيميل`, or `جديد` + website extraction when there's a site). |
| 6 | `writeSystem_` clears `System` and then rewrites it. A read in between finds it empty. | An empty `System` is treated as "refreshing" and the last good snapshot is kept, so it doesn't trigger an alarm. |
| 7 | `النتيجة` is cut at 45,000 characters, which would make a very large `send` result invalid JSON. | The parser tolerates that. Per-lead rows always come from `Send Results`, not from `results[]`. |
| 8 | `Segments!J2` (إجمالي النصيب) and the `Dashboard` tab are formulas, and `Templates!G` ("المتغيرات المتاحة") is a reference column, not data. | The editors write only the data columns (Segments A–H, Templates A–E). Those cells are never touched. |
| 9 | `Send Results.الوقت` and `Log.الوقت` are formatted in the **script** time zone. `today_()` uses the **Company** time zone. Date cells read back in the **spreadsheet** time zone. | The date layer handles all three explicitly. Charts bucket days in the company time zone. |
| 10 | Cancelling can race with the engine. The engine re-checks `الحالة` before it sets `جاري التنفيذ`, so the window is small. | Cancel re-reads the row, checks the ID and `في الانتظار`, writes `ملغي`, then re-reads again. If the engine won the race, the UI says "already started". |

### ⚠ One likely real bug in `Code.gs` (not changed, needs your decision)

**Phone numbers lose their leading zero on import.** `importFromSheet` copies values as strings (`String(row[j+1]).trim()`), then writes them to Leads with `setValues`. Apps Script interprets strings the way a user typing them would, so `0501234567` becomes the number `501234567`, and `+966…` may also be turned into a number. The engine already guards against this for the board ID (`"'" + boardId`), but not for phones.

- **Option A (recommended):** a two-line fix in `importFromSheet` that prefixes `التليفون` with `'` before `setValues`, plus a test in `test-v2.js`.
- **Option B:** no engine change. The dashboard writes phones to Import as `'0501…` (RAW), so the apostrophe survives until the engine's `setValues`, which then stores the value as text. This works, but it is a workaround that depends on undocumented behaviour.

Nothing else I found is a bug. Small things I'm deliberately leaving alone: start hour `0` falls back to 9 (`|| 9`), and a run where every row is from an inactive source never clears Import.

---

## 1. Page map

All UI is Arabic RTL. All copy lives in `content/ar.ts`.

```
/login                          Google sign-in (Auth.js v5)
/setup                          First-run wizard (owner only; redirected to while setup isn't done)
  ├─ 1 Google connection        mode A (connect account) / mode B (upload SA JSON) → test
  ├─ 2 First company            sheet URL → tab/header check → "paste Code.gs + run إعداد أول مرة" help
  ├─ 3 Link engine              ENGINE_KEY + copy + menu path → poll System.dashboardLinked
  ├─ 4 Sender email             (same component as company Sender tab) + deliverability
  ├─ 5 monday (optional)        (same component as company monday tab)
  └─ 6 Done                     → /c/[slug]

/companies                      registry: add/edit, test, reveal/regenerate ENGINE_KEY, onboarding checklist (8 steps)
/settings                       app settings (admins; Google + Access = owner only)
  ?tab=google|access|defaults|notifications|diagnostics

/c/[slug]                       Overview: KPIs, 14-day sent chart, funnel, by source/segment, latest commands + Log, quick actions
/c/[slug]/data                  ?tab=import|leads|dnc
/c/[slug]/send                  Manual · Scheduled · Automatic · Results panel (polls every 5 s while a command is active)
/c/[slug]/status                Outreach tracker + "needs attention" view
/c/[slug]/activity              Commands (parsed results, cancel) + Log
/c/[slug]/settings              ?tab=profile|sender|schedule|monday|booking|content|advanced
                                content sub-tabs: segments|sequence|templates|sources|mapping|lists
                                Unknown Company keys → "إعدادات إضافية" section in Advanced (generic text fields)
```

**Header** (all `/c/*` pages): company switcher (name + color dot) · status pill built from `System` (engine alive / sending / in window / sender verified / monday) · "open sheet" link · user menu.
**Global banners:** failed commands, heartbeat older than 10 min, bounce-guard stop (a `bounceGuard` row in `Log`, or `sendingEnabled` flipping to `لا`), and "engine looks stopped" when a command has been pending more than 3 min (links to Advanced).

**Server surface:**
- **Reads:** Route Handlers under `/api/c/[slug]/…`, because the client polls them (`overview`, `leads?page&q&filters`, `commands?since`, `results?commandId`, `system`).
- **Mutations:** Server Actions. Each one calls `requireAdmin()` / `requireOwner()` again before doing anything.
- **Google:** `/api/google/connect` and `/api/google/callback` (Sheets OAuth), plus `/api/auth/[...nextauth]`.
- **Guard:** middleware blocks everything except `/login` and the auth routes when there's no session, and redirects to `/setup` until setup is done.

---

## 2. Settings model (app config store)

There's one `Store` interface (`get/set/del/keys`) with two backends: `UpstashStore` when the Upstash env vars are present, otherwise `FileStore` at `.data/store.json`.

```ts
// key: app:settings
type AppSettings = {
  setupDone: boolean;
  google: { mode: 'oauth' | 'serviceAccount' | null;
            oauthEmail?: string; serviceAccountEmail?: string; connectedAt?: string };
  admins: string[];                       // OWNER_EMAIL is implicit, never stored, never removable
  defaults: { dailyCap: 15; days: string[]; startHour: 9; endHour: 12;
              perRun: 2; gapSec: 90; maxBounce: 0.03; timezone: 'Asia/Riyadh' };
  notifications: { emails: string[] };
};

// key: company:index → string[] (slugs, ordered)
// key: company:<slug>
type Company = {
  slug: string; name: string; color: string;
  sheetUrl: string; sheetId: string;      // ID extracted from URL
  mondayAccount?: string;                 // for item links: https://<account>.monday.com/...
  active: boolean;
  firstSendDate?: string;                 // YYYY-MM-DD, drives warm-up advice
  createdAt: string; updatedAt: string;
};

// secrets: key secret:<scope>:<name> → SecretEnvelope (AES-256-GCM with ENCRYPTION_KEY)
type SecretEnvelope = { v: 1; iv: string; tag: string; ct: string; last4: string; updatedAt: string };
//   secret:app:googleRefreshToken
//   secret:app:serviceAccountJson
//   secret:company:<slug>:engineKey      (32 random bytes, base64url)
//   secret:company:<slug>:mondayToken

// key: diag:googleErrors → capped list (last 200, shown for the last 24 h) {at, company, op, status, message}
// key: lock:import:<slug> → short TTL lock
```

- **Browser exposure:** `SecretEnvelope` never leaves the server. The UI only receives `{ set: boolean, last4, updatedAt }`. ENGINE_KEY is the one secret shown in full, through an explicit owner-only "Reveal" action, because the owner has to paste it into the sheet.
- **Per-company settings** (sender, schedule, monday board, templates and so on) are **not** in Redis. They live only in the sheet's `Company` tab and the content tabs. Redis holds just the registry and secrets, as the prompt requires.
- **Defaults** only fill **empty** Company-tab values when a company is added. They never overwrite existing ones.

---

## 3. Data-access layer

```
lib/
  auth/            Auth.js config, requireUser/requireAdmin/requireOwner, allowed-list check
  store/           Store interface, UpstashStore, FileStore, secrets.ts (AES-GCM), settings.ts, companies.ts
  crypto/seal.ts   seal(plaintext, engineKey) → {n,c,t}   (HMAC-SHA256 keystream, matches openSealed_)
  google/
    auth.ts        getAccessToken(): OAuth refresh-token flow or service-account JWT (google-auth-library)
    transport.ts   SheetsTransport interface { get, batchGet, batchUpdate, append }
                   RealTransport (fetch + retry 429/5xx with exp. backoff + jitter, errors → diag log)
                   MockTransport (in-memory workbook, same A1 semantics)
  sheets/
    index.ts       sheetsFor(company) → CompanySheets      ← the ONLY entry point
    meta.ts        spreadsheets.get (tab titles, locale, timeZone) cached 10 min
    table.ts       readTables([...tabs]) → one values.batchGet
                   (UNFORMATTED_VALUE + FORMATTED_STRING), header→index map, rows as objects with _row
    dates.ts       normalize formatted dates using spreadsheet locale (+ Arabic-Indic digits) → ISO
    write.ts       setCells([{tab,row,header,value}]) → values.batchUpdate, one A1 cell each
                   appendRows(tab, objects) → values.append in header order (INSERT_ROWS)
                   USER_ENTERED by default; phones/IDs written as text ('-prefixed); Commands = RAW
    guards.ts      updateLeadCells(leadId, changes): re-read row → check ID still matches → write → invalidate
    cache.ts       per-(sheetId, tab) TTL cache + in-flight de-dupe; invalidated by every write
    commands.ts    enqueue(type, payload, {at?}) · cancel(id) · list() · get(id) · pendingTooLong()
    company.ts     Company-tab key/value read/write (by label in col A; append missing label)
  engine-port/     exact ports from Code.gs (tested side by side against Code.gs in a vm):
                   norm_, normalizeUrl_, domainOf_, isValidEmail_, pickEmail_, knownContacts_/dedup,
                   matchSegment_, fillTemplate_ (+ signature), planNextStep_ (A/B pick), inSendWindow_
  dns/check.ts     SPF / DKIM (google + custom selector) / DMARC / MX via node:dns/promises
  monday/api.ts    validate token server-side: query { me { name } }
  mock/            fixture workbook (from apps-script/test/wb.json + realistic extra rows) + fake engine
```

**`CompanySheets` (what pages call):**
`system()` · `company()` / `setCompany(changes)` · `leads(query)` · `updateLead(id, changes)` · `bulk(action, ids)` · `dnc()` / `addDnc()` / `removeDnc()` · `content(tab)` / `saveContent(tab, edits)` · `commands()` / `enqueue()` / `cancel()` · `results(commandId?)` · `log()` · `writeImportChunk()` / `clearImport()` · `validateStructure()` (required tabs and headers, for the wizard and Test connection).

**Cache TTLs:** a single 20–60 s TTL clashes with polling every 5 s, so there are two tiers:
- `Commands`, `Send Results`, `System`: 5 s.
- `Leads`, `Log`: 20 s.
- Config tabs (Company, Segments, Sequence, Templates, Sources, Field Mapping, Lists, DNC): 60 s.

The client polls only while a command is pending or running, or while the wizard is waiting. That keeps us well under the Sheets quota (60 reads per user per minute).

**Write rules, enforced inside `write.ts`:**
- Only the cells the user changed are written, never whole rows or ranges.
- Columns the engine owns are rejected for writing: `Commands` status/execution columns (except `ملغي`), all of `Send Results` and `System`, and the Leads state columns except the bulk "re-queue as جاهز", which writes only `حالة التواصل`.
- Rows are added with `values.append`.

**Dates:** I'll use `FORMATTED_STRING` + locale normalization as specified. I'd suggest one deviation: for **known date columns**, also request `SERIAL_NUMBER` in the same batch. It is locale-proof and doesn't depend on parsing Arabic month names. Say "no" and I'll stick to `FORMATTED_STRING` only.

### Mock mode (`MOCK_SHEETS=1`, optional `AUTH_DISABLED=1`)

- **Sheets:** `MockTransport` implements `batchGet`, `batchUpdate` and `append` on an in-memory workbook. That means the **real data-access layer** runs in mock mode, not a parallel fake.
- **Engine:** the fake engine **is the real `Code.gs`**. It runs in a Node `vm` with Apps Script shims (built on `harness.js`) bound to that same in-memory workbook, so commands, `Send Results` and `System` are produced by the actual engine logic.
- **External services:** Gmail and monday are fake. monday fails for about 1 lead in 5, so ✗/Retry can be tested. A ticker runs `runCommands` every 10 s and `heartbeat` periodically.
- **Persistence:** the workbook is saved to `.data/mock-<slug>.json` so state survives restarts. Two mock companies are included.
- **Safety:** `AUTH_DISABLED=1` is refused at startup unless `MOCK_SHEETS=1`. Vercel Previews with no real env vars fall back to mock mode, and a visible "وضع تجريبي" banner shows on every page.

---

## 4. Tech choices

- **Stack:** latest stable Next.js App Router, TypeScript strict, Tailwind, shadcn/ui (RTL), Auth.js v5, `@upstash/redis`, `google-auth-library`.
- **Import parsing:** `papaparse` + `xlsx` (SheetJS) in the browser.
- **Charts:** recharts.
- **Tests:** vitest for the unit tests. This includes a **side-by-side test**: each ported function runs against `Code.gs` in a `vm` on the same inputs and must give the same output. There's also the seal compatibility test (Arabic plaintext → `openSealed_`), and the existing `apps-script/test` suites run in CI.
- **Browser checks:** Playwright drives the mock-mode click-through and takes mobile and desktop screenshots of every page.

---

## 5. Delivery

1. **This PR:** the plan only.
2. **After approval, step 2:** the app in mock mode, in small commits (scaffold → store/crypto → data layer + mock → auth/setup → pages → tests/screenshots), then a PR for review.
3. **Step 3:** connect one real company, then update the Arabic README.

## Decisions needed from you

1. **The phone leading-zero bug:** Option A (fix in `Code.gs` + test) or Option B (dashboard workaround)?
2. **Dates:** OK to request `SERIAL_NUMBER` for known date columns in addition to `FORMATTED_STRING`?
3. Anything to add or change in the page map or the settings model?
