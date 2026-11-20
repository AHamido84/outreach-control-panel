import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  // حالة المعالجة
  "جديد": "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  "اتنقل لـ monday": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  "مكرر": "bg-muted text-muted-foreground",
  "مافيش إيميل": "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  "إيميل غلط": "bg-destructive/10 text-destructive",
  "في Do-Not-Contact": "bg-destructive/10 text-destructive",
  "متجاهل": "bg-muted text-muted-foreground",
  "بدون Segment": "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  // حالة التواصل
  "جاهز": "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  "تم الإرسال": "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  "رد": "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "حجز جلسة": "bg-emerald-600/20 text-emerald-800 dark:text-emerald-200",
  "مافيش رد": "bg-muted text-muted-foreground",
  "Bounce": "bg-destructive/10 text-destructive",
  "طلب الإزالة": "bg-destructive/10 text-destructive",
  // commands
  "في الانتظار": "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  "جاري التنفيذ": "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  "تم": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  "فشل": "bg-destructive/10 text-destructive",
  "ملغي": "bg-muted text-muted-foreground",
};

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const tone = TONE[value] ?? (value.startsWith("متابعة") ? "bg-violet-500/10 text-violet-700 dark:text-violet-300" : value.startsWith("فشل") ? TONE["فشل"] : "bg-muted text-foreground");
  return <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs whitespace-nowrap", tone, className)}>{value}</span>;
}

/** حالة monday: تم ✓ / فشل ✗ (with the reason as tooltip) / empty. */
export function MondayMark({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  if (value === "تم") return <span className="font-bold text-emerald-600" aria-label="monday ✓">✓</span>;
  if (value.startsWith("فشل")) return <span className="font-bold text-destructive" title={value} aria-label={value}>✗</span>;
  return <span className="text-xs text-muted-foreground">{value}</span>;
}

export const gmailLink = (threadId: string) => `https://mail.google.com/mail/u/0/#all/${threadId}`;
export const mondayItemLink = (account: string | undefined, board: string, item: string) =>
  account && board && item ? `https://${account}.monday.com/boards/${board}/pulses/${item}` : "";
