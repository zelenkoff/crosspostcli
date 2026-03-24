/**
 * Feature Discovery — Playwright-powered smart app explorer.
 *
 * Opens a running app, crawls pages, matches UI elements to changelog
 * keywords, highlights matches, and takes screenshots automatically.
 */

import type { Changelog, CommitInfo } from "./changelog.js";

export interface DiscoveryOptions {
  url: string;
  changelog?: Changelog;
  keywords?: string[];
  maxPages?: number;
  delay?: number;
  device?: string;
  darkMode?: boolean;
  hide?: string[];
  verbose?: boolean;
}

export interface DiscoveredFeature {
  keyword: string;
  matchedText: string;
  selector: string;
  pageUrl: string;
  pageTitle: string;
  screenshot: Buffer;
  confidence: number; // 0-1
}

export interface DiscoveryResult {
  features: DiscoveredFeature[];
  pagesVisited: string[];
  overviewScreenshot: Buffer;
}

/**
 * Extract meaningful search keywords from changelog commits.
 * Strips common verbs, prefixes, and filler words.
 */
export function extractKeywords(changelog: Changelog, extra?: string[]): string[] {
  const stopWords = new Set([
    "add", "added", "update", "updated", "fix", "fixed", "remove", "removed",
    "change", "changed", "implement", "implemented", "use", "used", "make",
    "the", "a", "an", "to", "for", "in", "on", "of", "and", "or", "is",
    "it", "that", "this", "with", "from", "by", "as", "be", "was", "were",
    "not", "but", "if", "at", "all", "can", "had", "has", "have", "do",
    "did", "will", "would", "should", "could", "new", "now", "when",
    "support", "handling", "into", "also", "more", "some",
  ]);

  const keywords = new Set<string>();

  const allCommits = [...changelog.features, ...changelog.fixes, ...changelog.other];

  for (const commit of allCommits) {
    const words = commit.subject
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    for (const word of words) {
      keywords.add(word);
    }

    // Also extract multi-word phrases (2-grams) for better matching
    const cleanSubject = commit.subject.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
    const allWords = cleanSubject.split(/\s+/).filter((w) => w.length > 1);
    for (let i = 0; i < allWords.length - 1; i++) {
      const phrase = `${allWords[i]} ${allWords[i + 1]}`;
      if (!stopWords.has(allWords[i]) || !stopWords.has(allWords[i + 1])) {
        keywords.add(phrase);
      }
    }
  }

  if (extra) {
    for (const k of extra) {
      keywords.add(k.toLowerCase());
    }
  }

  return Array.from(keywords);
}

/**
 * Discover features in a running app by crawling pages and matching
 * UI elements to changelog keywords.
 */
