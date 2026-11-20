import { describe, expect, it } from "vitest";
import { seal, newEngineKey } from "@/lib/crypto/seal";
import { decrypt, encrypt, infoOf, keyFrom } from "@/lib/crypto/secrets";
import { loadCodeGs } from "./gas";

const { ctx } = loadCodeGs();

describe("seal ↔ openSealed_ (Code.gs in a vm)", () => {
  const cases = [
    "eyJhbGciOiJIUzI1NiJ9.تجربة.token-123",
    "a",
    "x".repeat(32),
    "y".repeat(33),
    "توكن عربي بالكامل — مع رموز ✓ و emoji 🚀 ".repeat(5),
  ];
  for (const pt of cases) {
    it(`round-trips ${pt.slice(0, 20)}… (${Buffer.byteLength(pt)} bytes)`, () => {
      const key = newEngineKey();
      expect(ctx.openSealed_(seal(pt, key), key)).toBe(pt);
    });
  }
  it("rejects a wrong ENGINE_KEY", () => {
    const s = seal("secret", newEngineKey());
    expect(() => ctx.openSealed_(s, newEngineKey())).toThrow(/ENGINE_KEY/);
  });
  it("rejects a tampered ciphertext", () => {
    const key = newEngineKey();
    const s = seal("secret-token", key);
    const c = Buffer.from(s.c, "base64"); c[0] ^= 1;
    expect(() => ctx.openSealed_({ ...s, c: c.toString("base64") }, key)).toThrow();
  });
  it("uses a fresh nonce each time", () => {
    const key = newEngineKey();
    expect(seal("t", key).n).not.toBe(seal("t", key).n);
  });
});

describe("AES-256-GCM secrets", () => {
  const key = keyFrom(Buffer.alloc(32, 7).toString("base64"));
  it("round-trips and exposes only last4", () => {
    const e = encrypt("my-secret-token-ABCD", key);
    expect(e.ct).not.toContain("secret");
    expect(decrypt(e, key)).toBe("my-secret-token-ABCD");
    expect(infoOf(e)).toEqual({ set: true, last4: "ABCD", updatedAt: e.updatedAt });
  });
  it("fails with another key", () => {
    const e = encrypt("x", key);
    expect(() => decrypt(e, keyFrom(Buffer.alloc(32, 8).toString("hex")))).toThrow();
  });
  it("accepts hex, base64 and passphrase keys", () => {
    expect(keyFrom("a".repeat(64)).length).toBe(32);
    expect(keyFrom(Buffer.alloc(32, 1).toString("base64")).length).toBe(32);
    expect(keyFrom("some passphrase").length).toBe(32);
    expect(() => keyFrom(undefined)).toThrow();
  });
});
