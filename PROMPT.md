# Task
Create a **new, standalone project** called **Outreach Control Panel** in this repo. It's completely separate from my existing booking site: new repo, new Vercel project, don't touch the booking code.

It's a private web dashboard to manage cold-email outreach for multiple companies. Each company has its own Google Sheet ("Outreach Engine") with an Apps Script engine bound to it that does the actual sending.

**The dashboard talks to Google Sheets only, through the Google Sheets API.** It reads and writes data, settings and commands in the sheet. The Apps Script engine picks up commands from the sheet, runs them, and writes results back. No Apps Script Web App, and no other database for leads or settings. The sheet is the single source of truth for leads and per-company settings.

**Everything must be configurable from the UI:** Google connection, sender email, monday, sending schedule, templates, and app access. Environment variables are only for the minimum bootstrap.

From the dashboard I need to:
- pick the company I'm working on
- add and clean email data into that company's sheet
- configure everything
- send manually, on a schedule, or automatically
- see the result of every send, including whether the lead was added to monday.com

# The engine is already done: `apps-script/Code.gs` (v2)
Read all of it first. **Don't rewrite it.** Only touch it if you find a real bug, and tell me before changing anything. Its tests are in `apps-script/test/` (`node test.js && node test-v2.js`), and they must keep passing. It reads every tab **by column header names** (Arabic). Its contract with the dashboard:

**Tabs**
- Existing: `اقرأني`, `Dashboard`, `Company`, `Sources`, `Field Mapping`, `Import`, `Leads`, `Segments`, `Sequence`, `Templates`, `Do-Not-Contact`, `Log`, `Lists`. See `reference/Outreach_Engine_Master.xlsx`.
- Created by `setup()` / `ensureDashboardTabs_()`:
  - **`Commands`**: ID | النوع | البيانات | موعد التنفيذ | الحالة | تاريخ الإنشاء | تاريخ التنفيذ | النتيجة | المنشئ
  - **`Send Results`**: Command ID | الوقت | Lead ID | الإيميل | الخطوة | القالب/النسخة | تم الإرسال (نعم/لا/معاينة) | الخطأ | Thread ID | monday (تم/فشل/غير مفعّل) | خطأ monday
  - **`System`**: المفتاح | القيمة | الوصف. Keys:
    - `heartbeat` (epoch ms), `version`
    - `gmailAccount`, `sender`, `senderVerified`, `aliases`, `gmailQuota`, `gmailApi`
    - `mondayToken`, `mondayBoard`
    - `triggers`, `missingTriggers`
    - `sendingEnabled`, `inWindow`, `sentToday`, `dailyCap`
    - `lastProcessLeads`, `lastSendQueue`, `lastWatchTick`, `lastRunCommands` (epoch ms)
    - `lastError`, `dashboardLinked`, `timezone`

    Yes/no values are `نعم` / `لا`.
- **Leads columns:** ID, تاريخ الإضافة, كود المصدر, اسم الجهة, اسم الشخص, المنصب, الإيميل, الموقع, التليفون, النشاط, المدينة, البلد, اللغة, كود الـ Segment, حالة المعالجة, monday Item ID, ملاحظات. Plus the state columns: حالة التواصل, الخطوة الحالية, النسخة, تاريخ أول إرسال, تاريخ آخر إرسال, المتابعة الجاية, Thread ID, ميعاد الجلسة, **حالة monday** (تم / فشل: السبب / empty).
- **Status values:**
  - حالة المعالجة: جديد / اتنقل لـ monday / مكرر / مافيش إيميل / إيميل غلط / في Do-Not-Contact
  - حالة التواصل: جاهز / تم الإرسال / متابعة N / رد / حجز جلسة / مافيش رد / Bounce / طلب الإزالة

**Commands.** The dashboard appends a row with:
- `ID` unique
- `النوع`
- `البيانات` = JSON, written **RAW**
- `موعد التنفيذ` = empty (now) or an ISO UTC string, written **RAW**
- `الحالة` = `في الانتظار`
- `تاريخ الإنشاء` = ISO
- `المنشئ` = admin email

The `runCommands` trigger runs every minute. It sets `جاري التنفيذ`, then `تم` or `فشل`, and writes `النتيجة` as JSON (`summary`, or `error`). Cancelling = the dashboard sets الحالة to `ملغي` while it's still pending. A command stuck running for more than 10 minutes becomes `فشل`.