export async function discoverFeatures(options: DiscoveryOptions): Promise<DiscoveryResult> {
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
      "Or:  bun add playwright && bunx playwright install chromium",
    );
  }

  const { chromium, devices } = playwright;
  const maxPages = options.maxPages ?? 8;
  const delay = options.delay ?? 1500;

  // Build keyword list
  const keywords = options.keywords ?? [];
  if (options.changelog) {
    keywords.push(...extractKeywords(options.changelog));
  }

  if (keywords.length === 0) {
    throw new Error("No keywords to search for. Provide --from-git or --discover-keywords.");
  }

  // Resolve device config
  let contextOptions: Record<string, unknown> = {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  };

  if (options.device) {
    const normalizedDevice = options.device.toLowerCase().replace(/\s+/g, "-");
    if (devices[options.device]) {
      contextOptions = { ...contextOptions, ...devices[options.device] };
    } else {
      const match = Object.keys(devices).find(
        (d) => d.toLowerCase().includes(normalizedDevice),
      );
      if (match) contextOptions = { ...contextOptions, ...devices[match] };
    }
  }

  if (options.darkMode) {
    contextOptions.colorScheme = "dark";
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  const features: DiscoveredFeature[] = [];
  const visited = new Set<string>();
  const toVisit: string[] = [options.url];
  let overviewScreenshot: Buffer;

  try {
    // Take overview screenshot first
    await page.goto(options.url, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(delay);

    // Hide unwanted elements
    if (options.hide && options.hide.length > 0) {
      await hideElements(page, options.hide);
    }

    overviewScreenshot = (await page.screenshot({ type: "png" })) as Buffer;
    visited.add(normalizeUrl(options.url));

    // Crawl and discover
    while (toVisit.length > 0 && visited.size < maxPages) {
      const currentUrl = toVisit.shift()!;
      const normalizedCurrent = normalizeUrl(currentUrl);

      if (visited.has(normalizedCurrent)) continue;
      visited.add(normalizedCurrent);

      try {
        await page.goto(currentUrl, { waitUntil: "networkidle", timeout: 15_000 });
        await page.waitForTimeout(delay);

        if (options.hide && options.hide.length > 0) {
          await hideElements(page, options.hide);
        }
      } catch {
        continue; // Skip pages that fail to load
      }

      const pageTitle = await page.title();

      // Search for keyword matches in the page
      const matches = await page.evaluate((kws: string[]) => {
        const results: Array<{
          keyword: string;
          text: string;
          selector: string;
          confidence: number;
        }> = [];

        // Search through visible text-containing elements
        const candidates = document.querySelectorAll(
          "h1, h2, h3, h4, h5, h6, p, li, a, button, span, label, td, th, " +
          "[class*='title'], [class*='heading'], [class*='feature'], " +
          "[class*='card'], [class*='badge'], [class*='tag'], [class*='chip'], " +
          "[data-testid], [aria-label]",
        );

        for (const el of candidates) {
          const htmlEl = el as HTMLElement;
          if (htmlEl.offsetParent === null && htmlEl.style.display !== "flex") continue; // hidden

          const text = (htmlEl.textContent ?? "").trim().toLowerCase();
          const ariaLabel = (htmlEl.getAttribute("aria-label") ?? "").toLowerCase();
          const content = text + " " + ariaLabel;

          if (content.length < 2 || content.length > 500) continue;

          for (const kw of kws) {
            if (content.includes(kw)) {
              // Build a unique selector path
              let selector = htmlEl.tagName.toLowerCase();
              if (htmlEl.id) {
                selector = `#${htmlEl.id}`;
              } else if (htmlEl.className && typeof htmlEl.className === "string") {
                const cls = htmlEl.className.split(/\s+/).filter((c: string) => c.length > 0 && !c.includes(":")).slice(0, 2).join(".");
                if (cls) selector = `${selector}.${cls}`;
              }

              // Score based on match quality
              let confidence = 0.5;
              if (kw.includes(" ") && content.includes(kw)) confidence = 0.9; // phrase match
              if (text === kw) confidence = 1.0; // exact match
              if (["h1", "h2", "h3", "button", "a"].includes(htmlEl.tagName.toLowerCase())) {
                confidence = Math.min(1, confidence + 0.1); // boost for prominent elements
              }

              results.push({
                keyword: kw,
                text: (htmlEl.textContent ?? "").trim().slice(0, 100),
                selector,
                confidence,
              });
              break; // one keyword match per element is enough
            }
          }
        }

        // Deduplicate by text
        const seen = new Set<string>();
        return results.filter((r) => {
          if (seen.has(r.text)) return false;
          seen.add(r.text);
          return true;
        });
      }, keywords);

      // Screenshot each match with highlighting
      for (const match of matches) {
        if (match.confidence < 0.4) continue;

        try {
          // Highlight the matched element
          await page.evaluate((sel: string) => {
            const els = document.querySelectorAll(sel);
            els.forEach((el) => {
              (el as HTMLElement).style.outline = "3px solid #FF4444";
              (el as HTMLElement).style.outlineOffset = "4px";
              (el as HTMLElement).style.transition = "outline 0.2s";
            });
          }, match.selector);

          await page.waitForTimeout(300);

          // Try to scroll element into view and capture
          let screenshot: Buffer;
          try {
            const element = await page.$(match.selector);
            if (element) {
              await element.scrollIntoViewIfNeeded();
              await page.waitForTimeout(200);
            }
          } catch {
            // scroll failed, take full page shot instead
          }
          screenshot = (await page.screenshot({ type: "png" })) as Buffer;

          // Remove highlight
          await page.evaluate((sel: string) => {
            const els = document.querySelectorAll(sel);
            els.forEach((el) => {
              (el as HTMLElement).style.outline = "";
              (el as HTMLElement).style.outlineOffset = "";
            });
          }, match.selector);

          features.push({
            keyword: match.keyword,
            matchedText: match.text,
            selector: match.selector,
            pageUrl: currentUrl,
            pageTitle,
            screenshot,
            confidence: match.confidence,
          });
        } catch {
          // Skip elements that can't be screenshotted
        }
      }

      // Find links to crawl (same origin only)
      const links = await page.evaluate((baseUrl: string) => {
        const origin = new URL(baseUrl).origin;
        const anchors = document.querySelectorAll("a[href]");
        const hrefs: string[] = [];
        for (const a of anchors) {
          const href = (a as HTMLAnchorElement).href;
          try {
            const parsed = new URL(href);
            if (parsed.origin === origin && !parsed.hash && !href.includes("#")) {
              hrefs.push(href);
            }
          } catch {
            // skip invalid URLs
          }
        }
        return [...new Set(hrefs)];
      }, options.url);

      for (const link of links) {
        if (!visited.has(normalizeUrl(link))) {
          toVisit.push(link);
        }
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  // Sort by confidence, deduplicate by keyword
  features.sort((a, b) => b.confidence - a.confidence);
  const seenKeywords = new Set<string>();
  const deduped = features.filter((f) => {
    if (seenKeywords.has(f.keyword)) return false;
    seenKeywords.add(f.keyword);
    return true;
  });

  return {
    features: deduped,
    pagesVisited: Array.from(visited),
    overviewScreenshot: overviewScreenshot!,
  };
}

async function hideElements(page: unknown, selectors: string[]) {
  for (const selector of selectors) {
    await (page as { evaluate: (fn: (sel: string) => void, sel: string) => Promise<void> }).evaluate((sel: string) => {
      document.querySelectorAll(sel).forEach((el) => {
        (el as HTMLElement).style.display = "none";
      });
    }, selector);
  }
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}
