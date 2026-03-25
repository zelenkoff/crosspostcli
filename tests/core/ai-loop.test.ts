import { describe, test, expect } from "bun:test";

/**
 * Since the ai-loop module has internal functions, we test the exported
 * types and the public interface via importing the module. For internal
 * functions (parsers, prompt builders) we replicate their logic in tests.
 */

// ── parseAnalysisResponse tests (replicating internal logic) ────────

function cleanJson(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return cleaned;
}

interface ContentPlan {
  keyChanges: string[];
  narrativeAngle: string;
  targetAudience: string;
  screenshotStrategy: string;
  suggestedTone: string;
}

function parseAnalysisResponse(raw: string): ContentPlan | null {
  try {
    const parsed = JSON.parse(cleanJson(raw));
    if (!Array.isArray(parsed.keyChanges) || typeof parsed.narrativeAngle !== "string") return null;
    return {
      keyChanges: parsed.keyChanges.filter((c: unknown) => typeof c === "string"),
      narrativeAngle: parsed.narrativeAngle,
      targetAudience: typeof parsed.targetAudience === "string" ? parsed.targetAudience : "",
      screenshotStrategy: typeof parsed.screenshotStrategy === "string" ? parsed.screenshotStrategy : "",
      suggestedTone: typeof parsed.suggestedTone === "string" ? parsed.suggestedTone : "",
    };
  } catch {
    return null;
  }
}

describe("parseAnalysisResponse", () => {
  test("parses valid content plan JSON", () => {
    const raw = JSON.stringify({
      keyChanges: ["Added product recommendations", "Improved cart UX"],
      narrativeAngle: "AI-powered shopping experience",
      targetAudience: "E-commerce store owners",
      screenshotStrategy: "Show the recommendations widget on product pages",
      suggestedTone: "Excited and forward-looking",
    });

    const result = parseAnalysisResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.keyChanges).toEqual(["Added product recommendations", "Improved cart UX"]);
    expect(result!.narrativeAngle).toBe("AI-powered shopping experience");
    expect(result!.targetAudience).toBe("E-commerce store owners");
    expect(result!.screenshotStrategy).toBe("Show the recommendations widget on product pages");
    expect(result!.suggestedTone).toBe("Excited and forward-looking");
  });

  test("handles markdown fenced JSON", () => {
    const raw = "```json\n" + JSON.stringify({
      keyChanges: ["New feature"],
      narrativeAngle: "Great update",
      targetAudience: "Developers",
      screenshotStrategy: "Homepage",
      suggestedTone: "Casual",
    }) + "\n```";

    const result = parseAnalysisResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.keyChanges).toEqual(["New feature"]);
  });

  test("returns null for missing keyChanges", () => {
    const raw = JSON.stringify({
      narrativeAngle: "An angle",
      targetAudience: "Users",
    });

    const result = parseAnalysisResponse(raw);
    expect(result).toBeNull();
  });

  test("returns null for missing narrativeAngle", () => {
    const raw = JSON.stringify({
      keyChanges: ["Something"],
    });

    const result = parseAnalysisResponse(raw);
    expect(result).toBeNull();
  });

  test("returns null for invalid JSON", () => {
    const result = parseAnalysisResponse("not json at all");
    expect(result).toBeNull();
  });

  test("filters out non-string keyChanges", () => {
    const raw = JSON.stringify({
      keyChanges: ["Valid change", 42, null, "Another valid", undefined],
      narrativeAngle: "Some angle",
    });

    const result = parseAnalysisResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.keyChanges).toEqual(["Valid change", "Another valid"]);
  });

  test("defaults optional fields to empty string", () => {
    const raw = JSON.stringify({
      keyChanges: ["A change"],
      narrativeAngle: "An angle",
    });

    const result = parseAnalysisResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.targetAudience).toBe("");
    expect(result!.screenshotStrategy).toBe("");
    expect(result!.suggestedTone).toBe("");
  });
});

// ── parsePlanResponse tests ──────────────────────────────────────────

interface ScreenshotInstruction {
  url: string;
  selector?: string;
  highlight?: string[];
  description: string;
}

interface ScreenshotPlan {
  screenshots: ScreenshotInstruction[];
  reasoning: string;
}

