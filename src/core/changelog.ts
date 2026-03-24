import { spawn } from "child_process";

export interface CommitInfo {
  hash: string;
  subject: string;
  body: string;
  type: "feat" | "fix" | "docs" | "chore" | "refactor" | "perf" | "test" | "other";
  scope?: string;
  date: string;
}

export interface Changelog {
  commits: CommitInfo[];
  features: CommitInfo[];
  fixes: CommitInfo[];
  other: CommitInfo[];
  range: string;
  summary: string;
}

const CONVENTIONAL_RE = /^(feat|fix|docs|chore|refactor|perf|test)(?:\(([^)]+)\))?:\s*(.+)/;

function parseConventionalCommit(message: string): { type: CommitInfo["type"]; scope?: string; subject: string } {
  const match = message.match(CONVENTIONAL_RE);
  if (match) {
    return { type: match[1] as CommitInfo["type"], scope: match[2], subject: match[3] };
  }
  return { type: "other", subject: message };
}

async function runGit(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr.trim() || `git exited with code ${code}`));
      else resolve(stdout);
    });
  });
}

const COMMIT_SEP = "---COMMIT---";
const FIELD_SEP = "---FIELD---";

export async function getCommitRange(options: {
  commits?: string;
  since?: string;
  tag?: string;
}): Promise<Changelog> {
  const args = ["log", `--format=${COMMIT_SEP}%H${FIELD_SEP}%s${FIELD_SEP}%b${FIELD_SEP}%ai`];

  let range = "";

  if (options.commits) {
    args.push(options.commits);
    range = options.commits;
  } else if (options.tag) {
    args.push(`${options.tag}..HEAD`);
    range = `${options.tag}..HEAD`;
  } else if (options.since) {
    args.push(`--since=${options.since}`);
    range = `since ${options.since}`;
  } else {
    // Default: last 10 commits
    args.push("-10");
    range = "last 10 commits";
  }

  const output = await runGit(args);
  const commits = parseGitLog(output);

  const features = commits.filter((c) => c.type === "feat");
  const fixes = commits.filter((c) => c.type === "fix");
  const other = commits.filter((c) => c.type !== "feat" && c.type !== "fix");

  return {
    commits,
    features,
    fixes,
    other,
    range,
    summary: summarizeChangelog(features.length, fixes.length, other.length),
  };
}

function parseGitLog(output: string): CommitInfo[] {
  const chunks = output.split(COMMIT_SEP).filter((s) => s.trim());
  return chunks.map((chunk) => {
    const parts = chunk.split(FIELD_SEP);
    const hash = (parts[0] ?? "").trim();
    const subject = (parts[1] ?? "").trim();
    const body = (parts[2] ?? "").trim();
    const date = (parts[3] ?? "").trim();

    const parsed = parseConventionalCommit(subject);
    return {
      hash: hash.slice(0, 8),
      subject: parsed.subject,
      body,
      type: parsed.type,
      scope: parsed.scope,
      date,
    };
  });
}

function summarizeChangelog(features: number, fixes: number, other: number): string {
  const parts: string[] = [];
  if (features > 0) parts.push(`${features} new feature${features > 1 ? "s" : ""}`);
  if (fixes > 0) parts.push(`${fixes} bug fix${fixes > 1 ? "es" : ""}`);
  if (other > 0) parts.push(`${other} other change${other > 1 ? "s" : ""}`);
  return parts.join(", ") || "no changes found";
}

export async function getDiffForRange(options: {
  commits?: string;
  since?: string;
  tag?: string;
}): Promise<string> {
  const args = ["diff", "--stat", "-p"];

  if (options.tag) {
    args.push(`${options.tag}..HEAD`);
  } else if (options.commits) {
    args.push(options.commits);
  } else {
    args.push("HEAD~10..HEAD");
  }

  try {
    const output = await runGit(args);
    // Truncate to ~3000 chars to keep token budget reasonable
    return output.slice(0, 3000);
  } catch {
    return "";
  }
}

export async function getProjectName(): Promise<string> {
  try {
    const remote = await runGit(["remote", "get-url", "origin"]);
    const match = remote.trim().match(/\/([^/]+?)(?:\.git)?$/);
    if (match) return match[1];
  } catch {
    // fall through
  }
  // Fallback to directory name
  const cwd = process.cwd();
  return cwd.split("/").pop() ?? "project";
}