Types and payloads:
- `import {}`: runs on what the dashboard wrote to the Import tab: source headers in row 2 from column B, data from row 3, source code in column A. Returns `{rows, added, duplicate, noEmail, dnc, summary}`.
- `process {}`: extracts emails from websites, assigns Segments, syncs monday. Returns `{extracted, segmented, synced, mondayFailed, summary}`.
- `send {count, leadIds?, segment?, dryRun?, ignoreWindow?, ignoreEnabled?}`: writes one `Send Results` row per lead, with Command ID = the command's ID. Returns `{sent, failed, results[], summary}`.
- `sendTest {to, leadId?, template?, version?}`: subject prefixed with [TEST]. No lead state changes.
- `retryMonday {leadIds?}`: empty = all leads where حالة monday starts with فشل.
- `testMonday {}`: returns `{account, board, boardReachable, missingColumns}`.
- `checkSender {}`: returns `{account, sender, aliases, verified, quota}`.
- `setMondayToken {sealed:{n,c,t}}`: the engine wipes البيانات to `***` right after reading.
- `setup {}`: reinstalls tabs and triggers, and monday columns if configured.
- `heartbeat {}`: refreshes `System`.

**Token sealing** (must match `openSealed_` in Code.gs exactly):
- `key` = the company's ENGINE_KEY string.
- `n` = random 16 bytes, base64.
- keystream block i = HMAC-SHA256(key, `n + ':' + i`), 32 bytes per block.
- `c` = base64(UTF-8 plaintext XOR keystream).
- `t` = base64(HMAC-SHA256(key, `n + ':' + c`)).

The owner pastes ENGINE_KEY into the sheet once, through the menu **Outreach ← ربط الداشبورد (ENGINE_KEY)**.

# Architecture
1. **Dashboard:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, deployed on Vercel.
2. **App config store:** Upstash Redis (Vercel Marketplace, free tier). It holds app settings, the company registry, and secrets.
   - Secrets are encrypted at rest with AES-256-GCM using `ENCRYPTION_KEY`, and are **never sent to the browser**. The UI shows only "set ✓ / last 4 chars / updated at".
   - For local development without Upstash, fall back to a JSON file in `.data/`.
