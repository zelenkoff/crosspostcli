import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";

export interface AuthOptions {
  /** Path to Playwright storage state file (cookies + localStorage from a previous session) */
  storageState?: string;
  /** HTTP Basic Auth credentials */
  httpCredentials?: { username: string; password: string };
  /** Custom HTTP headers applied to every request (e.g., { Authorization: "Bearer ..." }) */
  headers?: Record<string, string>;
  /** Cookies to inject before navigation */
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
    path?: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
  }>;
  /**
   * Login flow: navigate to this URL and fill a form before taking screenshots.
   * The browser will navigate here first, fill the fields, click submit, and wait
   * for navigation to complete before proceeding to the target URL.
   */
  login?: {
    /** URL of the login page */
    url: string;
    /** CSS selector → value pairs to fill (e.g., { "#email": "user@example.com", "#password": "s3cret" }) */
    fields: Record<string, string>;
    /** CSS selector of the submit button (default: 'button[type="submit"]') */
    submit?: string;
    /** Time in ms to wait after login for redirects to settle (default: 3000) */
    waitAfter?: number;
  };
}

export interface ScreenshotOptions {
  url: string;
  selector?: string;
  highlight?: string | string[];
  hide?: string[];
  viewport?: { width: number; height: number };
  device?: string;
  delay?: number;
  format?: "png" | "jpeg";
  quality?: number;
  fullPage?: boolean;
  output?: string;
  darkMode?: boolean;
  scaleFactor?: number;
  /** Authentication options for accessing protected apps */
  auth?: AuthOptions;
  /** @deprecated Use auth.storageState instead */
  storageState?: string;
}

export interface ScreenshotResult {
  path: string;
  buffer: Buffer;
  width: number;
  height: number;
  size: number;
  format: string;
}

// Well-known device presets for convenience
const DEVICE_PRESETS: Record<string, { viewport: { width: number; height: number }; userAgent?: string; deviceScaleFactor?: number; isMobile?: boolean }> = {
  "iphone-14": {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
  },
  "iphone-15-pro": {
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
  },
  "ipad": {
    viewport: { width: 810, height: 1080 },
    deviceScaleFactor: 2,
    isMobile: true,
  },
  "pixel-7": {
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
  },
  "desktop-hd": {
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  },
  "desktop-4k": {
    viewport: { width: 3840, height: 2160 },
    deviceScaleFactor: 1,
  },
  "macbook-pro": {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  },
};

export function listDevices(): string[] {
  return Object.keys(DEVICE_PRESETS);
}

