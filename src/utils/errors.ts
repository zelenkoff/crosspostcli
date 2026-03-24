export class CrossPostError extends Error {
  constructor(
    message: string,
    public suggestion?: string,
    public platform?: string,
  ) {
    super(message);
    this.name = "CrossPostError";
  }
}

export class PlatformError extends CrossPostError {
  constructor(
    platform: string,
    message: string,
    suggestion?: string,
    public statusCode?: number,
  ) {
    super(message, suggestion, platform);
    this.name = "PlatformError";
  }
}

export class ConfigError extends CrossPostError {
  constructor(message: string, suggestion?: string) {
    super(message, suggestion);
    this.name = "ConfigError";
  }
}

export function formatError(error: unknown): { message: string; suggestion?: string } {
  if (error instanceof CrossPostError) {
    return { message: error.message, suggestion: error.suggestion };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: String(error) };
}

export function suggestForHttpError(statusCode: number, platform: string): string {
  switch (statusCode) {
    case 401:
      return `Your ${platform} credentials may have expired.\nRun: crosspost init`;
    case 403:
      return `Your ${platform} API key may not have the required permissions.\nCheck your app settings.`;
    case 429:
      return `Rate limited by ${platform}. Wait a moment and try again.`;
    case 500:
    case 502:
    case 503:
      return `${platform} is experiencing issues. Try again in a few minutes.`;
    default:
      return `Unexpected error from ${platform}. Run with --verbose for details.`;
  }
}
