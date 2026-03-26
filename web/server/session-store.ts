import type { SSEEvent } from "../shared/api-types.js";
import type { AgentLoopResult, ContentPlan, ScreenshotPlan, ScreenshotInstruction } from "../../src/core/ai-loop.js";

// ── AsyncQueue ────────────────────────────────────────────────────────────────

export class AsyncQueue<T> {
  private items: T[] = [];
  private resolvers: Array<(value: T | null) => void> = [];
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve(item);
    } else {
      this.items.push(item);
    }
  }

  async next(): Promise<T | null> {
    if (this.items.length > 0) return this.items.shift()!;
    if (this.closed) return null;
    return new Promise<T | null>((resolve) => {
      this.resolvers.push(resolve);
    });
  }

  close(): void {
    this.closed = true;
    for (const resolve of this.resolvers) resolve(null);
    this.resolvers = [];
  }
}

// ── Session ───────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  createdAt: number;
  queue: AsyncQueue<SSEEvent>;
  /** Stored when agent loop completes — used for revise */
  agentResult?: AgentLoopResult;
  /** Per-index raw PNG buffers */
  screenshots: Map<number, Buffer>;
  /** Stored content plan for plan-action route */
  contentPlan?: ContentPlan;
  /** Unblocks the paused onPlanReady inside runAgentLoop */
  planResolverFn?: (r: { action: "continue" | "revise" | "abort"; feedback?: string }) => void;
  /** Unblocks the paused onScreenshotPlanReady inside runAgentLoop */
  screenshotPlanResolverFn?: (plan: ScreenshotPlan | null) => void;
  aborted: boolean;
}

// ── Store ─────────────────────────────────────────────────────────────────────

const sessions = new Map<string, Session>();

export function createSession(): Session {
  const id = crypto.randomUUID();
  const session: Session = {
    id,
    createdAt: Date.now(),
    queue: new AsyncQueue<SSEEvent>(),
    screenshots: new Map(),
    aborted: false,
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function deleteSession(id: string): void {
  sessions.delete(id);
}

// Auto-expire sessions after 30 minutes
const EXPIRE_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > EXPIRE_MS) {
      session.queue.close();
      sessions.delete(id);
    }
  }
}, 60_000);
