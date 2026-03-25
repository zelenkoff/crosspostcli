import { describe, test, expect } from "bun:test";
import { extractKeywords } from "../../src/core/discover.js";
import type { Changelog, CommitInfo } from "../../src/core/changelog.js";

function mockCommit(subject: string, type: "feat" | "fix" | "other" = "feat"): CommitInfo {
  return { hash: "abc12345", subject, body: "", type, date: "2026-03-24" };
}

function mockChangelog(commits: CommitInfo[]): Changelog {
  return {
    commits,
    features: commits.filter((c) => c.type === "feat"),
    fixes: commits.filter((c) => c.type === "fix"),
    other: commits.filter((c) => c.type === "other"),
    range: "test",
    summary: "test",
  };
}

describe("discover", () => {
  describe("extractKeywords", () => {
    test("extracts meaningful keywords from commit subjects", () => {
      const changelog = mockChangelog([
        mockCommit("Add dark mode toggle"),
        mockCommit("Add export to PDF button"),
      ]);
      const keywords = extractKeywords(changelog);
      expect(keywords).toContain("dark");
      expect(keywords).toContain("mode");
      expect(keywords).toContain("toggle");
      expect(keywords).toContain("export");
      expect(keywords).toContain("pdf");
      expect(keywords).toContain("button");
    });

    test("filters out stop words", () => {
      const changelog = mockChangelog([mockCommit("Add the new feature to the app")]);
      const keywords = extractKeywords(changelog);
      expect(keywords).not.toContain("add");
      expect(keywords).not.toContain("the");
      expect(keywords).not.toContain("new");
      expect(keywords).not.toContain("to");
    });

    test("extracts two-word phrases", () => {
      const changelog = mockChangelog([mockCommit("Add dark mode")]);
      const keywords = extractKeywords(changelog);
      expect(keywords).toContain("dark mode");
    });

    test("includes extra keywords when provided", () => {
      const changelog = mockChangelog([mockCommit("Update sidebar")]);
      const keywords = extractKeywords(changelog, ["dashboard", "settings"]);
      expect(keywords).toContain("dashboard");
      expect(keywords).toContain("settings");
      expect(keywords).toContain("sidebar");
    });

    test("handles empty changelog", () => {
      const changelog = mockChangelog([]);
      const keywords = extractKeywords(changelog);
      expect(keywords).toEqual([]);
    });

    test("deduplicates keywords", () => {
      const changelog = mockChangelog([
        mockCommit("Fix dark mode"),
        mockCommit("Update dark mode toggle"),
      ]);
      const keywords = extractKeywords(changelog);
      const darkCount = keywords.filter((k) => k === "dark").length;
      expect(darkCount).toBe(1);
    });
  });
});
