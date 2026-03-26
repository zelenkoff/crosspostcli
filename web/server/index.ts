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
        headers: corsHeaders(),
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

      } else {
        response = new Response("Not found", { status: 404 });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[server error]", msg);
      response = Response.json({ error: msg }, { status: 500 });
    }

    // Attach CORS headers to every response
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders())) {
      headers.set(k, v);
    }
    return new Response(response.body, {
      status: response.status,
      headers,
    });
  },
});

console.log(`CrossPost API server running on http://localhost:${PORT}`);

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "http://localhost:5173",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