3. **Bootstrap env vars (the only ones):** `ENCRYPTION_KEY`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `OWNER_EMAIL` (always an admin, can't be removed), and the Upstash vars.
4. **Auth:** Google sign-in (Auth.js v5). Allowed users = `OWNER_EMAIL` + the admin list managed in Settings. Every page and API route checks this.
5. **Google Sheets access:** two modes, chosen in Settings → Google connection:
   - **A. Connected Google account (default):** a separate "Connect Google Sheets" OAuth flow (same OAuth client, `spreadsheets` scope, `access_type=offline`, `prompt=consent`). Store the refresh token encrypted. The dashboard can open any sheet that account can open, with no sharing needed.
   - **B. Service account:** upload the JSON key in the UI (stored encrypted). Show the service account email with a copy button, and remind me to share each sheet with it as Editor.
   - All Sheets calls are server-side through one `sheetsFor(company)` helper.
   - Always locate columns **by header name**.
   - Use `values.batchGet` with `UNFORMATTED_VALUE` + `FORMATTED_STRING` dates, and normalize dates using the spreadsheet locale.
   - Use `values.batchUpdate` for edits. Cache reads for 20–60s, invalidate after writes, and retry 429/5xx with backoff.
   - Write with `USER_ENTERED`, except Commands JSON/dates (RAW). Keep phone numbers and IDs as text.
   - Never overwrite ranges the engine writes. Update only the cells you changed, and append with `values.append`.
   - Before editing a lead's cell, re-read its row and check the ID still matches.
6. **Company registry** in Redis. Each company has: name, slug, sheet URL (the dashboard extracts the ID), color, monday account slug (for links), active, ENGINE_KEY (secret), and the domain's first-send date (for warm-up advice).

# First-run setup wizard (`/setup`, owner only, shown while setup isn't done)
1. Choose the Google connection mode, connect it, and test it.
2. Add the first company: paste the sheet URL, and check that all required tabs and headers exist.
   - If `Commands` / `Send Results` / `System` are missing, explain how to paste the v2 `Code.gs` and run "إعداد أول مرة".
3. Link the engine: show ENGINE_KEY with a copy button and the menu path. Then wait for `System.dashboardLinked = نعم` (poll).
4. Sender email section (below), plus the deliverability check.
5. Optionally set up monday.
6. Done → redirect to the company's overview.

# Settings
## App settings (`/settings`, admins only; Google and access are owner only)
1. **Google connection:** the mode, the connected account or service account email, Re-connect, Test (reads one cell from a company sheet), Disconnect.
2. **Access:** add or remove admin emails.
3. **Defaults for new companies:** daily cap, sending days/hours, emails per run, gap, max bounce %, time zone. They pre-fill empty Company-tab values when adding a company.
4. **Notifications:** alert email(s). Show in-app warnings for failed commands, a stale heartbeat (>10 min) and a bounce-guard stop. Also offer to write the email into the Company tab's `إيميل التنبيهات` so the engine sends reply/booking summaries.
5. **Diagnostics:** app version, store type (Upstash/file), and the Google API errors seen in the last 24h.

## Company settings (`/c/[slug]/settings`, in tabs)
1. **Profile:** اسم الشركة, وصف الخدمة في سطر, لينك البروفايل, لينك صفحة الحجز, رقم الواتساب, المنطقة الزمنية. Written to the Company tab.
2. **Sender email** (the most important tab):
   - **Fields** (written to the Company tab): إيميل الإرسال, اسم المرسل, المنصب, Reply-To, and a live signature preview (exactly how the engine builds `{التوقيع}`).
   - **Gmail status** from `System` + a "Check now" button (`checkSender` command): Gmail account, verified ✓/✗, aliases, remaining quota.
     - If it's not verified, show step-by-step instructions: Gmail → Settings → Accounts → "Send mail as" → add and verify.
   - **Deliverability check**, server-side with Node `dns` on the sender's domain:
     - SPF (present, includes `_spf.google.com` or the provider)
     - DKIM (selector `google` plus a custom selector field)
     - DMARC (record and policy)
     - MX

     Show each as ✓ / ⚠ / ✗ with a one-line fix.
   - **Warm-up:** from the first-send date, recommend a daily cap (week 1: 15, week 2: 25, then 30–50) and warn if the cap is higher.
   - **Send test email:** to my address (`sendTest`), then show the result and the Gmail link when done.
3. **Sending schedule:** الإرسال شغال toggle, أيام الإرسال (multi-select), ساعة بداية/نهاية الإرسال, الحد اليومي للإيميلات, عدد الإيميلات في كل تشغيل, الفاصل بين الإيميلات (ثواني), أقصى نسبة Bounce, أيام انتظار بعد آخر خطوة. Show "inside the window now?" and sent today vs. cap.
4. **monday:**
   - **Token:** a write-only input. On save:
     1. Validate it server-side by calling the monday API (`me { name }`).
     2. Store it encrypted.
     3. Queue `setMondayToken` with the sealed token.
     4. Show the result.
   - Board ID or board URL (written to `monday Board ID`), account slug (for links), Test connection (`testMonday`, shows missing columns), Run setup.
5. **Booking:** `كلمة في عنوان الحجز` and the booking page link.
6. **Content:** editable tables for Segments, Sequence, Templates, Sources, Field Mapping and Lists, with validation against `Lists`.
   - The Templates editor has variable chips, a live preview against a real lead (port `fillTemplate_` exactly, RTL/LTR), the A/B version, and a warning for any variable with no value.
   - The Segments editor shows the total share and warns if it isn't 100%.
7. **Advanced:** sheet link, the System table, "Reinstall triggers" (`setup`), "Pause all sending", "Remove this company from the dashboard".
8. **Unknown Company tab keys:** any extra rows render as generic text fields, so new settings show up automatically.

# Other pages (Arabic RTL UI, all copy in `content/ar.ts`)
1. **Header:** a company switcher (name + color). Show a status pill from `System`: engine alive (heartbeat age), sending on/off, inside the window, sender verified, monday OK. Include a link that opens the sheet.
2. **Overview (`/c/[slug]`):** KPI cards from Leads:
   - totals by حالة المعالجة and حالة التواصل
   - sent today vs. cap
   - replies, bookings, bounces, bounce rate
   - monday synced / failed / pending

   Also show sent-per-day for the last 14 days (from `Send Results`), the funnel تم الإرسال → رد → حجز جلسة, per Source and per Segment counts, the latest commands and Log entries, and quick actions.
3. **Data (`/c/[slug]/data`):**
   - **Import wizard:**
     1. Upload CSV/XLSX or paste a table.
     2. Choose an existing Source or create a new one.
     3. Map columns. Auto-suggest from Field Mapping and exact header matches, and save new pairs.
     4. Preview, computed in the dashboard with exact ports of `pickEmail_`, `isValidEmail_`, `domainOf_`, `norm_`, `matchSegment_` and the dedup rules: valid / duplicate / DNC / no email / bad email, plus the Segment each row would match.
     5. Write the rows to the Import tab, in chunks of ≤500 rows per import command.
     6. Queue `import`, then `process`.
     7. Poll and show the summary.
   - **Leads table:** server-side pagination, search, and filters (source, segment, حالة المعالجة, حالة التواصل, حالة monday).
     - Inline edit of segment, language, person and notes.
     - Bulk actions: assign segment, move to Do-Not-Contact, re-queue as جاهز, retry monday, export CSV.
   - **Do-Not-Contact:** add emails or domains, remove them, and see the reason.
4. **Send (`/c/[slug]/send`):**
   - **Manual:** a count (default = the remaining daily cap) and an optional segment or selected leads.
     - "Preview" = `send` with `dryRun: true`. Show who would get which template.
     - "Send" = a confirmation dialog (count + company name), then queue the command.
     - If الإرسال شغال = لا, require an explicit "send anyway" (`ignoreEnabled`). Outside the window, offer `ignoreWindow` for manual runs.
   - **Scheduled:** pick a date and time (company time zone, stored as UTC) and a count. List upcoming commands with a Cancel button.
   - **Automatic:** the الإرسال شغال toggle and a link to the schedule settings.
   - **Results panel:** live command progress (poll every 5s). One row per lead from `Send Results`:
     - sent ✓/✗ and the error
     - a Gmail link: `https://mail.google.com/mail/u/0/#all/<threadId>`
     - **monday ✓/✗** with the error, an item link (`https://<account>.monday.com/boards/<boardId>/pulses/<itemId>`), and Retry (`retryMonday` for that lead).
5. **Status (`/c/[slug]/status`):** the outreach tracker. Each lead shows حالة التواصل, step, first/last sent, next follow-up, Gmail and monday links, and حالة monday. Add a "needs attention" view: monday failures, missing Segment, invalid emails, failed commands, sender not verified.
6. **Activity (`/c/[slug]/activity`):** `Commands` (status, parsed result, cancel pending ones) and `Log`.
7. **Companies (`/companies`):** add or edit companies, Test connection, Reveal/regenerate ENGINE_KEY. Include an **onboarding checklist**:
   1. Copy the Master sheet.
   2. Paste `Code.gs` v2.
   3. Enable the Gmail API service.
   4. Run "إعداد أول مرة".
   5. Run "ربط الداشبورد" with the ENGINE_KEY.
   6. Share with the service account (mode B only).
   7. Verify the sender email.
   8. Test.

# Safety and UX rules
- Every real send needs a confirmation dialog showing the count and company name. Default to a dry run first.
- Secrets never reach the browser, logs or the sheet. The only exception is the sealed monday handoff, which the engine wipes.
- Show friendly Arabic errors with the technical detail in an expandable section. Use optimistic UI for edits, rolled back on error.
- Show "waiting for the engine…" states. If a command stays `في الانتظار` for more than 3 minutes, show "the engine looks stopped — check triggers" with a link to Advanced.

# Deliverables
- The Next.js app, `.env.example` (bootstrap vars only), and an updated `README.md` (Arabic) that explains:
  1. Creating the Google OAuth client, including both redirect URIs (Auth.js callback + `/api/google/callback`), and publishing the consent screen to Production.
  2. An optional service account.
  3. Upstash.
  4. Deploying to Vercel.
  5. The first-run wizard.
  6. Adding a new company.
- A local mock mode (`MOCK_SHEETS=1`, plus `AUTH_DISABLED=1` allowed only in mock mode). It serves fixture data shaped exactly like the real tabs, with a fake engine that processes commands and refreshes `System`, so the whole UI works without Google.

# Testing before you say you're done
- Unit-test the ported logic (email picking/validation, dedup, segment matching, template filling, date normalization) and the encryption helpers.
- Run a **seal compatibility test**: load `apps-script/Code.gs` in a Node `vm` (see `apps-script/test/harness.js` for the mocks) and check that `openSealed_` decrypts what the dashboard's `seal()` produces, including Arabic text.
- In mock mode, click through: setup wizard → sender check → import → process → dry run → send → results with monday ✓/✗ → retry → scheduled send → cancel → settings edits.
- Run `npm run build` with zero type errors.
- Take mobile and desktop screenshots of each page.

# Git & deployment
- This repo is the new standalone project. `apps-script/` and `reference/` are already committed. Don't delete or move them.
- Work on a branch, commit in small logical steps with clear messages, and open a PR when each workflow step is ready for review.
- Never commit secrets: `.env*` must be in `.gitignore`, and `.env.example` documents the variables only.
- The repo will be connected to Vercel (Git integration). Keep the build passing on every push, and use the mock mode for Preview deployments if real env vars aren't set.

# Workflow
1. Read `Code.gs` and the xlsx, then propose the page map, the settings model and the data-access layer. Wait for my approval.
2. Build the dashboard in mock mode and show me.
3. Connect it to one real company, then update the README.
