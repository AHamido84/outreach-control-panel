/** The sheet contract (Code.gs v2 + Master xlsx). Shared by server and client. */

export const TAB = {
  COMPANY: "Company", SOURCES: "Sources", MAPPING: "Field Mapping", IMPORT: "Import", LEADS: "Leads",
  SEGMENTS: "Segments", SEQUENCE: "Sequence", TEMPLATES: "Templates", DNC: "Do-Not-Contact", LOG: "Log", LISTS: "Lists",
  COMMANDS: "Commands", RESULTS: "Send Results", SYSTEM: "System",
} as const;

export const DASHBOARD_TABS = [TAB.COMMANDS, TAB.RESULTS, TAB.SYSTEM] as const;

export const LEAD_BASE_COLS = ["ID", "تاريخ الإضافة", "كود المصدر", "اسم الجهة", "اسم الشخص", "المنصب", "الإيميل", "الموقع", "التليفون",
  "النشاط", "المدينة", "البلد", "اللغة", "كود الـ Segment", "حالة المعالجة", "monday Item ID", "ملاحظات"];
export const LEAD_STATE_COLS = ["حالة التواصل", "الخطوة الحالية", "النسخة", "تاريخ أول إرسال", "تاريخ آخر إرسال", "المتابعة الجاية",
  "Thread ID", "ميعاد الجلسة", "حالة monday"];

/** Required headers per tab (row 1). */
export const REQUIRED_HEADERS: Record<string, string[]> = {
  [TAB.COMPANY]: ["الإعداد", "القيمة"],
  [TAB.SOURCES]: ["كود المصدر", "اسم المصدر", "النوع", "مفعّل"],
  [TAB.MAPPING]: ["كود المصدر", "اسم العمود في المصدر", "الحقل الموحد"],
  [TAB.IMPORT]: [],
  [TAB.LEADS]: [...LEAD_BASE_COLS, ...LEAD_STATE_COLS],
  [TAB.SEGMENTS]: ["كود الـ Segment", "الاسم", "النشاط", "البلد", "المدينة (اختياري)", "اللغة", "نصيبه من الحد اليومي", "مفعّل"],
  [TAB.SEQUENCE]: ["كود الـ Segment", "رقم الخطوة", "بعد كام يوم من الخطوة اللي قبلها", "كود القالب"],
  [TAB.TEMPLATES]: ["كود القالب", "اللغة", "النسخة", "الموضوع", "النص"],
  [TAB.DNC]: ["الإيميل أو الدومين", "النوع", "السبب", "التاريخ", "ملاحظات"],
  [TAB.LOG]: ["الوقت", "الدالة", "العدد", "النتيجة", "التفاصيل"],
  [TAB.LISTS]: [],
  [TAB.COMMANDS]: ["ID", "النوع", "البيانات", "موعد التنفيذ", "الحالة", "تاريخ الإنشاء", "تاريخ التنفيذ", "النتيجة", "المنشئ"],
  [TAB.RESULTS]: ["Command ID", "الوقت", "Lead ID", "الإيميل", "الخطوة", "القالب/النسخة", "تم الإرسال", "الخطأ", "Thread ID", "monday", "خطأ monday"],
  [TAB.SYSTEM]: ["المفتاح", "القيمة", "الوصف"],
};

export const CMD = { PENDING: "في الانتظار", RUNNING: "جاري التنفيذ", DONE: "تم", FAILED: "فشل", CANCELLED: "ملغي" } as const;
export type CommandStatus = (typeof CMD)[keyof typeof CMD];

export type CommandType = "import" | "process" | "send" | "sendTest" | "retryMonday" | "testMonday" | "checkSender" | "setMondayToken" | "setup" | "heartbeat";

export type Command = {
  id: string; type: CommandType | string; payload: string; at: string; status: CommandStatus | string;
  createdAt: string; executedAt: string; result: Record<string, unknown> | null; resultRaw: string; creator: string; row: number;
};

