import "server-only";
import { promises as dns } from "node:dns";

export type Level = "ok" | "warn" | "fail";
export type DnsItem = { key: "spf" | "dkim" | "dmarc" | "mx"; level: Level; value: string; fix: string };

async function txt(name: string): Promise<string[]> {
  try {
    return (await dns.resolveTxt(name)).map((r) => r.join(""));
  } catch {
    return [];
  }
}

/** SPF / DKIM / DMARC / MX for the sender's domain, each ✓ / ⚠ / ✗ with a one-line fix. */
export async function checkDomain(domain: string, customSelector?: string): Promise<DnsItem[]> {
  const d = domain.trim().toLowerCase().replace(/^.*@/, "");
  const [root, dmarc, mx] = await Promise.all([
    txt(d),
    txt("_dmarc." + d),
    dns.resolveMx(d).catch(() => [] as { exchange: string; priority: number }[]),
  ]);
  const out: DnsItem[] = [];

  // SPF
  const spf = root.filter((r) => /^v=spf1/i.test(r));
  if (!spf.length) out.push({ key: "spf", level: "fail", value: "مافيش سجل SPF", fix: `ضيف TXT على ${d}: v=spf1 include:_spf.google.com ~all` });
  else if (spf.length > 1) out.push({ key: "spf", level: "warn", value: spf.join(" | "), fix: "فيه أكتر من سجل SPF — لازم يبقوا سجل واحد" });
  else if (/include:_spf\.google\.com/i.test(spf[0])) out.push({ key: "spf", level: "ok", value: spf[0], fix: "" });
  else out.push({ key: "spf", level: "warn", value: spf[0], fix: "لو بتبعت من Gmail/Workspace ضيف include:_spf.google.com، أو include مزوّد الإيميل بتاعك" });

  // DKIM
  const selectors = ["google", ...(customSelector ? [customSelector.trim()] : [])].filter(Boolean);
  const found: string[] = [];
  for (const s of selectors) {
    const r = await txt(`${s}._domainkey.${d}`);
    if (r.some((x) => /v=DKIM1|k=rsa|p=/i.test(x))) found.push(s);
  }
  if (found.length) out.push({ key: "dkim", level: "ok", value: "selector: " + found.join(", "), fix: "" });
  else out.push({ key: "dkim", level: customSelector ? "fail" : "warn", value: "مالقيناش DKIM لـ " + selectors.join(", "),
    fix: "Google Admin ← Apps ← Gmail ← Authenticate email ← Generate new record، وحطه TXT على google._domainkey" });

  // DMARC
  const rec = dmarc.find((r) => /^v=DMARC1/i.test(r));
  if (!rec) out.push({ key: "dmarc", level: "fail", value: "مافيش سجل DMARC", fix: `ضيف TXT على _dmarc.${d}: v=DMARC1; p=none; rua=mailto:dmarc@${d}` });
  else {
    const p = (rec.match(/;\s*p=(\w+)/i) || [])[1]?.toLowerCase() || "?";
    out.push(p === "none"
      ? { key: "dmarc", level: "warn", value: rec, fix: "السياسة p=none: كويس كبداية، وبعد أسبوعين من غير مشاكل خليها quarantine" }
      : { key: "dmarc", level: "ok", value: rec, fix: "" });
  }

  // MX
  if (!mx.length) out.push({ key: "mx", level: "fail", value: "مافيش MX", fix: "الدومين مايستقبلش إيميل — الردود هترجع. ضيف سجلات MX بتاعة مزوّد الإيميل" });
  else out.push({ key: "mx", level: "ok", value: mx.sort((a, b) => a.priority - b.priority).map((m) => m.exchange).join(", "), fix: "" });

  return out;
}
