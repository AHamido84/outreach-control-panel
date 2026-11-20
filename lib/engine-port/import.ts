/**
 * Exact port of the classification in importFromSheet (Code.gs v2), plus knownContacts_ and the
 * Do-Not-Contact helpers. Used by the import wizard preview. Client-safe.
 */
import { activeSegments_, domainOf_, matchSegment_, normalizeUrl_, pickEmail_, type Row } from "./index";

export type Known = { emails: Record<string, true>; domainsWithEmail: Record<string, true>; sites: Record<string, true> };
export type Dnc = { emails: Record<string, true>; domains: Record<string, true> };

export function knownContacts_(leads: Row[]): Known {
  const k: Known = { emails: {}, domainsWithEmail: {}, sites: {} };
  leads.forEach((L) => {
    const e = String(L["الإيميل"] || "").toLowerCase().trim();
    if (e) k.emails[e] = true;
    const d = domainOf_(L["الموقع"]);
    if (d) { k.sites[d] = true; if (e && e.split("@")[1] === d) k.domainsWithEmail[d] = true; }
  });
  return k;
}

export function dncSets_(rows: Row[]): Dnc {
  const s: Dnc = { emails: {}, domains: {} };
  rows.forEach((r) => {
    const v = String(r["الإيميل أو الدومين"] ?? "").trim().toLowerCase();
    if (!v) return;
    if (r["النوع"] === "دومين" || v.indexOf("@") === -1) s.domains[v.replace(/^@/, "")] = true; else s.emails[v] = true;
  });
  return s;
}

export function isDnc_(email: unknown, dnc: Dnc): boolean {
  const e = String(email).toLowerCase();
  return !!(dnc.emails[e] || dnc.domains[e.split("@")[1]]);
}

export type ImportStatus = "جديد" | "مكرر" | "في Do-Not-Contact" | "مافيش إيميل" | "متجاهل";
export type PreviewRow = {
  index: number;
  lead: Record<string, string>;
  status: ImportStatus;
  /** the email cell had text but no valid address (the engine treats it as no email) */
  badEmail: boolean;
  /** the Segment this row would get once processed (null = none matches) */
  segment: string | null;
};

/**
 * Classifies mapped rows exactly like importFromSheet does, in order (duplicates inside the file count).
 * rows: { unifiedField: value } — what the dashboard writes to the Import tab.
 */
export function classifyImport(
  rows: Record<string, string>[],
  ctx: { leads: Row[]; dncRows: Row[]; segments: Row[]; sourceActive: boolean },
): PreviewRow[] {
  const known = knownContacts_(ctx.leads);
  const dnc = dncSets_(ctx.dncRows);
  const segs = activeSegments_(ctx.segments);
  const out: PreviewRow[] = [];
  rows.forEach((raw, index) => {
    const values = Object.values(raw).map((v) => String(v ?? "")).join("");
    if (values.trim() === "") return; // engine skips empty rows
    const lead: Record<string, string> = {};
    for (const [field, v] of Object.entries(raw)) if (field && v !== "" && !lead[field]) lead[field] = String(v).trim();
    const rawEmail = lead["الإيميل"] || "";
    lead["الإيميل"] = pickEmail_(rawEmail, lead["الموقع"] || "");
    lead["الموقع"] = normalizeUrl_(lead["الموقع"] || "");
    const badEmail = !!rawEmail.trim() && !lead["الإيميل"];
    if (!ctx.sourceActive) { out.push({ index, lead, status: "متجاهل", badEmail, segment: null }); return; }

    const email = lead["الإيميل"], domain = domainOf_(lead["الموقع"]);
    let status: ImportStatus;
    if (email && (known.emails[email] || (domain && known.domainsWithEmail[domain]))) status = "مكرر";
    else if (email && isDnc_(email, dnc)) status = "في Do-Not-Contact";
    else if (email) { status = "جديد"; known.emails[email] = true; if (domain) known.domainsWithEmail[domain] = true; }
    else if (lead["الموقع"]) status = known.sites[domain] ? "مكرر" : "جديد";
    else status = "مافيش إيميل";
    if (domain) known.sites[domain] = true;

    const seg = status === "جديد" ? matchSegment_(lead, segs) : null;
    out.push({ index, lead, status, badEmail, segment: seg ? String(seg["كود الـ Segment"]) : null });
  });
  return out;
}
