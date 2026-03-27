import { getSession, createSession } from "../session-store.js";
import type { AgentLoopResult } from "../../../src/core/ai-loop.js";

/**
 * GET /api/session/:sessionId
 * Returns the current state of a session (texts, screenshot indices, closed flag).
 */
export function handleGetSession(sessionId: string): Response {
  const session = getSession(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const texts = session.agentResult
    ? Object.fromEntries(session.agentResult.texts)
    : {};

  const screenshotIndices = session.agentResult
    ? session.agentResult.screenshots.map((_, i) => i)
    : [];

  return Response.json({ texts, screenshotIndices, sessionId, webClosed: session.webClosed ?? false });
}

/**
 * POST /api/session/import
 * Creates a new session from CLI-generated data (texts + screenshot buffers).
 * Body: multipart/form-data with:
 *   - texts: JSON string of Record<string, string>
 *   - screenshot_N: PNG buffer for each screenshot index N
 *
 * Returns { sessionId } for the browser to open /preview/:sessionId.
 */
export async function handleImportSession(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const textsJson = formData.get("texts");
    if (!textsJson || typeof textsJson !== "string") {
      return Response.json({ error: "Missing texts field" }, { status: 400 });
    }

    const texts: Record<string, string> = JSON.parse(textsJson);
    const session = createSession();

    // Collect screenshot buffers
    const screenshots: Array<{ buffer: Buffer; instruction: { description: string } }> = [];
    let i = 0;
    while (true) {
      const file = formData.get(`screenshot_${i}`);
      if (!file || !(file instanceof Blob)) break;
      const arrayBuffer = await file.arrayBuffer();
      screenshots.push({
        buffer: Buffer.from(arrayBuffer),
        instruction: { description: `Screenshot ${i}` },
      });
      session.screenshots.set(i, Buffer.from(arrayBuffer));
      i++;
    }

    // Build a minimal AgentLoopResult so existing session routes work
    session.agentResult = {
      texts: new Map(Object.entries(texts)),
      titles: new Map(),
      screenshots: screenshots as any,
      selectedScreenshots: new Map(),
      threads: new Map(),
      plan: { reasoning: "", screenshots: [] },
    } as AgentLoopResult;

    return Response.json({ sessionId: session.id });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/**
 * POST /api/session/:sessionId/close
 * Called by the browser when user posts or closes the preview.
 * CLI polls this to know when to resume.
 */
export function handleCloseSession(sessionId: string): Response {
  const session = getSession(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  session.webClosed = true;
  return Response.json({ ok: true });
}
