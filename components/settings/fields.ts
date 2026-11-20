import { ar } from "@/content/ar";
import type { FieldSpec } from "@/components/app/company-form";

const T = ar.companySettings;

export const PROFILE_FIELDS: FieldSpec[] = [
  { key: "اسم الشركة", help: "{اسم_شركتنا}" },
  { key: "وصف الخدمة في سطر", help: "{وصف_الخدمة}" },
  { key: "لينك البروفايل", type: "url", help: "{لينك_البروفايل} — المحرك بيزوّد ?ref=ID العميل" },
  { key: "لينك صفحة الحجز", type: "url", help: "{لينك_الحجز}" },
  { key: "رقم الواتساب", type: "tel", help: "بيتحط في التوقيع" },
  { key: "المنطقة الزمنية", type: "tz", help: T.profile.tzHelp },
];
