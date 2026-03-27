export interface ThreadPost {
  text: string;
  /** Index into the images array for this post (optional) */
  imageIndex?: number;
}

export interface PostContent {
  text: string;
  images?: Buffer[];
  url?: string;
  html?: string;
  markdown?: string;
  language?: string;
  /**
   * Thread posts for platforms that support threading (Bluesky).
   * When present, the adapter posts this as a reply chain instead of a single post.
   * thread[0] is the root post, subsequent items are replies.
   */
  thread?: ThreadPost[];
}

export interface PostResult {
  platform: string;
  channel?: string;
  success: boolean;
  url?: string;
  error?: string;
  durationMs: number;
}

export interface PlatformConfig {
  enabled: boolean;
  [key: string]: unknown;
}

export interface Adapter {
  name: string;
  validate(): Promise<boolean>;
  /** Validate credentials and throw a descriptive error if invalid. */
  validateOrThrow?(): Promise<void>;
  post(content: PostContent): Promise<PostResult[]>;
  maxTextLength: number;
  supportsImages: boolean;
  supportsHtml: boolean;
  supportsMarkdown: boolean;
  formatText(text: string): string;
  /** Configured language for this platform/channel set (e.g. "ru", "en") */
  language?: string;
}
