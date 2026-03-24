import { describe, test, expect } from "bun:test";
import { getCommitRange, getProjectName } from "../../src/core/changelog.js";

describe("changelog", () => {
  test("getCommitRange parses git log", async () => {
    // This test runs against the actual repo
    const changelog = await getCommitRange({});
    expect(changelog.commits.length).toBeGreaterThan(0);
    expect(changelog.range).toBe("last 10 commits");
    expect(changelog.summary).toBeTruthy();

    // Each commit should have hash and subject
    for (const commit of changelog.commits) {
      expect(commit.hash).toBeTruthy();
      expect(commit.subject).toBeTruthy();
    }
  });

  test("getCommitRange groups commits by type", async () => {
    const changelog = await getCommitRange({});
    const total = changelog.features.length + changelog.fixes.length + changelog.other.length;
    expect(total).toBe(changelog.commits.length);
  });

  test("getCommitRange with since date returns commits", async () => {
    const changelog = await getCommitRange({ since: "2020-01-01" });
    expect(changelog.commits.length).toBeGreaterThan(0);
    expect(changelog.range).toBe("since 2020-01-01");
  });

  test("getProjectName returns a string", async () => {
    const name = await getProjectName();
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(0);
  });
});
