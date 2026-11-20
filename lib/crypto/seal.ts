import { createHmac, randomBytes } from "node:crypto";

export type Sealed = { n: string; c: string; t: string };

/**
 * Seals a secret for the engine. Must match `openSealed_` in apps-script/Code.gs exactly:
 *   key   = ENGINE_KEY string
 *   n     = base64(16 random bytes)
 *   ks[i] = HMAC-SHA256(key, n + ':' + i)   (32 bytes per block)
 *   c     = base64(utf8(plaintext) XOR ks)
 *   t     = base64(HMAC-SHA256(key, n + ':' + c))
 */
export function seal(plaintext: string, engineKey: string, nonce?: Buffer): Sealed {
  const n = (nonce ?? randomBytes(16)).toString("base64");
  const pt = Buffer.from(plaintext, "utf8");
  const out = Buffer.alloc(pt.length);
  let block = Buffer.alloc(0);
  for (let i = 0; i < pt.length; i++) {
    if (i % 32 === 0) block = createHmac("sha256", engineKey).update(n + ":" + i / 32, "utf8").digest();
    out[i] = pt[i] ^ block[i % 32];
  }
  const c = out.toString("base64");
  const t = createHmac("sha256", engineKey).update(n + ":" + c, "utf8").digest("base64");
  return { n, c, t };
}

/** ENGINE_KEY: 32 random bytes, base64url (no characters the Apps Script prompt could mangle). */
export function newEngineKey(): string {
  return randomBytes(32).toString("base64url");
}
