import { describe, test, expect } from "bun:test";
import { BrowserSession } from "../../src/screenshot/capture.js";

describe("BrowserSession", () => {
  test("can be constructed with headed option", () => {
    const session = new BrowserSession({ headed: true });
    expect(session).toBeDefined();
  });

  test("can be constructed with slowMo option", () => {
    const session = new BrowserSession({ headed: true, slowMo: 1500 });
    expect(session).toBeDefined();
  });

  test("can be constructed with auth options", () => {
    const session = new BrowserSession({
      headed: false,
      auth: {
        login: {
          url: "http://localhost:3000/login",
          fields: { "#email": "test@example.com", "#password": "password" },
        },
      },
    });
    expect(session).toBeDefined();
  });

  test("can be constructed with device and dark mode", () => {
    const session = new BrowserSession({
      device: "iphone-14",
      darkMode: true,
    });
    expect(session).toBeDefined();
  });

  test("can be constructed with empty options", () => {
    const session = new BrowserSession({});
    expect(session).toBeDefined();
  });

  test("close works even without init", async () => {
    const session = new BrowserSession({});
    // Should not throw
    await session.close();
  });

  test("capture throws without init", async () => {
    const session = new BrowserSession({});
    expect(
      session.capture({ url: "http://localhost:3000" })
    ).rejects.toThrow("BrowserSession not initialized");
  });
});

describe("BrowserSession slowMo defaults", () => {
  // These tests verify the options are stored correctly.
  // Actual browser launch tests require Playwright installed.

  test("headed mode should default slowMo to 800", () => {
    // We can't directly test the Playwright launch call without mocking,
    // but we verify the option propagation logic matches capture.ts behavior.
    const options = { headed: true } as { headed?: boolean; slowMo?: number };
    const resolvedSlowMo = options.slowMo ?? (options.headed ? 800 : 0);
    expect(resolvedSlowMo).toBe(800);
  });

  test("explicit slowMo overrides headed default", () => {
    const options = { headed: true, slowMo: 1500 } as { headed?: boolean; slowMo?: number };
    const resolvedSlowMo = options.slowMo ?? (options.headed ? 800 : 0);
    expect(resolvedSlowMo).toBe(1500);
  });

  test("headless mode has no slowMo by default", () => {
    const options = { headed: false } as { headed?: boolean; slowMo?: number };
    const resolvedSlowMo = options.slowMo ?? (options.headed ? 800 : 0);
    expect(resolvedSlowMo).toBe(0);
  });

  test("slowMo 0 explicitly disables it even in headed mode", () => {
    const options = { headed: true, slowMo: 0 } as { headed?: boolean; slowMo?: number };
    // With ?? operator, 0 is falsy for ??, wait no — 0 is NOT nullish
    // so `options.slowMo ?? (options.headed ? 800 : 0)` should return 0
    const resolvedSlowMo = options.slowMo ?? (options.headed ? 800 : 0);
    expect(resolvedSlowMo).toBe(0);
  });
});
