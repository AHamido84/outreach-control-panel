import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** What is stored at rest. Never sent to the browser. */
export type SecretEnvelope = { v: 1; iv: string; tag: string; ct: string; last4: string; updatedAt: string };
/** What the UI is allowed to see. */
export type SecretInfo = { set: boolean; last4?: string; updatedAt?: string };

/**
 * ENCRYPTION_KEY: 32 bytes as base64 or hex (`openssl rand -base64 32`).
 * Any other string is accepted too and stretched with SHA-256, so a typo'd key still
 * gives a stable key — but the README recommends the random 32-byte form.
 */
export function keyFrom(raw: string | undefined): Buffer {
  if (!raw) throw new Error("ENCRYPTION_KEY is not set");
  const s = raw.trim();
  if (/^[0-9a-f]{64}$/i.test(s)) return Buffer.from(s, "hex");
  const b = Buffer.from(s, "base64");
  if (b.length === 32 && /^[A-Za-z0-9+/=_-]+$/.test(s)) return b;
  return createHash("sha256").update(s, "utf8").digest();
}

export function encrypt(plaintext: string, key: Buffer): SecretEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ct: ct.toString("base64"),
    last4: plaintext.slice(-4),
    updatedAt: new Date().toISOString(),
  };
}

export function decrypt(env: SecretEnvelope, key: Buffer): string {
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(env.iv, "base64"));
  d.setAuthTag(Buffer.from(env.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(env.ct, "base64")), d.final()]).toString("utf8");
}

export function infoOf(env: SecretEnvelope | null | undefined): SecretInfo {
  return env ? { set: true, last4: env.last4, updatedAt: env.updatedAt } : { set: false };
}
