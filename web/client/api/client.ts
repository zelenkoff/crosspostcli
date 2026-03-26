import type {
  StatusResponse,
  AnnounceStartRequest,
  AnnounceStartResponse,
  PlanActionRequest,
  ReviseRequest,
  PostRequest,
  PostResponse,
} from "../../shared/api-types";

export async function fetchStatus(): Promise<StatusResponse> {
  const res = await fetch("/api/status");
  if (!res.ok) throw new Error(`Status check failed: ${res.statusText}`);
  return res.json();
}

export async function startAnnounce(body: AnnounceStartRequest): Promise<AnnounceStartResponse> {
  const res = await fetch("/api/announce/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to start: ${res.statusText}`);
  return res.json();
}

export function openAnnounceSteam(sessionId: string): EventSource {
  return new EventSource(`/api/announce/${sessionId}/stream`);
}

export async function sendPlanAction(sessionId: string, body: PlanActionRequest): Promise<void> {
  await fetch(`/api/announce/${sessionId}/plan-action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function sendRevise(sessionId: string, body: ReviseRequest): Promise<void> {
  await fetch(`/api/announce/${sessionId}/revise`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function postContent(body: PostRequest): Promise<PostResponse> {
  const res = await fetch("/api/post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Post failed: ${res.statusText}`);
  return res.json();
}

export function screenshotUrl(sessionId: string, index: number): string {
  return `/api/screenshots/${sessionId}/${index}`;
}
