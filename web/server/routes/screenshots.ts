import { getSession } from "../session-store.js";

export function handleScreenshot(sessionId: string, index: number): Response {
  const session = getSession(sessionId);
  if (!session) return new Response("Session not found", { status: 404 });

  const buf = session.screenshots.get(index);
  if (!buf) return new Response("Screenshot not found", { status: 404 });

  return new Response(buf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