/** Company-tab keys, grouped by the settings tab that owns them. Anything else shows under "إعدادات إضافية". */
export const COMPANY_KEYS = {
  profile: ["اسم الشركة", "وصف الخدمة في سطر", "لينك البروفايل", "لينك صفحة الحجز", "رقم الواتساب", "المنطقة الزمنية"],
  sender: ["إيميل الإرسال", "اسم المرسل", "المنصب", "Reply-To"],
  schedule: ["الإرسال شغال", "أيام الإرسال", "ساعة بداية الإرسال", "ساعة نهاية الإرسال", "الحد اليومي للإيميلات",
    "عدد الإيميلات في كل تشغيل", "الفاصل بين الإيميلات (ثواني)", "أقصى نسبة Bounce", "أيام انتظار بعد آخر خطوة"],
  monday: ["monday Board ID"],
  booking: ["كلمة في عنوان الحجز"],
  notifications: ["إيميل التنبيهات"],
} as const;
export const KNOWN_COMPANY_KEYS = new Set<string>([...Object.values(COMPANY_KEYS).flat(), "لينك صفحة الحجز"]);

/** Company keys that are numbers (written as numbers, not text). */
export const NUMERIC_COMPANY_KEYS = new Set(["ساعة بداية الإرسال", "ساعة نهاية الإرسال", "الحد اليومي للإيميلات", "عدد الإيميلات في كل تشغيل",
  "الفاصل بين الإيميلات (ثواني)", "أقصى نسبة Bounce", "أيام انتظار بعد آخر خطوة"]);

/** Dropdown validations in the Master sheet: column → Lists column header. */
export const LIST_VALIDATIONS: Record<string, Record<string, string>> = {
  [TAB.SOURCES]: { "النوع": "أنواع المصادر", "مفعّل": "نعم/لا" },
  [TAB.MAPPING]: { "الحقل الموحد": "الحقول الموحدة" },
  [TAB.SEGMENTS]: { "اللغة": "اللغات", "مفعّل": "نعم/لا" },
  [TAB.SEQUENCE]: { "يوقف لو رد أو حجز": "نعم/لا" },
  [TAB.TEMPLATES]: { "اللغة": "اللغات", "النسخة": "النسخ" },
  [TAB.DNC]: { "النوع": "نوع المنع", "السبب": "أسباب المنع" },
};

/** Content tabs the dashboard edits, and the only columns it may write (formula/reference columns excluded). */
export const CONTENT_TABS: Record<string, { cols: string[]; key: string[] }> = {
  [TAB.SEGMENTS]: { cols: ["كود الـ Segment", "الاسم", "النشاط", "البلد", "المدينة (اختياري)", "اللغة", "نصيبه من الحد اليومي", "مفعّل"], key: ["كود الـ Segment"] },
  [TAB.SEQUENCE]: { cols: ["كود الـ Segment", "رقم الخطوة", "بعد كام يوم من الخطوة اللي قبلها", "كود القالب", "يوقف لو رد أو حجز"], key: ["كود الـ Segment", "رقم الخطوة"] },
  [TAB.TEMPLATES]: { cols: ["كود القالب", "اللغة", "النسخة", "الموضوع", "النص"], key: ["كود القالب", "النسخة"] },
  [TAB.SOURCES]: { cols: ["كود المصدر", "اسم المصدر", "النوع", "مفعّل", "ملاحظات"], key: ["كود المصدر"] },
  [TAB.MAPPING]: { cols: ["كود المصدر", "اسم العمود في المصدر", "الحقل الموحد"], key: ["كود المصدر", "اسم العمود في المصدر"] },
  [TAB.LISTS]: { cols: [], key: [] }, // all columns: each column is one list
};

export const SYSTEM_KEYS = ["heartbeat", "version", "gmailAccount", "sender", "senderVerified", "aliases", "gmailQuota", "gmailApi",
  "mondayToken", "mondayBoard", "triggers", "missingTriggers", "sendingEnabled", "inWindow", "sentToday", "dailyCap",
  "lastProcessLeads", "lastSendQueue", "lastWatchTick", "lastRunCommands", "lastError", "dashboardLinked", "timezone"] as const;
export type SystemInfo = Partial<Record<(typeof SYSTEM_KEYS)[number], string | number>> & { _rows?: { key: string; value: string | number; desc: string }[] };

export const yes = (v: unknown) => String(v ?? "").trim() === "نعم";
