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

الخطة والتصميم في `docs/PLAN.md`. شرح Google OAuth و Upstash و Vercel هييجي في الخطوة 3 (ربط شركة حقيقية).

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
