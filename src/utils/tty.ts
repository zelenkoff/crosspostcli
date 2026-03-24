export function isTTY(): boolean {
  return Boolean(process.stdout.isTTY);
}

export function supportsColor(): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined) return true;
  if (process.env.TERM === "dumb") return false;
  return isTTY();
}

export function isCI(): boolean {
  return Boolean(process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI);
}

export function terminalWidth(): number {
  return process.stdout.columns ?? 80;
}
