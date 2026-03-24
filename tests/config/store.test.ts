import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Store tests use the real config file, so be careful
const CONFIG_DIR = join(homedir(), ".crosspost");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const BACKUP_FILE = join(CONFIG_DIR, "config.json.bak");

describe("config store", () => {
  let hadBackup = false;

  beforeEach(() => {
    // Back up existing config if present
    if (existsSync(CONFIG_FILE)) {
      const { copyFileSync } = require("fs");
      copyFileSync(CONFIG_FILE, BACKUP_FILE);
      hadBackup = true;
    }
  });

  afterEach(() => {
    // Restore backup
    if (hadBackup && existsSync(BACKUP_FILE)) {
      const { copyFileSync } = require("fs");
      copyFileSync(BACKUP_FILE, CONFIG_FILE);
      rmSync(BACKUP_FILE);
    } else if (existsSync(CONFIG_FILE) && !hadBackup) {
      rmSync(CONFIG_FILE);
    }
  });

  test("save and load config round-trip", async () => {
    const { saveConfig, loadConfig } = await import("../../src/config/store.js");
    const { ConfigSchema } = await import("../../src/config/schema.js");

    const config = ConfigSchema.parse({
      platforms: {
        telegram: {
          enabled: true,
          bot_token: "test-token-12345",
          channels: [{ id: "@testchannel", label: "Test" }],
        },
      },
    });

    saveConfig(config);
    expect(existsSync(CONFIG_FILE)).toBe(true);

    // Verify file is encrypted
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    expect(raw).not.toContain("test-token-12345");
    expect(raw).toContain("enc:v1:");

    // Load and verify decryption
    const loaded = loadConfig();
    expect(loaded.platforms.telegram.enabled).toBe(true);
    expect(loaded.platforms.telegram.bot_token).toBe("test-token-12345");
    expect(loaded.platforms.telegram.channels[0].id).toBe("@testchannel");
  });
});
