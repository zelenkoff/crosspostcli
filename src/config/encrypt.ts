import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { hostname, userInfo } from "os";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1:";

function deriveKey(): Buffer {
  const machine = `${hostname()}:${userInfo().username}:crosspost-v1`;
  return scryptSync(machine, "crosspost-salt-v1", 32);
}

export function encrypt(value: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString("base64");
  return `${PREFIX}${payload}`;
}

export function decrypt(value: string): string {
  if (!value.startsWith(PREFIX)) {
    return value;
  }
  const key = deriveKey();
  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function mask(value: string): string {
  if (!value || value.length === 0) return "";
  const decrypted = isEncrypted(value) ? decrypt(value) : value;
  if (decrypted.length <= 8) return "****";
  return decrypted.slice(0, 4) + "****" + decrypted.slice(-4);
}
