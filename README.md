# Outreach Control Panel

لوحة تحكم لإرسال إيميلات الـ Outreach لأكتر من شركة، فوق شيت **Outreach Engine** (Google Sheets + Apps Script).

> المشروع ده منفصل عن صفحة حجز بوصلة الإنسان.

## المحتوى الحالي

| المسار | إيه ده |
|---|---|
| `apps-script/Code.gs` | محرك الإرسال v2 (جاهز ومتجرّب) — بيتلصق في Apps Script بتاع كل شيت |
| `apps-script/appsscript.json` | الـ manifest (بيفعّل Gmail API) |
| `apps-script/test/` | تيستات المحرك على شيت وهمي: `node test.js && node test-v2.js && node test-phone.js` |
| `reference/Outreach_Engine_Master.xlsx` | شكل الشيت (التابات والأعمدة) |
| `PROMPT.md` | المطلوب بناؤه (للـ Claude Code) |

## تركيب المحرك على شيت شركة

1. افتح الشيت ← Extensions ← Apps Script، والصق `apps-script/Code.gs`.
2. Services (+) ← Gmail API.
3. من قائمة **Outreach** في الشيت: **إعداد أول مرة** (بيعمل تابات Commands و Send Results و System والتشغيل التلقائي).
4. بعد ما الداشبورد يشتغل: **Outreach ← ربط الداشبورد (ENGINE_KEY)**.

## الداشبورد

| الصفحة | فيها إيه |
|---|---|
| `/setup` | الإعداد لأول مرة (لصاحب الحساب): Google ← أول شركة ← ربط المحرك ← الإيميل المرسل ← monday ← خلاص |
| `/c/<slug>` | نظرة عامة: أرقام الليدز، المبعوت النهارده، الردود والحجوزات والـ Bounce، monday، رسم آخر 14 يوم، القمع، آخر الأوامر والـ Log |
| `/c/<slug>/data` | استيراد (CSV / Excel / لصق) بمعاينة بنفس قواعد المحرك، جدول الليدز (بحث وفلاتر وتعديل وإجراءات جماعية وتصدير)، Do-Not-Contact |
| `/c/<slug>/send` | إرسال يدوي (معاينة الأول + تأكيد)، مجدول، تلقائي، والنتائج لكل عميل (Gmail و monday و Retry) |
| `/c/<slug>/status` | تتبّع التواصل + «محتاج انتباه» |
| `/c/<slug>/activity` | الأوامر (وإلغاء اللي مستني) والـ Log |
| `/c/<slug>/settings` | إعدادات الشركة |
| `/settings` · `/companies` | إعدادات التطبيق · الشركات و ENGINE_KEY |

الخطة والتصميم في `docs/PLAN.md`.

## التشغيل على Vercel (أول مرة)

اللينك في الأمثلة: `https://outreach-control-panel.vercel.app` — لو الدومين بتاعك مختلف حطّه مكانه.

### 1) Google OAuth client (تسجيل الدخول + توصيل Google Sheets)

