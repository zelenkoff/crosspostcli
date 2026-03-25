import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { ConfigSchema, type Config } from "./schema.js";
import { encrypt, decrypt, isEncrypted } from "./encrypt.js";

const CONFIG_DIR = join(homedir(), ".crosspost");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const SECRET_KEYS = new Set([
  "bot_token",
  "api_key",
  "api_secret",
  "access_token",
  "access_secret",
  "app_password",
  "integration_token",
  "url", // webhook URLs
]);

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

function encryptSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string" && SECRET_KEYS.has(key) && !isEncrypted(value)) {
      result[key] = encrypt(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === "object" && item !== null
          ? encryptSecrets(item as Record<string, unknown>)
          : item
      );
    } else if (typeof value === "object" && value !== null) {
      result[key] = encryptSecrets(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function decryptSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string" && isEncrypted(value)) {
      result[key] = decrypt(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === "object" && item !== null
          ? decryptSecrets(item as Record<string, unknown>)
          : item
      );
    } else if (typeof value === "object" && value !== null) {
      result[key] = decryptSecrets(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function loadConfig(): Config {
  ensureDir();
  if (!existsSync(CONFIG_FILE)) {
    return ConfigSchema.parse({});
  }
  const raw = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  const decrypted = decryptSecrets(raw);
  return ConfigSchema.parse(decrypted);
}

export function saveConfig(config: Config): void {
  ensureDir();
  const encrypted = encryptSecrets(config as unknown as Record<string, unknown>);
  writeFileSync(CONFIG_FILE, JSON.stringify(encrypted, null, 2), { mode: 0o600 });
  try {
    chmodSync(CONFIG_FILE, 0o600);
  } catch {
    // Ignore chmod errors on some systems
  }
}

export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigFile(): string {
  return CONFIG_FILE;
}

export function resetConfig(): void {
  saveConfig(ConfigSchema.parse({}));
}
