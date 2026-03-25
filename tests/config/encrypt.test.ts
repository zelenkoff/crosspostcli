import { describe, test, expect } from "bun:test";
import { encrypt, decrypt, isEncrypted, mask } from "../../src/config/encrypt.js";

describe("encrypt/decrypt", () => {
  test("round-trip encryption", () => {
    const original = "my-secret-bot-token-12345";
    const encrypted = encrypt(original);
    expect(encrypted).toStartWith("enc:v1:");
    expect(encrypted).not.toContain(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  test("different inputs produce different ciphertexts", () => {
    const a = encrypt("token-a");
    const b = encrypt("token-b");
    expect(a).not.toBe(b);
  });

  test("decrypt returns plain text if not encrypted", () => {
    expect(decrypt("plain-text")).toBe("plain-text");
  });

  test("isEncrypted detects encrypted strings", () => {
    expect(isEncrypted("enc:v1:abc123")).toBe(true);
    expect(isEncrypted("plain-text")).toBe(false);
    expect(isEncrypted("")).toBe(false);
  });
});

describe("mask", () => {
  test("masks long values", () => {
    const masked = mask("1234567890abcdef");
    expect(masked).toBe("1234****cdef");
  });

  test("masks short values", () => {
    expect(mask("short")).toBe("****");
  });

  test("masks encrypted values", () => {
    const encrypted = encrypt("my-long-secret-value");
    const masked = mask(encrypted);
    expect(masked).toContain("****");
    expect(masked).not.toContain("my-long-secret-value");
  });

  test("handles empty string", () => {
    expect(mask("")).toBe("");
  });
});
