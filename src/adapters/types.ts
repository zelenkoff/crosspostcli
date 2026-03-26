export interface PostContent {
  text: string;
  images?: Buffer[];
  url?: string;
  html?: string;
  markdown?: string;
  language?: string;
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
  post(content: PostContent): Promise<PostResult[]>;
  maxTextLength: number;
  supportsImages: boolean;
  supportsHtml: boolean;
  supportsMarkdown: boolean;
  formatText(text: string): string;
  /** Configured language for this platform/channel set (e.g. "ru", "en") */
  language?: string;
}
