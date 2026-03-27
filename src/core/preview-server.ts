import { spawn } from "child_process";
import { resolve } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import type { AgentLoopResult } from "./ai-loop.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const SERVER_PORT = 3420;
const SERVER_SCRIPT = resolve(__dirname, "../../web/server/index.ts");

export interface WebPreviewOptions {
  /** Generated texts per platform */
  texts: Map<string, string>;
  /** Screenshot buffers (from agent loop) */
  screenshots: AgentLoopResult["screenshots"];
  /** Called with the browser URL once the server is ready and browser is opening */
  onOpen?: (url: string) => void;
}

/**
 * Opens the browser-based preview editor for CLI-generated content.
 *
 * 1. Builds the web client if dist-web doesn't exist
 * 2. Starts the API server as a subprocess
 * 3. Imports the CLI session data into the server
 * 4. Opens the browser at /preview/:sessionId
 * 5. Returns a promise that resolves when the user posts or closes the browser
 */
export async function openWebPreview(options: WebPreviewOptions): Promise<void> {
  const distDir = resolve(__dirname, "../../dist-web");

  if (!existsSync(distDir)) {
    process.stderr.write("  Building web UI (first run)...\n");
    await buildClient();
    process.stderr.write("  ✓ Web UI built\n");
  }

  const serverProcess = startServer();

  // Wait for server to be ready (up to 8s)
  const up = await waitForServer(SERVER_PORT, 8000);
  if (!up) {
    serverProcess.kill();
    throw new Error("Preview server failed to start on port " + SERVER_PORT);
  }

  // Import session data into server
  const sessionId = await importSession(options);

  const url = `http://localhost:${SERVER_PORT}/preview/${sessionId}`;
  process.stderr.write(`  Opening browser: ${url}\n`);
  options.onOpen?.(url);
  openBrowser(url);

  // Block until user posts/closes in browser
  await waitForClose(sessionId);
  serverProcess.kill();
}

async function buildClient(): Promise<void> {
  const { execSync } = await import("child_process");
  execSync("bunx vite build --config web/vite.config.ts", {
    cwd: resolve(__dirname, "../.."),
    stdio: "pipe",
  });
}

function startServer(): ReturnType<typeof spawn> {
  const proc = spawn("bun", [SERVER_SCRIPT], {
    detached: false,
    stdio: "pipe",
  });
  // Don't keep the CLI alive just because of the server process
  proc.unref();
  return proc;
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" :
    process.platform === "win32" ? "start" :
    "xdg-open";
  spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
}

async function importSession(options: WebPreviewOptions): Promise<string> {
  const formData = new FormData();
  formData.append("texts", JSON.stringify(Object.fromEntries(options.texts)));

  for (let i = 0; i < options.screenshots.length; i++) {
    const blob = new Blob([options.screenshots[i].buffer], { type: "image/png" });
    formData.append(`screenshot_${i}`, blob, `screenshot_${i}.png`);
  }

  const res = await fetch(`http://localhost:${SERVER_PORT}/api/session/import`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown error");
    throw new Error(`Failed to import session: ${err}`);
  }

  const data = (await res.json()) as { sessionId: string };
  return data.sessionId;
}

async function waitForServer(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/api/status`);
      if (res.ok) return true;
    } catch {}
    await sleep(300);
  }
  return false;
}

async function waitForClose(sessionId: string): Promise<void> {
  const deadline = Date.now() + 30 * 60 * 1000; // 30 min max wait
  while (Date.now() < deadline) {
    await sleep(1500);
    try {
      const res = await fetch(`http://localhost:${SERVER_PORT}/api/session/${sessionId}`);
      if (!res.ok) return; // session gone
      const data = (await res.json()) as { webClosed?: boolean };
      if (data.webClosed) return;
    } catch {
      return;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
