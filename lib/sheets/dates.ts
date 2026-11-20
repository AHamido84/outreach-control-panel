/**
 * Normalizes date cells read with UNFORMATTED_VALUE + dateTimeRenderOption=FORMATTED_STRING.
 * The string follows the spreadsheet's locale (e.g. 20/11/2026 for ar_EG / en_GB, 11/20/2026 for en_US,
 * Arabic-Indic digits in some Arabic locales). Output: "YYYY-MM-DD" or "YYYY-MM-DD HH:mm". Client-safe.
 */

const MDY_LOCALES = /^(en_US|en_PH|en_CA|es_US|en_BZ|en_FM|en_MH|en_PW|en_UM|en_AS|en_GU|en_MP|en_PR|en_VI)$/i;

export function toLatinDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[‎‏؜]/g, "")
    .replace(/[٫]/g, ".")
    .replace(/[،]/g, ",");
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Google Sheets serial day number (days since 1899-12-30) → ISO. */
export function fromSerial(n: number): string {
  const ms = Math.round((n - 25569) * 864e5);
  const d = new Date(ms);
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const hasTime = Math.abs(n % 1) > 1e-9;
  return hasTime ? `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : day;
}

export function normalizeDate(v: unknown, locale = "en_US"): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return v > 20000 && v < 80000 ? fromSerial(v) : String(v);
  let s = toLatinDigits(String(v).trim());
  if (!s) return "";
  // ISO-like: 2026-11-20, 2026-11-20 10:05(:00), 2026-11-20T10:05:00.000Z
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z)?)?$/);
  if (m) {
    if (m[6]) { const d = new Date(s); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; }
    const day = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
    return m[4] !== undefined ? `${day} ${pad(+m[4])}:${m[5]}` : day;
  }
  // a/b/yyyy or a.b.yyyy or a-b-yyyy, optional time and AM/PM (incl. ص / م)
  s = s.replace(/\s*(ص|AM)\s*$/i, " AM").replace(/\s*(م|PM)\s*$/i, " PM");
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:,?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?$/i);
  if (m) {
    const a = +m[1], b = +m[2];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    let [mo, d] = MDY_LOCALES.test(locale) ? [a, b] : [b, a];
    if (mo > 12 && d <= 12) [mo, d] = [d, mo]; // unambiguous the other way round
    const day = `${y}-${pad(mo)}-${pad(d)}`;
    if (m[4] === undefined) return day;
    let h = +m[4];
    if (m[6]) { const pm = m[6].toUpperCase() === "PM"; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
    return `${day} ${pad(h)}:${m[5]}`;
  }
  return String(v);
}

/** Day part only. */
export const dayOf = (v: unknown, locale?: string) => normalizeDate(v, locale).slice(0, 10);
