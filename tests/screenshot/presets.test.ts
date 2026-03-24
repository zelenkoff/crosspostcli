import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PRESETS_DIR = join(homedir(), ".crosspost");
const PRESETS_FILE = join(PRESETS_DIR, "screenshots.json");
const BACKUP_FILE = join(PRESETS_DIR, "screenshots.json.bak");

describe("screenshot presets", () => {
  let hadBackup = false;

  beforeEach(() => {
    if (existsSync(PRESETS_FILE)) {
      const { copyFileSync } = require("fs");
      copyFileSync(PRESETS_FILE, BACKUP_FILE);
      hadBackup = true;
    }
  });

  afterEach(() => {
    if (hadBackup && existsSync(BACKUP_FILE)) {
      const { copyFileSync } = require("fs");
      copyFileSync(BACKUP_FILE, PRESETS_FILE);
      rmSync(BACKUP_FILE);
    } else if (existsSync(PRESETS_FILE) && !hadBackup) {
      rmSync(PRESETS_FILE);
    }
  });

  test("save and load preset round-trip", async () => {
    const { savePreset, getPreset, listPresetNames } = await import("../../src/screenshot/presets.js");

    savePreset("dashboard", {
      url: "https://example.com/dashboard",
      selector: ".main-content",
      hide: [".cookie-banner", ".chat-widget"],
      viewport: { width: 1280, height: 800 },
      delay: 3000,
    });

    const preset = getPreset("dashboard");
    expect(preset).toBeDefined();
    expect(preset!.url).toBe("https://example.com/dashboard");
    expect(preset!.selector).toBe(".main-content");
    expect(preset!.hide).toEqual([".cookie-banner", ".chat-widget"]);
    expect(preset!.viewport).toEqual({ width: 1280, height: 800 });
    expect(preset!.delay).toBe(3000);

    const names = listPresetNames();
    expect(names).toContain("dashboard");
  });

  test("delete preset", async () => {
    const { savePreset, deletePreset, getPreset } = await import("../../src/screenshot/presets.js");

    savePreset("temp", { url: "https://example.com" });
    expect(getPreset("temp")).toBeDefined();

    const deleted = deletePreset("temp");
    expect(deleted).toBe(true);
    expect(getPreset("temp")).toBeUndefined();
  });

  test("delete non-existent preset returns false", async () => {
    const { deletePreset } = await import("../../src/screenshot/presets.js");
    expect(deletePreset("nonexistent-preset-xyz")).toBe(false);
  });

  test("get non-existent preset returns undefined", async () => {
    const { getPreset } = await import("../../src/screenshot/presets.js");
    expect(getPreset("nonexistent-preset-xyz")).toBeUndefined();
  });
});
