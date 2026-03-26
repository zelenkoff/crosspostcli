import { useReducer, useCallback } from "react";
import type { SSEEvent, ContentPlanDTO, ScreenshotPlanDTO, ScreenshotInstructionDTO, AnnounceStartRequest, PostResultDTO } from "../../shared/api-types";
import { startAnnounce, sendPlanAction, sendScreenshotPlanAction, sendRevise, postContent } from "../api/client";

export type AnnounceStage =
  | "idle"
  | "starting"
  | "running"
  | "plan-review"
  | "screenshot-plan-review"
  | "preview"
  | "posting"
  | "done"
  | "error";

export interface LogLine {
  phase: string;
  detail: string;
  ts: number;
}

export interface AnnounceState {
  stage: AnnounceStage;
  sessionId: string | null;
  streamUrl: string | null;
  logs: LogLine[];
  contentPlan: ContentPlanDTO | null;
  screenshotPlan: ScreenshotPlanDTO | null;
  texts: Record<string, string>;
  screenshotIndices: number[];
  postResults: PostResultDTO[];
  error: string | null;
}

type Action =
  | { type: "start" }
  | { type: "started"; sessionId: string }
  | { type: "plan_accepted" }
  | { type: "screenshot_plan_accepted" }
  | { type: "sse"; event: SSEEvent }
  | { type: "update_text"; key: string; value: string }
  | { type: "post_start" }
  | { type: "post_done"; results: PostResultDTO[] }
  | { type: "error"; message: string }
  | { type: "reset" };

const initial: AnnounceState = {
  stage: "idle",
  sessionId: null,
  streamUrl: null,
  logs: [],
  contentPlan: null,
  screenshotPlan: null,
  texts: {},
  screenshotIndices: [],
  postResults: [],
  error: null,
};

function reducer(state: AnnounceState, action: Action): AnnounceState {
  switch (action.type) {
    case "start":
      return { ...state, stage: "starting", logs: [], error: null, screenshotIndices: [], texts: {}, postResults: [], contentPlan: null };

    case "started":
      return {
        ...state,
        stage: "running",
        sessionId: action.sessionId,
        streamUrl: `/api/announce/${action.sessionId}/stream`,
      };

    case "plan_accepted":
      return { ...state, stage: "running" };

    case "screenshot_plan_accepted":
      return { ...state, stage: "running", screenshotPlan: null };

    case "sse": {
      const e = action.event;
      if (e.type === "phase") {
        return {
          ...state,
          logs: [...state.logs, { phase: e.phase, detail: e.detail, ts: Date.now() }],
        };
      }
      if (e.type === "plan") {
        return { ...state, stage: "plan-review", contentPlan: e.contentPlan };
      }
      if (e.type === "screenshot_plan") {
        return { ...state, stage: "screenshot-plan-review", screenshotPlan: e.screenshotPlan };
      }
      if (e.type === "texts") {
        return { ...state, stage: "preview", texts: e.texts };
      }
      if (e.type === "screenshot_ready") {
        return { ...state, screenshotIndices: [...state.screenshotIndices, e.index] };
      }
      if (e.type === "complete") {
        // If we already have texts, stay in preview, else move to done
        return { ...state, stage: state.texts && Object.keys(state.texts).length > 0 ? "preview" : "done" };
      }
      if (e.type === "error") {
        return { ...state, stage: "error", error: e.message };
      }
      return state;
    }

    case "update_text":
      return { ...state, texts: { ...state.texts, [action.key]: action.value } };

    case "post_start":
      return { ...state, stage: "posting" };

    case "post_done":
      return { ...state, stage: "done", postResults: action.results };

    case "error":
      return { ...state, stage: "error", error: action.message };

    case "reset":
      return initial;

    default:
      return state;
  }
}

export function useAnnounce() {
  const [state, dispatch] = useReducer(reducer, initial);

  const generate = useCallback(async (req: AnnounceStartRequest) => {
    dispatch({ type: "start" });
    try {
      const { sessionId } = await startAnnounce(req);
      dispatch({ type: "started", sessionId });
    } catch (err) {
      dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const onSSEEvent = useCallback((event: SSEEvent) => {
    dispatch({ type: "sse", event });
  }, []);

  const confirmScreenshotPlan = useCallback(async (screenshots: ScreenshotInstructionDTO[]) => {
    if (!state.sessionId) return;
    await sendScreenshotPlanAction(state.sessionId, { screenshots });
    dispatch({ type: "screenshot_plan_accepted" });
    dispatch({ type: "sse", event: { type: "phase", phase: "screenshotting", detail: "Starting screenshot capture..." } });
  }, [state.sessionId]);

  const continuePlan = useCallback(async (feedback?: string) => {
    if (!state.sessionId) return;
    const action = feedback?.trim() ? "revise" : "continue";
    await sendPlanAction(state.sessionId, { action, feedback });
    // Transition back to running so the UI shows spinner while agent generates content
    dispatch({ type: "plan_accepted" });
    dispatch({ type: "sse", event: { type: "phase", phase: "planning", detail: action === "revise" ? "Revising plan..." : "Continuing..." } });
  }, [state.sessionId]);

  const abortPlan = useCallback(async () => {
    if (!state.sessionId) return;
    await sendPlanAction(state.sessionId, { action: "abort" });
    dispatch({ type: "reset" });
  }, [state.sessionId]);

  const updateText = useCallback((key: string, value: string) => {
    dispatch({ type: "update_text", key, value });
  }, []);

  const revise = useCallback(async (feedback: string) => {
    if (!state.sessionId) return;
    await sendRevise(state.sessionId, { feedback });
    dispatch({ type: "sse", event: { type: "phase", phase: "revising", detail: "Regenerating content..." } });
  }, [state.sessionId]);

  const post = useCallback(async (dryRun = false) => {
    if (!state.sessionId) return;
    dispatch({ type: "post_start" });
    try {
      const response = await postContent({
        sessionId: state.sessionId,
        texts: state.texts,
        dryRun,
      });
      dispatch({ type: "post_done", results: response.results });
    } catch (err) {
      dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, [state.sessionId, state.texts]);

  const reset = useCallback(() => {
    dispatch({ type: "reset" });
  }, []);

  return {
    state,
    generate,
    onSSEEvent,
    continuePlan,
    abortPlan,
    confirmScreenshotPlan,
    updateText,
    revise,
    post,
    reset,
  };
}
