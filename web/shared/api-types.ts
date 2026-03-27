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

export interface AuthOptions {
  /** Username for HTTP Basic auth */
  username?: string;
  /** Password for HTTP Basic auth */
  password?: string;
  /** Bearer token */
  token?: string;
  /** Cookie string (e.g. "session=abc123") */
  cookies?: string;
  /** Login page URL — will navigate here first and fill the form */
  loginUrl?: string;
  /** CSS selector for the username/email field on the login page */
  loginUsernameSelector?: string;
  /** CSS selector for the password field on the login page */
  loginPasswordSelector?: string;
  /** CSS selector for the submit button (default: button[type="submit"]) */
  loginSubmitSelector?: string;
}

export interface AnnounceStartRequest {
  description?: string;
  fromGit?: boolean;
  commits?: string;
  since?: string;
  tag?: string;
  appUrl?: string;
  auth?: AuthOptions;
  only?: string[];
  exclude?: string[];
  dryRun?: boolean;
  tone?: string;
  verbosity?: string;
  lang?: string;
  postStyle?: "auto" | "single-narrative" | "feature-list";
}

export interface AnnounceStartResponse {
  sessionId: string;
}

export type SSEEvent =
  | { type: "phase"; phase: string; detail: string }
  | { type: "plan"; contentPlan: ContentPlanDTO }
  | { type: "screenshot_plan"; screenshotPlan: ScreenshotPlanDTO }
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

export interface ScreenshotInstructionDTO {
  url: string;
  selector?: string;
  highlight?: string[];
  description: string;
}

export interface ScreenshotPlanDTO {
  reasoning: string;
  screenshots: ScreenshotInstructionDTO[];
}

export interface PlanActionRequest {
  action: "continue" | "revise" | "abort";
  feedback?: string;
}

export interface ScreenshotPlanActionRequest {
  /** The (possibly edited) screenshot instructions to proceed with */
  screenshots: ScreenshotInstructionDTO[];
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
