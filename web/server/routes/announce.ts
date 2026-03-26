import { loadConfig } from "../../../src/config/store.js";
import { createAdapters, filterAdapters } from "../../../src/core/engine.js";
import { buildAiOptions } from "../../../src/core/ai-generator.js";
import { generateWithAi } from "../../../src/core/ai-generator.js";
import { runAgentLoop, reviseAgentContent } from "../../../src/core/ai-loop.js";
import { getCommitRange, getDiffForRange, getProjectName } from "../../../src/core/changelog.js";
import { detectTemplate } from "../../../src/core/announce-templates.js";
import type { AnnounceContext, Tone, Verbosity } from "../../../src/core/announce-templates.js";
import type { PostOptions } from "../../../src/core/engine.js";
import { createSession, getSession } from "../session-store.js";
import type { SSEEvent, AnnounceStartRequest, PlanActionRequest, ReviseRequest } from "../../shared/api-types.js";

// ── POST /api/announce/start ──────────────────────────────────────────────────

export async function handleAnnounceStart(req: Request): Promise<Response> {
  const body = (await req.json()) as AnnounceStartRequest;

  const session = createSession();

  // Fire-and-forget background task
  runAnnounceBackground(session.id, body).catch((err) => {
    const s = getSession(session.id);
    if (s) {
      s.queue.push({ type: "error", message: err instanceof Error ? err.message : String(err) });
      s.queue.close();
    }
  });

  return Response.json({ sessionId: session.id });
}

// ── GET /api/announce/:sessionId/stream ───────────────────────────────────────

export async function handleAnnounceStream(sessionId: string): Promise<Response> {
  const session = getSession(sessionId);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: SSEEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      };

      while (true) {
        const event = await session.queue.next();
        if (event === null) {
          // Queue closed
          controller.close();
          break;
        }
        send(event);
        if (event.type === "complete" || event.type === "error") {
          controller.close();
          break;
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ── POST /api/announce/:sessionId/plan-action ─────────────────────────────────

export async function handlePlanAction(sessionId: string, req: Request): Promise<Response> {
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

  const body = (await req.json()) as PlanActionRequest;
  if (session.planResolverFn) {
    session.planResolverFn({ action: body.action, feedback: body.feedback });
    session.planResolverFn = undefined;
  }
  return Response.json({ ok: true });
}

// ── POST /api/announce/:sessionId/revise ──────────────────────────────────────

export async function handleRevise(sessionId: string, req: Request): Promise<Response> {
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
  if (!session.agentResult) return Response.json({ error: "No agent result to revise" }, { status: 400 });

  const body = (await req.json()) as ReviseRequest;
  const { feedback } = body;

  const config = loadConfig();
  const aiOpts = buildAiOptions(config.ai);
  if (!aiOpts) return Response.json({ error: "AI not configured" }, { status: 400 });

  const postOptions: PostOptions = {};
  const adapters = createAdapters(config, postOptions);

  try {
    const revised = await reviseAgentContent({
      aiOptions: aiOpts,
      context: session.agentResult.contentPlan
        ? buildContextFromSession(config, feedback)
        : buildContextFromSession(config, feedback),
      adapters,
      agentResult: session.agentResult,
      feedback,
    });

    const texts = Object.fromEntries(revised.texts);
    session.queue.push({ type: "texts", texts });

    // Update stored result
    session.agentResult = {
      ...session.agentResult,
      texts: revised.texts,
      titles: revised.titles,
      selectedScreenshots: revised.selectedScreenshots,
    };

    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

// ── Background task ───────────────────────────────────────────────────────────

async function runAnnounceBackground(sessionId: string, body: AnnounceStartRequest): Promise<void> {
  const session = getSession(sessionId);
  if (!session) return;

  const emit = (type: SSEEvent["type"], extra: Partial<SSEEvent> = {}) => {
    session.queue.push({ type, ...extra } as SSEEvent);
  };

  const emitPhase = (phase: string, detail: string) => {
    session.queue.push({ type: "phase", phase, detail });
  };

  try {
    emitPhase("gather", "Loading configuration...");
    const config = loadConfig();
    const postOptions: PostOptions = {
      only: body.only,
      exclude: body.exclude,
    };
    const adapters = filterAdapters(createAdapters(config, postOptions), postOptions);

    if (adapters.size === 0) {
      throw new Error("No platforms configured. Run: crosspost init");
    }

    // Build context
    emitPhase("gather", "Building context...");
    let changelog;
    const useGit = body.fromGit || body.commits || body.since || body.tag;
    if (useGit) {
      changelog = await getCommitRange({
        commits: body.commits,
        since: body.since,
        tag: body.tag,
      });
    }

    const projectName = await getProjectName();
    const tone = (body.tone ?? "casual") as Tone;
    const template = detectTemplate(changelog);

    const context: AnnounceContext = {
      projectName,
      description: body.description,
      changelog,
      tone,
      template,
    };

    const aiOpts = buildAiOptions(config.ai);

    if (body.appUrl && aiOpts) {
      // Agent loop path (screenshot-aware)
      emitPhase("analyzing", "Starting agent loop...");

      const diff = await getDiffForRange({
        commits: body.commits,
        since: body.since,
        tag: body.tag,
      }).catch(() => null);

      const result = await runAgentLoop({
        aiOptions: aiOpts,
        context,
        appUrl: body.appUrl,
        adapters,
        verbosity: body.verbosity as Verbosity | undefined,
        diff: diff || undefined,
        language: body.lang,
        onStatus: (phase, detail) => {
          emitPhase(phase, detail);
        },
        onPlanReady: async (plan) => {
          // Store plan and expose resolver
          session.contentPlan = plan;
          session.queue.push({
            type: "plan",
            contentPlan: {
              keyChanges: plan.keyChanges,
              narrativeAngle: plan.narrativeAngle,
              targetAudience: plan.targetAudience,
              screenshotStrategy: plan.screenshotStrategy,
              suggestedTone: plan.suggestedTone,
            },
          });

          // Wait for user to respond via /plan-action
          return new Promise((resolve) => {
            session.planResolverFn = resolve;
          });
        },
      });

      // Store result + screenshots on session
      session.agentResult = result;
      for (let i = 0; i < result.screenshots.length; i++) {
        session.screenshots.set(i, result.screenshots[i].buffer);
        session.queue.push({
          type: "screenshot_ready",
          index: i,
          description: result.screenshots[i].instruction.description,
        });
      }

      const texts = Object.fromEntries(result.texts);
      session.queue.push({ type: "texts", texts });

    } else if (aiOpts) {
      // Simple AI path (no screenshots)
      emitPhase("generating", "Generating content with AI...");

      const diff = await getDiffForRange({
        commits: body.commits,
        since: body.since,
        tag: body.tag,
      }).catch(() => null);

      const texts = await generateWithAi(
        context,
        adapters,
        aiOpts,
        body.verbosity as Verbosity | undefined,
        diff || undefined,
        undefined,
        undefined,
        body.lang,
      );

      session.queue.push({ type: "texts", texts: Object.fromEntries(texts) });

    } else {
      throw new Error("AI not configured. Run: crosspost init");
    }

    session.queue.push({ type: "complete" });
    session.queue.close();

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    session.queue.push({ type: "error", message: msg });
    session.queue.close();
  }
}

// Minimal context builder for revise calls where we don't have full options
function buildContextFromSession(config: ReturnType<typeof loadConfig>, _feedback: string): AnnounceContext {
  return {
    projectName: "project",
    tone: "casual" as Tone,
    template: "update" as const,
  };
}
