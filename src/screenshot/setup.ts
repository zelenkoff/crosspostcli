import { existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

interface SetupStatus {
  installed: boolean;
  chromiumPath?: string;
  version?: string;
}

function findPlaywright(): boolean {
  try {
    require.resolve("playwright");
    return true;
  } catch {
    // Try dynamic check
    try {
      execSync("bun pm ls playwright 2>/dev/null", { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }
}

function findChromium(): string | undefined {
  // Check common Playwright browser paths
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const possiblePaths = [
    join(homeDir, ".cache", "ms-playwright"),
    join(homeDir, "Library", "Caches", "ms-playwright"),
    join(homeDir, "AppData", "Local", "ms-playwright"),
  ];

  for (const basePath of possiblePaths) {
    if (existsSync(basePath)) {
      return basePath;
    }
  }
  return undefined;
}

export function checkSetup(): SetupStatus {
  const installed = findPlaywright();
  const chromiumPath = findChromium();

  return {
    installed: installed && chromiumPath !== undefined,
    chromiumPath,
  };
}

export async function installPlaywright(
  onProgress?: (message: string) => void,
): Promise<boolean> {
  try {
    onProgress?.("Installing Playwright...");
    execSync("bun add playwright", {
      stdio: "pipe",
      cwd: process.cwd(),
      timeout: 120_000,
    });

    onProgress?.("Installing Chromium browser (~150MB)...");
    execSync("bunx playwright install chromium", {
      stdio: "pipe",
      timeout: 300_000,
    });

    onProgress?.("Playwright installed successfully.");
    return true;
  } catch (err) {
    onProgress?.(`Installation failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

export function getInstallInstructions(): string {
  return [
    "Screenshots require Playwright + Chromium (~150MB download).",
    "",
    "Install automatically:",
    "  crosspost screenshot --setup",
    "",
    "Or install manually:",
    "  bun add playwright",
    "  bunx playwright install chromium",
  ].join("\n");
}
