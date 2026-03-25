import { describe, test, expect } from "bun:test";
import { formatSize, listDevices } from "../../src/screenshot/capture.js";
import { checkSetup, getInstallInstructions } from "../../src/screenshot/setup.js";

describe("formatSize", () => {
  test("formats bytes", () => {
    expect(formatSize(500)).toBe("500B");
  });

  test("formats kilobytes", () => {
    expect(formatSize(1024)).toBe("1KB");
    expect(formatSize(1536)).toBe("2KB");
    expect(formatSize(340_000)).toBe("332KB");
  });

  test("formats megabytes", () => {
    expect(formatSize(1_048_576)).toBe("1.0MB");
    expect(formatSize(5_500_000)).toBe("5.2MB");
  });
});

describe("listDevices", () => {
  test("returns available device presets", () => {
    const devices = listDevices();
    expect(devices).toContain("iphone-14");
    expect(devices).toContain("iphone-15-pro");
    expect(devices).toContain("ipad");
    expect(devices).toContain("pixel-7");
    expect(devices).toContain("desktop-hd");
    expect(devices).toContain("macbook-pro");
    expect(devices.length).toBeGreaterThanOrEqual(6);
  });
});

describe("checkSetup", () => {
  test("returns setup status object", () => {
    const status = checkSetup();
    expect(typeof status.installed).toBe("boolean");
    // In test env, Playwright may or may not be installed
    // Just verify the shape is correct
    if (status.installed) {
      expect(status.chromiumPath).toBeDefined();
    }
  });
});

describe("getInstallInstructions", () => {
  test("returns installation instructions", () => {
    const instructions = getInstallInstructions();
    expect(instructions).toContain("Playwright");
    expect(instructions).toContain("crosspost screenshot --setup");
    expect(instructions).toContain("bun add playwright");
  });
});