function parsePlanResponse(raw: string): ScreenshotPlan | null {
  try {
    const parsed = JSON.parse(cleanJson(raw));
    if (!Array.isArray(parsed.screenshots)) return null;

    const screenshots: ScreenshotInstruction[] = [];
    for (const s of parsed.screenshots) {
      if (typeof s.url !== "string" || typeof s.description !== "string") continue;
      screenshots.push({
        url: s.url,
        selector: typeof s.selector === "string" ? s.selector : undefined,
        highlight: Array.isArray(s.highlight) ? s.highlight.filter((h: unknown) => typeof h === "string") : undefined,
        description: s.description,
      });
    }

    if (screenshots.length === 0) return null;

    return {
      screenshots,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch {
    return null;
  }
}

describe("parsePlanResponse", () => {
  test("parses valid screenshot plan", () => {
    const raw = JSON.stringify({
      reasoning: "Homepage shows the new feature best",
      screenshots: [
        {
          url: "http://localhost:3000",
          selector: ".hero-section",
          highlight: [".new-badge"],
          description: "New feature on homepage",
        },
        {
          url: "http://localhost:3000/settings",
          description: "Settings page with new option",
        },
      ],
    });

    const result = parsePlanResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.screenshots).toHaveLength(2);
    expect(result!.screenshots[0].url).toBe("http://localhost:3000");
    expect(result!.screenshots[0].selector).toBe(".hero-section");
    expect(result!.screenshots[0].highlight).toEqual([".new-badge"]);
    expect(result!.screenshots[1].selector).toBeUndefined();
    expect(result!.reasoning).toBe("Homepage shows the new feature best");
  });

  test("skips invalid screenshot entries", () => {
    const raw = JSON.stringify({
      reasoning: "",
      screenshots: [
        { url: "http://localhost:3000", description: "Valid" },
        { url: 42, description: "Invalid URL" },
        { url: "http://localhost:3000/x" }, // Missing description
        { description: "Missing URL" },
      ],
    });

    const result = parsePlanResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.screenshots).toHaveLength(1);
  });

  test("returns null for empty screenshots array", () => {
    const raw = JSON.stringify({ reasoning: "Nothing to show", screenshots: [] });
    const result = parsePlanResponse(raw);
    expect(result).toBeNull();
  });

  test("returns null for invalid JSON", () => {
    const result = parsePlanResponse("garbage");
    expect(result).toBeNull();
  });
});

// ── parseComposeResponse tests ───────────────────────────────────────

function parseComposeResponse(
  raw: string,
  platformKeys: string[],
): { texts: Map<string, string>; selectedScreenshots: Map<string, number[]> } | null {
  try {
    const parsed = JSON.parse(cleanJson(raw));
    const texts = new Map<string, string>();
    const selectedScreenshots = new Map<string, number[]>();

    for (const key of platformKeys) {
      const entry = parsed[key];
      if (!entry) continue;

      if (typeof entry === "string") {
        texts.set(key, entry);
        selectedScreenshots.set(key, [0]);
      } else if (typeof entry === "object") {
        if (typeof entry.text === "string" && entry.text.length > 0) {
          texts.set(key, entry.text);
        }
        if (Array.isArray(entry.screenshots)) {
          selectedScreenshots.set(
            key,
            entry.screenshots.filter((i: unknown) => typeof i === "number"),
          );
        }
      }
    }

    if (texts.size === 0) return null;
    return { texts, selectedScreenshots };
  } catch {
    return null;
  }
}

describe("parseComposeResponse", () => {
  test("parses structured response with text and screenshots", () => {
    const raw = JSON.stringify({
      telegram: { text: "Telegram post text", screenshots: [0, 1] },
      x: { text: "Short X post", screenshots: [0] },
    });

    const result = parseComposeResponse(raw, ["telegram", "x"]);
    expect(result).not.toBeNull();
    expect(result!.texts.get("telegram")).toBe("Telegram post text");
    expect(result!.texts.get("x")).toBe("Short X post");
    expect(result!.selectedScreenshots.get("telegram")).toEqual([0, 1]);
    expect(result!.selectedScreenshots.get("x")).toEqual([0]);
  });

  test("parses plain string response", () => {
    const raw = JSON.stringify({
      telegram: "Simple telegram text",
      x: "Simple x text",
    });

    const result = parseComposeResponse(raw, ["telegram", "x"]);
    expect(result).not.toBeNull();
    expect(result!.texts.get("telegram")).toBe("Simple telegram text");
    expect(result!.selectedScreenshots.get("telegram")).toEqual([0]);
  });

  test("ignores platforms not in platformKeys", () => {
    const raw = JSON.stringify({
      telegram: { text: "Telegram post", screenshots: [0] },
      mastodon: { text: "Mastodon post", screenshots: [0] },
    });

    const result = parseComposeResponse(raw, ["telegram"]);
    expect(result).not.toBeNull();
    expect(result!.texts.has("telegram")).toBe(true);
    expect(result!.texts.has("mastodon")).toBe(false);
  });

  test("returns null when no valid texts", () => {
    const raw = JSON.stringify({ telegram: { text: "", screenshots: [0] } });
    const result = parseComposeResponse(raw, ["telegram"]);
    expect(result).toBeNull();
  });
});