export async function captureScreenshot(options: ScreenshotOptions): Promise<ScreenshotResult> {
  // Lazy-load Playwright
  let playwright;
  try {
    // Use require.resolve to find playwright relative to this package,
    // not the user's cwd
    const playwrightPath = require.resolve("playwright", { paths: [import.meta.dir, process.cwd()] });
    playwright = await import(playwrightPath);
  } catch {
    throw new Error(
      "Playwright is not installed.\n\n" +
      "Run: crosspost screenshot --setup\n" +
      "Or:  bun add playwright && bunx playwright install chromium"
    );
  }

  const { chromium, devices } = playwright;

  // Resolve device preset
  let deviceConfig: Record<string, unknown> = {};
  if (options.device) {
    const normalizedDevice = options.device.toLowerCase().replace(/\s+/g, "-");

    // Check our built-in presets first
    if (DEVICE_PRESETS[normalizedDevice]) {
      deviceConfig = DEVICE_PRESETS[normalizedDevice];
    }
    // Then check Playwright's device list
    else if (devices[options.device]) {
      deviceConfig = devices[options.device];
    } else {
      // Try fuzzy match
      const match = Object.keys(devices).find(
        (d) => d.toLowerCase().includes(normalizedDevice)
      );
      if (match) {
        deviceConfig = devices[match];
      } else {
        throw new Error(
          `Unknown device: "${options.device}"\n` +
          `Available: ${listDevices().join(", ")}\n` +
          `Or any Playwright device name.`
        );
      }
    }
  }

  const viewport = options.viewport ??
    (deviceConfig as { viewport?: { width: number; height: number } }).viewport ??
    { width: 1280, height: 800 };

  const scaleFactor = options.scaleFactor ??
    (deviceConfig as { deviceScaleFactor?: number }).deviceScaleFactor ?? 2;

  const browser = await chromium.launch({ headless: true });

  try {
    const contextOptions: Record<string, unknown> = {
      viewport,
      deviceScaleFactor: scaleFactor,
      ...(typeof deviceConfig === "object" ? deviceConfig : {}),
    };

    // Override viewport if explicitly provided
    if (options.viewport) {
      contextOptions.viewport = options.viewport;
    }

    // Dark mode
    if (options.darkMode) {
      contextOptions.colorScheme = "dark";
    }

    // Auth: storage state (new location or deprecated field)
    const auth = options.auth;
    const storageState = auth?.storageState ?? options.storageState;
    if (storageState) {
      contextOptions.storageState = storageState;
    }

    // Auth: HTTP Basic credentials
    if (auth?.httpCredentials) {
      contextOptions.httpCredentials = auth.httpCredentials;
    }

    // Auth: custom headers (Bearer tokens, API keys, etc.)
    if (auth?.headers && Object.keys(auth.headers).length > 0) {
      contextOptions.extraHTTPHeaders = auth.headers;
    }

    const context = await browser.newContext(contextOptions);

    // Auth: inject cookies
    if (auth?.cookies && auth.cookies.length > 0) {
      await context.addCookies(auth.cookies);
    }

    const page = await context.newPage();

    // Auth: login flow — fill form and submit before navigating to target
    if (auth?.login) {
      await page.goto(auth.login.url, { waitUntil: "networkidle", timeout: 30_000 });
      await page.waitForTimeout(1000);

      for (const [selector, value] of Object.entries(auth.login.fields)) {
        await page.fill(selector, value);
      }

      const submitSelector = auth.login.submit ?? 'button[type="submit"]';
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle", timeout: 15_000 }).catch(() => {}),
        page.click(submitSelector),
      ]);

      await page.waitForTimeout(auth.login.waitAfter ?? 3000);
    }

    // Navigate to target
    await page.goto(options.url, { waitUntil: "networkidle", timeout: 30_000 });

    // Wait for additional delay
    const delay = options.delay ?? 2000;
    if (delay > 0) {
      await page.waitForTimeout(delay);
    }

    // Hide elements (cookie banners, chat widgets, etc.)
    if (options.hide && options.hide.length > 0) {
      for (const selector of options.hide) {
        await page.evaluate((sel: string) => {
          document.querySelectorAll(sel).forEach((el) => {
            (el as HTMLElement).style.display = "none";
          });
        }, selector);
      }
    }

    // Highlight target elements
    const highlights = options.highlight
      ? Array.isArray(options.highlight) ? options.highlight : [options.highlight]
      : [];

    if (highlights.length > 0) {
      for (const selector of highlights) {
        await page.evaluate((sel: string) => {
          document.querySelectorAll(sel).forEach((el) => {
            (el as HTMLElement).style.outline = "3px solid #FF4444";
            (el as HTMLElement).style.outlineOffset = "2px";
          });
        }, selector);
      }
      // Brief pause to render highlights
      await page.waitForTimeout(200);
    }

    // Capture
    const format = options.format ?? "png";
    const screenshotOptions: Record<string, unknown> = {
      type: format,
      fullPage: options.fullPage ?? false,
    };

    if (format === "jpeg") {
      screenshotOptions.quality = options.quality ?? 90;
    }

    let screenshotBuffer: Buffer;

    if (options.selector) {
      const element = await page.$(options.selector);
      if (!element) {
        throw new Error(`Element not found: "${options.selector}"`);
      }
      screenshotBuffer = await element.screenshot(screenshotOptions) as Buffer;
    } else {
      screenshotBuffer = await page.screenshot(screenshotOptions) as Buffer;
    }

    // Get dimensions via page evaluation
    let width = viewport.width;
    let height = viewport.height;
    if (options.selector) {
      const box = await page.$(options.selector).then(async (el) => el?.boundingBox());
      if (box) {
        width = Math.round(box.width * scaleFactor);
        height = Math.round(box.height * scaleFactor);
      }
    } else {
      width = viewport.width * scaleFactor;
      height = viewport.height * scaleFactor;
    }

    await context.close();

    // Save to file
    const outputPath = options.output ??
      join(tmpdir(), `crosspost-screenshot-${Date.now()}.${format}`);

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, screenshotBuffer);

    return {
      path: outputPath,
      buffer: screenshotBuffer,
      width,
      height,
      size: screenshotBuffer.length,
      format,
    };
  } finally {
    await browser.close();
  }
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
