import { handleStatus } from "./routes/status.js";
import {
  handleAnnounceStart,
  handleAnnounceStream,
  handlePlanAction,
  handleScreenshotPlanAction,
  handleRevise,
} from "./routes/announce.js";
import { handleScreenshot } from "./routes/screenshots.js";
import { handlePost } from "./routes/post.js";
import { handleGetSession, handleImportSession, handleCloseSession } from "./routes/session.js";

const PORT = 3420;

Bun.serve({
  port: PORT,
  idleTimeout: 0, // disable timeout — SSE streams stay open for minutes
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;
    const method = req.method.toUpperCase();

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(req.headers.get("origin")),
      });
    }

    let response: Response;

    try {
      if (method === "GET" && pathname === "/api/status") {
        response = await handleStatus();

      } else if (method === "POST" && pathname === "/api/announce/start") {
        response = await handleAnnounceStart(req);

      } else if (method === "GET" && pathname.startsWith("/api/announce/")) {
        const parts = pathname.split("/");
        // /api/announce/:sessionId/stream
        if (parts.length === 5 && parts[4] === "stream") {
          response = await handleAnnounceStream(parts[3]);
        } else {
          response = new Response("Not found", { status: 404 });
        }

      } else if (method === "POST" && pathname.startsWith("/api/announce/")) {
        const parts = pathname.split("/");
        if (parts.length === 5 && parts[4] === "plan-action") {
          response = await handlePlanAction(parts[3], req);
        } else if (parts.length === 5 && parts[4] === "screenshot-plan-action") {
          response = await handleScreenshotPlanAction(parts[3], req);
        } else if (parts.length === 5 && parts[4] === "revise") {
          response = await handleRevise(parts[3], req);
        } else {
          response = new Response("Not found", { status: 404 });
        }

      } else if (method === "GET" && pathname.startsWith("/api/screenshots/")) {
        // /api/screenshots/:sessionId/:index
        const parts = pathname.split("/");
        if (parts.length === 5) {
          response = handleScreenshot(parts[3], Number(parts[4]));
        } else {
          response = new Response("Not found", { status: 404 });
        }

      } else if (method === "POST" && pathname === "/api/post") {
        response = await handlePost(req);

      } else if (method === "GET" && pathname.startsWith("/api/session/")) {
        const parts = pathname.split("/");
        // /api/session/:sessionId
        if (parts.length === 4) {
          response = handleGetSession(parts[3]);
        } else {
          response = new Response("Not found", { status: 404 });
        }

      } else if (method === "POST" && pathname === "/api/session/import") {
        response = await handleImportSession(req);

      } else if (method === "POST" && pathname.startsWith("/api/session/")) {
        const parts = pathname.split("/");
        // /api/session/:sessionId/close
        if (parts.length === 5 && parts[4] === "close") {
          response = handleCloseSession(parts[3]);
        } else {
          response = new Response("Not found", { status: 404 });
        }

      } else {
        // Try serving static files from dist-web (built client)
        response = await serveStatic(pathname);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[server error]", msg);
      response = Response.json({ error: msg }, { status: 500 });
    }

    // Attach CORS headers to every response
    const origin = req.headers.get("origin");
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders(origin))) {
      headers.set(k, v);
    }
    return new Response(response.body, {
      status: response.status,
      headers,
    });
  },
});

console.log(`CrossPost API server running on http://localhost:${PORT}`);

async function serveStatic(pathname: string): Promise<Response> {
  const { join, resolve } = await import("path");
  const { existsSync } = await import("fs");

  const distDir = resolve(import.meta.dir, "../../dist-web");
  if (!existsSync(distDir)) {
    return new Response("Web UI not built. Run: bun run web:build", { status: 503 });
  }

  // Sanitize path
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = join(distDir, safePath);

  // Prevent path traversal
  if (!filePath.startsWith(distDir)) {
    return new Response("Forbidden", { status: 403 });
  }

  const file = Bun.file(filePath);
  if (await file.exists()) {
    return new Response(file);
  }

  // SPA fallback — serve index.html for any unknown path
  return new Response(Bun.file(join(distDir, "index.html")));
}

function corsHeaders(origin?: string | null): Record<string, string> {
  // Allow any localhost origin (vite dev server on 5173, built server on PORT, etc.)
  const allowedOrigin = origin && /^http:\/\/localhost(:\d+)?$/.test(origin)
    ? origin
    : `http://localhost:5173`;
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