1. [Google Cloud Console](https://console.cloud.google.com/) ← اعمل Project جديد (أو اختار واحد).
2. **APIs & Services ← Library ← Google Sheets API ← Enable**.
3. **APIs & Services ← OAuth consent screen** (Google Auth Platform):
   - User type: **External**. اسم التطبيق وإيميل الدعم.
   - Scopes: `openid`، `email`، `profile`، و `https://www.googleapis.com/auth/spreadsheets`.
   - **Audience ← Publish app ← In production.** مهم جداً: لو فضل *Testing* الـ Refresh token بيبوظ بعد 7 أيام والداشبورد هيفقد الاتصال بالشيتات.
   - لأن صلاحية Sheets «حساسة»، Google هيعرض «Google hasn't verified this app» — ده طبيعي لاستخدام خاص: دوس **Advanced ← Go to … (unsafe)**. (لحد 100 مستخدم من غير Verification.)
4. **Credentials ← Create credentials ← OAuth client ID ← Web application**:
   - **Authorized redirect URIs** — الاتنين لازم يتضافوا:
     - `https://outreach-control-panel.vercel.app/api/auth/callback/google` ← تسجيل الدخول (Auth.js)
     - `https://outreach-control-panel.vercel.app/api/google/callback` ← «توصيل Google Sheets»
     - (للتطوير المحلي: نفس الاتنين بـ `http://localhost:3000`)
   - انسخ **Client ID** و **Client secret**.

### 2) Service account (اختياري — بديل لتوصيل حساب Google)

Cloud Console ← **IAM & Admin ← Service accounts ← Create** ← بعدين **Keys ← Add key ← JSON**. ارفع ملف الـ JSON من **إعدادات التطبيق ← اتصال Google ← Service Account**، واعمل **Share** لكل شيت شركة مع إيميل الـ Service Account كـ **Editor**.

### 3) Upstash Redis (مكان حفظ الإعدادات والأسرار)

Vercel ← Project ← **Storage ← Create / Marketplace ← Upstash for Redis** (الخطة المجانية) ← **Connect to project** (Production + Preview + Development). Vercel بيضيف متغيراته لوحده (`KV_REST_API_URL` / `KV_REST_API_TOKEN` أو `UPSTASH_REDIS_REST_*` — الاتنين شغالين).

### 4) متغيرات البيئة في Vercel

Vercel ← Project ← **Settings ← Environment Variables** (Production و Preview):

| المتغير | القيمة |
|---|---|
| `ENCRYPTION_KEY` | `openssl rand -base64 32` — بيشفّر الأسرار (AES-256-GCM). **ماتغيّروش بعد كده** وإلا الأسرار المحفوظة مش هتتفك. |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | من الخطوة 1 |
| `OWNER_EMAIL` | إيميل Google بتاعك — دايماً أدمن ومايتشالش |

بعدها **Deployments ← Redeploy**. لو حاجة ناقصة، الموقع بيعرض صفحة فيها المتغيرات الناقصة بالظبط.
> الـ Preview deployments من غير متغيرات حقيقية بتشتغل لوحدها بالوضع التجريبي (بيانات وهمية).

### 5) الإعداد لأول مرة

ادخل بإيميل `OWNER_EMAIL` ← هيوديك على `/setup`:
1. **اتصال Google**: «توصيل Google Sheets» (أو ارفع الـ Service Account) ← اختبار.
2. **أول شركة**: الصق لينك الشيت — الداشبورد بيفحص التابات والأعمدة. لو تابات Commands / Send Results / System ناقصة، ركّب المحرك (الجزء اللي فوق) وشغّل «إعداد أول مرة» وبعدين «افحص تاني».
3. **ربط المحرك**: انسخ ENGINE_KEY ← في الشيت **Outreach ← ربط الداشبورد (ENGINE_KEY)** ← الصق. الصفحة بتستنى لوحدها لحد ما يتربط.
4. **الإيميل المرسل**: املاه، دوس «افحص دلوقتي»، ولو مش متفعّل اتبع الخطوات (Gmail ← Settings ← Accounts ← Send mail as). افحص الـ DNS وابعت إيميل تجريبي.
5. **monday** (اختياري): الصق الـ Token (بيتحقق منه ويتحفظ متشفّر ويتبعت للمحرك متشفّر بـ ENGINE_KEY)، والـ Board ID، واختبر.
6. خلاص ← النظرة العامة.

### 6) إضافة شركة جديدة

صفحة **الشركات ← إضافة شركة**، وفيها قائمة الخطوات:
1. اعمل نسخة من شيت الـ Master.
2. الصق `Code.gs` v2 في Extensions ← Apps Script.
3. Services (+) ← Gmail API.
4. Outreach ← «إعداد أول مرة».
5. Outreach ← «ربط الداشبورد» والصق ENGINE_KEY (زرار «إظهار» في صفحة الشركات).
6. Share مع الـ Service Account كـ Editor (لو بتستخدمه بس).
7. فعّل الإيميل المرسل في Gmail.
8. «اختبر الاتصال».

القيم الفاضية في تاب Company بتتملي من «افتراضيات الشركات» (إعدادات التطبيق) — من غير ما تغيّر أي قيمة موجودة.

### تشغيل محلي بالوضع التجريبي (من غير Google)

```bash
npm install
npm run dev:mock
```

افتح http://localhost:3000 — الشيتات وهمية، و«المحرك» هو `Code.gs` الحقيقي شغال جوه Node، فالأوامر بتتنفذ فعلاً (Gmail و monday وهميين).
الحالة بتتحفظ في `.data/` — امسح الفولدر عشان تبدأ من الأول.

### التيستات

```bash
npm test                 # تيستات الوحدات + توافق التشفير مع openSealed_ + المحرك على الشيت الوهمي
npm run test:engine      # تيستات Code.gs
npm run build
BASE=http://localhost:3000 node tests/e2e/flow.e2e.mjs       # Playwright: الإعداد ← استيراد ← معاينة ← إرسال ← monday ← Retry ← جدولة ← إلغاء
BASE=http://localhost:3000 node tests/e2e/settings.e2e.mjs   # Playwright: كل صفحات الإعدادات
# (الاتنين محتاجين سيرفر بالوضع التجريبي و .data فاضي)
```

### متغيرات البيئة

موجودة في `.env.example` (للتشغيل بس — كل الإعدادات التانية من الواجهة). شرح Google OAuth و Upstash و Vercel هييجي في الخطوة 3.
