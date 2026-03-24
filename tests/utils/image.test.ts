import { describe, test, expect } from "bun:test";
import { getPlatformLimits, getImageMimeType } from "../../src/utils/image.js";

describe("getPlatformLimits", () => {
  test("returns correct limits for known platforms", () => {
    const telegram = getPlatformLimits("telegram");
    expect(telegram.maxSize).toBe(10_000_000);

    const bluesky = getPlatformLimits("bluesky");
    expect(bluesky.maxSize).toBe(1_000_000);

    const x = getPlatformLimits("x");
    expect(x.maxSize).toBe(5_000_000);

    const discord = getPlatformLimits("discord");
    expect(discord.maxSize).toBe(25_000_000);
  });

  test("returns default limits for unknown platforms", () => {
    const unknown = getPlatformLimits("unknown-platform");
    expect(unknown.maxSize).toBe(5_000_000);
  });
});

describe("getImageMimeType", () => {
  test("detects PNG", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    expect(getImageMimeType(png)).toBe("image/png");
  });

  test("detects JPEG", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(getImageMimeType(jpeg)).toBe("image/jpeg");
  });

  test("detects GIF", () => {
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38]);
    expect(getImageMimeType(gif)).toBe("image/gif");
  });

  test("defaults to png for unknown", () => {
    const unknown = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    expect(getImageMimeType(unknown)).toBe("image/png");
  });
});
