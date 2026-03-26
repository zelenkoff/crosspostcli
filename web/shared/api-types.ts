// Serializable DTOs shared between server and client — no Buffer, no Map

export interface PlatformStatusDTO {
  key: string;
  name: string;
  status: "success" | "error" | "skipped" | "validating";
  detail?: string;
}

export interface StatusResponse {
  platforms: PlatformStatusDTO[];
}

export interface AnnounceStartRequest {
  description?: string;
  fromGit?: boolean;
  commits?: string;
  since?: string;
  tag?: string;
  appUrl?: string;
  only?: string[];
  exclude?: string[];
  dryRun?: boolean;
  tone?: string;
  verbosity?: string;
  lang?: string;
}

export interface AnnounceStartResponse {
  sessionId: string;
}

export type SSEEvent =
  | { type: "phase"; phase: string; detail: string }
  | { type: "plan"; contentPlan: ContentPlanDTO }
  | { type: "texts"; texts: Record<string, string> }
  | { type: "screenshot_ready"; index: number; description: string }
  | { type: "complete" }
  | { type: "error"; message: string };

export interface ContentPlanDTO {
  keyChanges: string[];
  narrativeAngle: string;
  targetAudience: string;
  screenshotStrategy: string;
  suggestedTone: string;
}

export interface PlanActionRequest {
  action: "continue" | "revise" | "abort";
  feedback?: string;
}

export interface ReviseRequest {
  feedback: string;
}

export interface PostRequest {
  sessionId: string;
  texts: Record<string, string>;
  dryRun?: boolean;
  only?: string[];
  exclude?: string[];
}

export interface PostResultDTO {
  platform: string;
  success: boolean;
  url?: string;
  error?: string;
}

export interface PostResponse {
  results: PostResultDTO[];
}
