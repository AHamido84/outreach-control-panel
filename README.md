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

الداشبورد نفسه هيتبني حسب `PROMPT.md`.
