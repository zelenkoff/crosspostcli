import React, { useState, useEffect } from "react";
import { Box, Text, render, useInput, useStdin } from "ink";
import Spinner from "ink-spinner";
import { loadConfig } from "../config/store.js";
import { createAdapters, filterAdapters, postToAll, type PostOptions } from "../core/engine.js";
import type { PostResult } from "../adapters/types.js";
import { getCommitRange, getProjectName, rebuildChangelog, getDiffForHashes, getUiDiffForHashes, type Changelog, type CommitInfo } from "../core/changelog.js";
import {
  generateAllPlatforms,
  generateForPlatform,
  detectTemplate,
  type AnnounceContext,
  type Tone,
  type TemplateType,
  type Verbosity,
  type PostStyle,
} from "../core/announce-templates.js";
import { PostSummary } from "../ui/PostSummary.js";
import { CommitSelector } from "../ui/CommitSelector.js";
import { PostStyleSelector } from "../ui/PostStyleSelector.js";
import { ErrorBox } from "../ui/ErrorBox.js";
import { StepIndicator } from "../ui/StepIndicator.js";
import { PlatformStatusLine, type StatusState } from "../ui/PlatformStatus.js";
import { captureScreenshot, type ScreenshotOptions } from "../screenshot/capture.js";
import { getPreset, presetToOptions } from "../screenshot/presets.js";
import { discoverFeatures, type DiscoveryResult, type DiscoveredFeature } from "../core/discover.js";
import { readFileSync } from "fs";
import { getDiffForRange, getUiDiff } from "../core/changelog.js";
import { generateWithAi, buildAiOptions } from "../core/ai-generator.js";
import { runAgentLoop, reviseAgentContent, getScreenshotsForPlatform, type AgentPhase, type AgentLoopResult, type ContentPlan } from "../core/ai-loop.js";
import type { AuthOptions } from "../screenshot/capture.js";

export interface AnnounceCommandOptions {
  description?: string;
  fromGit?: boolean;
  commits?: string;
  since?: string;
  tag?: string;
  from?: string;
  screenshot?: string;
  screenshotSelector?: string;
  screenshotHighlight?: string[];
  screenshotHide?: string[];
  screenshotDevice?: string;
  screenshotDelay?: number;
  screenshotPreset?: string;
  screenshotDark?: boolean;
  discover?: string;
  discoverKeywords?: string[];
  discoverMaxPages?: number;
  discoverDevice?: string;
  projectName?: string;
  version?: string;
  url?: string;
  tone?: string;
  template?: string;
  verbosity?: string;
  only?: string[];
  exclude?: string[];
  dryRun?: boolean;
  json?: boolean;
  noConfirm?: boolean;
  image?: string[];
  blogSlug?: string;
  blogTitle?: string;
  telegram?: string;
  x?: string;
  bluesky?: string;
  mastodon?: string;
  discord?: string;
  medium?: string;
  ai?: boolean;
  aiProvider?: string;
  aiModel?: string;
  /** Auth for protected apps (used by discover/agent-loop) */
  auth?: AuthOptions;
  /** Run browser in headed mode (visible window) for debugging */
  headed?: boolean;
  /** Slow down browser actions by this many ms (default: 800 when headed) */
  slowMo?: number;
  /** Custom system prompt for AI content generation */
  systemPrompt?: string;
  /** Language code for this post (e.g. ru, en, es) — routes to matching channels, AI writes in this language */
  lang?: string;
}

type Phase = "gather" | "commit-select" | "post-style-select" | "discover" | "screenshot" | "ai-generating" | "agent-loop" | "plan-review" | "preview" | "content-revise" | "revising" | "posting" | "done" | "error";

interface PlatformState {
  key: string;
  name: string;
  status: StatusState;
  detail?: string;
  channel?: string;
}

function AnnounceUI({ options }: { options: AnnounceCommandOptions }) {
  const [phase, setPhase] = useState<Phase>("gather");
  const [changelog, setChangelog] = useState<Changelog | null>(null);
  const [screenshotBuffer, setScreenshotBuffer] = useState<Buffer | null>(null);
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResult | null>(null);
  const [discoverStatus, setDiscoverStatus] = useState<string>("");
  const [generatedTexts, setGeneratedTexts] = useState<Map<string, string>>(new Map());
  const [platformStates, setPlatformStates] = useState<PlatformState[]>([]);
  const [results, setResults] = useState<PostResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorSuggestion, setErrorSuggestion] = useState<string | undefined>();
  const [startTime] = useState(Date.now());
  const [context, setContext] = useState<AnnounceContext | null>(null);
  const [aiUsed, setAiUsed] = useState(false);
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [agentLoopResult, setAgentLoopResult] = useState<AgentLoopResult | null>(null);
  const [agentStatus, setAgentStatus] = useState<string>("");
  const [agentPhase, setAgentPhase] = useState<AgentPhase | null>(null);
  const [contentPlan, setContentPlan] = useState<ContentPlan | null>(null);
  const [planFeedback, setPlanFeedback] = useState<string>("");
  const [contentReviseInput, setContentReviseInput] = useState<string>("");
  // Resolver for the agent loop's onPlanReady callback
  const planResolverRef = React.useRef<((result: { action: "continue" | "revise" | "abort"; feedback?: string }) => void) | null>(null);
  // Guard: prevent the agent-loop useEffect from re-running while the loop is already in progress
  const agentLoopRunningRef = React.useRef(false);
  // Commit selection state
  const [pendingChangelog, setPendingChangelog] = useState<Changelog | null>(null);
  const commitSelectResolverRef = React.useRef<((commits: CommitInfo[]) => void) | null>(null);
  // Selected commit hashes — set after commit-select, used to scope diffs
  const [selectedHashes, setSelectedHashes] = useState<string[] | null>(null);
  // Guard: prevent gather useEffect from re-running after commit-select resolver fires
  const gatherDoneRef = React.useRef(false);
  // Post style selection state
  const postStyleResolverRef = React.useRef<((style: PostStyle) => void) | null>(null);

  const { isRawModeSupported } = useStdin();
  const rawModeOk = isRawModeSupported === true;

  // Handle keyboard input during preview phase
  useInput(
    (input, key) => {
      if (phase !== "preview") return;
      const lower = input.toLowerCase();
      if (lower === "p" || key.return) {
        setPhase("posting");
      } else if (lower === "q" || key.escape) {
        process.exit(0);
      } else if (lower === "e" && aiUsed) {
        setContentReviseInput("");
        setPhase("content-revise");
      }
    },
    { isActive: phase === "preview" && rawModeOk },
  );

  // Handle keyboard input during plan-review phase
  useInput(
    (input, key) => {
      if (phase !== "plan-review") return;

      if (key.return) {
        const resolver = planResolverRef.current;
        if (resolver) {
          planResolverRef.current = null;
          if (planFeedback.trim()) {
            // User typed feedback — revise the plan.
            // The resolver unblocks the still-running agent loop which handles the revision.
            // We go back to agent-loop UI to show progress, but do NOT re-trigger the effect
            // (the agent loop is already running and waiting on this resolver).
            resolver({ action: "revise", feedback: planFeedback.trim() });
            setPlanFeedback("");
          } else {
            // Empty input — continue with current plan.
            // The resolver unblocks the agent loop which proceeds to screenshots.
            resolver({ action: "continue" });
          }
          // Return to agent-loop UI to show progress (the effect won't re-trigger
          // because it's gated by agentLoopRunningRef)
          setPhase("agent-loop");
        }
      } else if (key.escape) {
        const resolver = planResolverRef.current;
        if (resolver) {
          planResolverRef.current = null;
          resolver({ action: "abort" });
        }
        process.exit(0);
      } else if (key.backspace || key.delete) {
        setPlanFeedback((prev) => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setPlanFeedback((prev) => prev + input);
      }
    },
    { isActive: phase === "plan-review" && rawModeOk },
  );

  // Handle keyboard input during content-revise phase
  useInput(
    (input, key) => {
      if (phase !== "content-revise") return;

      if (key.return) {
        if (contentReviseInput.trim()) {
          setPhase("revising");
        }
      } else if (key.escape) {
        setPhase("preview");
      } else if (key.backspace || key.delete) {
        setContentReviseInput((prev) => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setContentReviseInput((prev) => prev + input);
      }
    },
    { isActive: phase === "content-revise" && rawModeOk },
  );

  // Phase: Revising content with AI feedback
  useEffect(() => {
    if (phase !== "revising" || !context) return;
    (async () => {
      try {
        const config = loadConfig();
        const postOptions: PostOptions = { only: options.only, exclude: options.exclude };
        const adapters = filterAdapters(createAdapters(config, postOptions), postOptions);
        const aiOpts = buildAiOptions(config.ai, { provider: options.aiProvider, model: options.aiModel });

        if (!aiOpts) {
          setPhase("preview");
          return;
        }

        const feedback = contentReviseInput.trim();

        if (agentLoopResult) {
          // Agent loop path: revise using screenshots
          const revised = await reviseAgentContent({
            aiOptions: aiOpts,
            context,
            adapters,
            agentResult: agentLoopResult,
            feedback,
            verbosity: (options.verbosity as Verbosity) ?? undefined,
            diff: undefined,
            systemPrompt: options.systemPrompt,
            language: options.lang,
          });
          setGeneratedTexts(revised.texts);
          setAgentLoopResult({
            ...agentLoopResult,
            texts: revised.texts,
            titles: revised.titles,
            selectedScreenshots: revised.selectedScreenshots,
            threads: revised.threads,
          });
        } else {
          // Simple AI path: regenerate with feedback
          const diff = await getDiffForRange({
            commits: options.commits,
            since: options.since,
            tag: options.tag,
          }).catch(() => null);

          const texts = await generateWithAi(
            context,
            adapters,
            aiOpts,
            (options.verbosity as Verbosity) ?? undefined,
            diff || undefined,
            options.systemPrompt,
            { previousTexts: generatedTexts, feedback },
            options.lang,
          );
          setGeneratedTexts(texts);
        }

        setContentReviseInput("");
        setPhase("preview");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setAiWarning(`AI revision failed: ${msg}. Keeping previous content.`);
        setPhase("preview");
      }
    })();
  }, [phase]);

  // Phase: Gather
  useEffect(() => {
    if (phase !== "gather") return;
    if (gatherDoneRef.current) return; // already completed; this re-render was triggered by commit-select returning
    gatherDoneRef.current = true;
    (async () => {
      try {
        let log: Changelog | undefined;
        let description = options.description;

        // Read description from file if specified
        if (options.from) {
          description = readFileSync(options.from, "utf-8").trim();
        }

        // Gather git history
        const useGit = options.fromGit || options.commits || options.since || options.tag;
        if (useGit) {
          try {
            log = await getCommitRange({
              commits: options.commits,
              since: options.since,
              tag: options.tag,
            });

            // If more than one commit and not skipping confirms, let user filter
            if (log.commits.length > 1 && !options.noConfirm) {
              setPendingChangelog(log);
              setPhase("commit-select");
              const selectedCommits = await new Promise<CommitInfo[]>((resolve) => {
                commitSelectResolverRef.current = resolve;
              });
              log = rebuildChangelog(selectedCommits);
              setSelectedHashes(selectedCommits.map((c) => c.hash));
            }

            setChangelog(log);
          } catch (err) {
            setError(`Git error: ${err instanceof Error ? err.message : String(err)}`);
            setErrorSuggestion("Use: crosspost announce \"description\" instead of --from-git");
            setPhase("error");
            return;
          }
        }

        if (!description && !log && !options.discover) {
          setError("No description or git range provided.");
          setErrorSuggestion(
            'Usage: crosspost announce "description" or crosspost announce --from-git --tag v1.0',
          );
          setPhase("error");
          return;
        }

        // Post style selection (only when AI is available and not skipping confirms)
        let postStyle: PostStyle = "auto";
        if (!options.noConfirm && options.ai !== false) {
          const cfg = loadConfig();
          const aiOpts = buildAiOptions(cfg.ai, { provider: options.aiProvider, model: options.aiModel });
          if (aiOpts) {
            setPhase("post-style-select");
            postStyle = await new Promise<PostStyle>((resolve) => {
              postStyleResolverRef.current = resolve;
            });
          }
        }

        // Build context
        const projectName = options.projectName ?? (await getProjectName());
        const tone = (options.tone ?? "casual") as Tone;
        const template = (options.template as TemplateType) ?? detectTemplate(log);

        const _cfg = loadConfig();
        const ctx: AnnounceContext = {
          projectName,
          version: options.version,
          description,
          changelog: log,
          url: options.url ?? _cfg.project?.url,
          tone,
          template,
          postStyle,
        };
        setContext(ctx);

        // Check what's next: discover → screenshot → ai-generating → preview
        const resolveAiPhase = (): Phase => {
          if (options.ai === false) return "preview";
          const cfg = loadConfig();
          const aiOpts = buildAiOptions(cfg.ai, { provider: options.aiProvider, model: options.aiModel });
          if (!aiOpts) {
            setAiWarning("AI API key not configured. Using templates. Run: crosspost init");
            return "preview";
          }
          return "ai-generating";
        };

        if (options.discover) {
          // If AI is available, use the agentic loop (AI decides what to screenshot)
          // Otherwise fall back to the mechanical discover flow
          if (options.ai !== false) {
            const cfg = loadConfig();
            const aiOpts = buildAiOptions(cfg.ai, { provider: options.aiProvider, model: options.aiModel });
            if (aiOpts) {
              setPhase("agent-loop");
            } else {
              setPhase("discover");
            }
          } else {
            setPhase("discover");
          }
        } else if (options.screenshot || options.screenshotPreset) {
          setPhase("screenshot");
        } else {
          setPhase(resolveAiPhase());
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    })();
  }, [phase]);

  // Phase: Discover
  useEffect(() => {
    if (phase !== "discover" || !context) return;
    (async () => {
      try {
        setDiscoverStatus("Opening app...");
        const result = await discoverFeatures({
          url: options.discover!,
          changelog: context.changelog,
          description: context.description,
          keywords: options.discoverKeywords,
          maxPages: options.discoverMaxPages,
          delay: options.screenshotDelay,
          device: options.discoverDevice ?? options.screenshotDevice,
          darkMode: options.screenshotDark,
          hide: options.screenshotHide,
          headed: options.headed,
        });

        setDiscoveryResult(result);

        // Use the best screenshot as the main image
        if (result.features.length > 0) {
          // Use the top-confidence feature screenshot
          setScreenshotBuffer(result.features[0].screenshot);
        } else {
          // Fall back to overview screenshot
          setScreenshotBuffer(result.overviewScreenshot);
        }

        // Enrich the context description with discovered features
        if (result.features.length > 0 && context) {
          const featureList = result.features
            .slice(0, 5)
            .map((f) => `- ${f.matchedText} (${f.pageTitle})`)
            .join("\n");

          const enriched = context.description
            ? `${context.description}\n\nDiscovered in the app:\n${featureList}`
            : `Discovered features:\n${featureList}`;

          setContext({ ...context, description: enriched });
        }

        // Continue to screenshot if also requested, otherwise ai-generating/preview
        if (options.screenshot || options.screenshotPreset) {
          setPhase("screenshot");
        } else if (options.ai === false) {
          setPhase("preview");
        } else {
          const cfg = loadConfig();
          const aiOpts = buildAiOptions(cfg.ai, { provider: options.aiProvider, model: options.aiModel });
          if (!aiOpts) {
            setAiWarning("AI API key not configured. Using templates. Run: crosspost init");
          }
          setPhase(aiOpts ? "ai-generating" : "preview");
        }
      } catch (err) {
        setError(`Discovery failed: ${err instanceof Error ? err.message : String(err)}`);
        setErrorSuggestion("Make sure your app is running at the provided URL.\nRun: crosspost screenshot --setup");
        setPhase("error");
      }
    })();
  }, [phase, context]);

  // Phase: Agent Loop (AI-driven discover + screenshot + compose)
  useEffect(() => {
    if (phase !== "agent-loop" || !context) return;
    // Guard: don't re-enter if the loop is already running (e.g. returning from plan-review)
    if (agentLoopRunningRef.current) return;
    agentLoopRunningRef.current = true;
    (async () => {
      try {
        const config = loadConfig();
        const postOptions: PostOptions = { only: options.only, exclude: options.exclude };
        const adapters = filterAdapters(createAdapters(config, postOptions), postOptions);

        if (adapters.size === 0) {
          setError("No platforms configured.");
          setErrorSuggestion("Run: crosspost init");
          setPhase("error");
          return;
        }

        const aiOpts = buildAiOptions(config.ai, { provider: options.aiProvider, model: options.aiModel });
        if (!aiOpts) {
          // Shouldn't happen since we checked before entering this phase
          setPhase("discover");
          return;
        }

        const [diff, uiDiff] = selectedHashes
          ? await Promise.all([
              getDiffForHashes(selectedHashes).catch(() => null),
              getUiDiffForHashes(selectedHashes).catch(() => null),
            ])
          : await Promise.all([
              getDiffForRange({ commits: options.commits, since: options.since, tag: options.tag }).catch(() => null),
              getUiDiff({ commits: options.commits, since: options.since, tag: options.tag }).catch(() => null),
            ]);

        const result = await runAgentLoop({
          aiOptions: aiOpts,
          context,
          appUrl: options.discover!,
          adapters,
          verbosity: (options.verbosity as Verbosity) ?? undefined,
          diff: diff || undefined,
          uiDiff: uiDiff || undefined,
          screenshotDefaults: {
            device: options.discoverDevice ?? options.screenshotDevice,
            darkMode: options.screenshotDark,
            hide: options.screenshotHide,
            delay: options.screenshotDelay,
            headed: options.headed,
            slowMo: options.slowMo,
          },
          maxScreenshots: options.discoverMaxPages ?? 4,
          auth: options.auth,
          systemPrompt: options.systemPrompt,
          language: options.lang,
          onStatus: (currentPhase: AgentPhase, detail: string) => {
            setAgentPhase(currentPhase);
            setAgentStatus(detail);
          },
          onPlanReady: async (plan: ContentPlan) => {
            setContentPlan(plan);

            // In non-interactive mode (--no-confirm), auto-proceed
            if (options.noConfirm) {
              return { action: "continue" as const };
            }

            // Pause the agent loop and wait for user review
            return new Promise((resolve) => {
              planResolverRef.current = resolve;
              setPhase("plan-review");
            });
          },
        });

        setAgentLoopResult(result);
        if (result.contentPlan) setContentPlan(result.contentPlan);
        setGeneratedTexts(result.texts);
        setAiUsed(true);

        // Use the best screenshot as the main image
        if (result.screenshots.length > 0) {
          setScreenshotBuffer(result.screenshots[0].buffer);
        }

        setPhase("preview");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Fall back to mechanical discover on agent loop failure
        setAiWarning(`AI agent loop failed: ${msg}. Falling back to keyword discovery.`);
        setPhase("discover");
      } finally {
        agentLoopRunningRef.current = false;
      }
    })();
  }, [phase, context]);

  // Phase: Screenshot
  useEffect(() => {
    if (phase !== "screenshot") return;
    (async () => {
      try {
        let captureOpts: ScreenshotOptions;
        if (options.screenshotPreset) {
          const preset = getPreset(options.screenshotPreset);
          if (!preset) throw new Error(`Preset "${options.screenshotPreset}" not found.`);
          captureOpts = presetToOptions(preset, {
            url: options.screenshot ?? preset.url,
            selector: options.screenshotSelector,
            highlight: options.screenshotHighlight,
            hide: options.screenshotHide,
            device: options.screenshotDevice,
            delay: options.screenshotDelay,
            darkMode: options.screenshotDark,
            headed: options.headed,
          });
        } else {
          captureOpts = {
            url: options.screenshot!,
            selector: options.screenshotSelector,
            highlight: options.screenshotHighlight,
            hide: options.screenshotHide,
            device: options.screenshotDevice,
            delay: options.screenshotDelay,
            darkMode: options.screenshotDark,
            headed: options.headed,
          };
        }
        const result = await captureScreenshot(captureOpts);
        setScreenshotBuffer(result.buffer);
        if (options.ai === false) {
          setPhase("preview");
        } else {
          const cfg = loadConfig();
          const aiOpts = buildAiOptions(cfg.ai, { provider: options.aiProvider, model: options.aiModel });
          if (!aiOpts) {
            setAiWarning("AI API key not configured. Using templates. Run: crosspost init");
          }
          setPhase(aiOpts ? "ai-generating" : "preview");
        }
      } catch (err) {
        setError(`Screenshot failed: ${err instanceof Error ? err.message : String(err)}`);
        setErrorSuggestion("Run: crosspost screenshot --setup");
        setPhase("error");
      }
    })();
  }, [phase]);

  // Phase: AI Generation
  useEffect(() => {
    if (phase !== "ai-generating" || !context) return;
    (async () => {
      try {
        const config = loadConfig();
        const postOptions: PostOptions = { only: options.only, exclude: options.exclude };
        const adapters = filterAdapters(createAdapters(config, postOptions), postOptions);

        if (adapters.size === 0) {
          setError("No platforms configured.");
          setErrorSuggestion("Run: crosspost init");
          setPhase("error");
          return;
        }

        const aiOpts = buildAiOptions(config.ai, { provider: options.aiProvider, model: options.aiModel });
        if (!aiOpts) {
          // Shouldn't happen since we checked before entering this phase, but fallback
          setPhase("preview");
          return;
        }

        const verbosity = (options.verbosity as Verbosity) ?? undefined;
        const diff = selectedHashes
          ? await getDiffForHashes(selectedHashes)
          : await getDiffForRange({ commits: options.commits, since: options.since, tag: options.tag });

        const texts = await generateWithAi(context, adapters, aiOpts, verbosity, diff || undefined, options.systemPrompt, undefined, options.lang);
        setGeneratedTexts(texts);
        setAiUsed(true);
        setPhase("preview");
      } catch (err) {
        // Fallback to template generation
        const msg = err instanceof Error ? err.message : String(err);
        setAiWarning(`AI generation failed: ${msg}. Using template fallback.`);
        setPhase("preview");
      }
    })();
  }, [phase, context]);

  // Phase: Generate preview texts when entering preview (template fallback or non-AI path)
  useEffect(() => {
    if (phase !== "preview" || !context) return;
    // If AI already generated texts, skip template generation
    if (generatedTexts.size > 0) {
      if (options.noConfirm) {
        setPhase("posting");
      }
      return;
    }
    try {
      const config = loadConfig();
      const postOptions: PostOptions = { only: options.only, exclude: options.exclude };
      const adapters = filterAdapters(createAdapters(config, postOptions), postOptions);

      if (adapters.size === 0) {
        setError("No platforms configured.");
        setErrorSuggestion("Run: crosspost init");
        setPhase("error");
        return;
      }

      const verbosity = (options.verbosity as Verbosity) ?? undefined;
      const texts = generateAllPlatforms(context, adapters, verbosity);
      setGeneratedTexts(texts);

      // Auto-proceed if --no-confirm
      if (options.noConfirm) {
        setPhase("posting");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [phase, context]);

  // Phase: Posting
  useEffect(() => {
    if (phase !== "posting" || !context) return;
    (async () => {
      try {
        const config = loadConfig();
        const postOptions: PostOptions = {
          only: options.only,
          exclude: options.exclude,
          blogSlug: options.blogSlug,
          blogTitle: options.blogTitle
            ?? agentLoopResult?.titles.get("blog")
            ?? (context.version ? `${context.projectName} ${context.version}` : undefined),
          perPlatformText: {},
        };

        const allAdapters = createAdapters(config, postOptions);
        const adapters = filterAdapters(allAdapters, postOptions);

        // Apply generated text as per-platform overrides
        for (const [key, adapter] of adapters) {
          // User explicit overrides take priority
          const userOverride = (options as Record<string, string | undefined>)[key];
          if (userOverride) {
            postOptions.perPlatformText![key] = userOverride;
          } else if (generatedTexts.has(key)) {
            // Use AI-generated or previously generated text
            postOptions.perPlatformText![key] = generatedTexts.get(key)!;
          } else {
            postOptions.perPlatformText![key] = generateForPlatform(context, key, adapter, (options.verbosity as Verbosity) ?? undefined);
          }
        }

        // Load images (fallback for non-agent-loop path)
        const images: Buffer[] = [];
        if (options.image) {
          for (const imgPath of options.image) {
            images.push(readFileSync(imgPath));
          }
        }
        if (screenshotBuffer && !agentLoopResult) {
          images.push(screenshotBuffer);
        }

        // Per-platform images from agent loop (each platform gets its assigned screenshots)
        const perPlatformImages: Record<string, Buffer[]> = {};
        if (agentLoopResult) {
          for (const [key] of adapters) {
            const platformImages = getScreenshotsForPlatform(agentLoopResult, key);
            if (platformImages.length > 0) {
              perPlatformImages[key] = platformImages;
            }
          }
        }

        // The default text (used as fallback)
        const defaultText = context.description ?? context.changelog?.summary ?? "Update";

        const content = {
          text: defaultText,
          images: images.length > 0 ? images : undefined,
          url: context.url,
          language: options.lang,
        };

        // Initialize platform states
        const initial: PlatformState[] = Array.from(adapters.entries()).map(([key, adapter]) => ({
          key,
          name: adapter.name,
          status: "pending" as StatusState,
        }));
        setPlatformStates(initial);

        if (Object.keys(perPlatformImages).length > 0) {
          postOptions.perPlatformImages = perPlatformImages;
        }

        // Per-platform thread data from agent loop (Bluesky thread mode)
        if (agentLoopResult?.threads && agentLoopResult.threads.size > 0) {
          postOptions.perPlatformThread = Object.fromEntries(agentLoopResult.threads);
        }

        const allResults = await postToAll(adapters, content, postOptions, (event) => {
          if (event.type === "start") {
            setPlatformStates((prev) =>
              prev.map((p) =>
                p.name === event.platform ? { ...p, status: "posting", detail: "sending..." } : p,
              ),
            );
          }
          if (event.type === "done") {
            const r = event.result;
            setPlatformStates((prev) =>
              prev.map((p) => {
                if (p.name === r.platform || p.key === r.platform.toLowerCase()) {
                  return {
                    ...p,
                    status: r.success ? "success" : "error",
                    detail: r.success ? (r.url ? `→ ${r.url}` : `sent (${r.durationMs}ms)`) : r.error,
                    channel: r.channel,
                  };
                }
                return p;
              }),
            );
          }
        });

        setResults(allResults);
        setPhase("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    })();
  }, [phase]);

  // Render based on phase
  if (phase === "error" && error) {
    return <ErrorBox message={error} suggestion={errorSuggestion} />;
  }

  if (phase === "commit-select" && pendingChangelog) {
    return (
      <CommitSelector
        commits={pendingChangelog.commits}
        onConfirm={(selected) => {
          const resolver = commitSelectResolverRef.current;
          if (resolver) {
            commitSelectResolverRef.current = null;
            resolver(selected);
            // The gather useEffect is still running (blocked at the await).
            // Resolving unblocks it; set phase to gather so the spinner shows
            // while context is built. The effect won't re-run from scratch
            // because it's already in-flight.
            setPhase("gather");
          }
        }}
        onAbort={() => process.exit(0)}
      />
    );
  }

  if (phase === "post-style-select") {
    return (
      <PostStyleSelector
        onConfirm={(style) => {
          const resolver = postStyleResolverRef.current;
          if (resolver) {
            postStyleResolverRef.current = null;
            resolver(style);
            setPhase("gather");
          }
        }}
        onAbort={() => process.exit(0)}
      />
    );
  }

  if (phase === "gather") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <StepIndicator current={1} total={options.discover ? 5 : 4} label="Gathering changes" />
        <Box marginTop={1}>
          <Text>
            <Text color="green"><Spinner type="dots" /></Text>
            {" "}Analyzing{options.fromGit || options.commits || options.since || options.tag ? " git history" : " description"}...
          </Text>
        </Box>
      </Box>
    );
  }

  if (phase === "discover") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <StepIndicator current={2} total={5} label="Discovering features" />
        <Box marginTop={1}>
          <Text>
            <Text color="green"><Spinner type="dots" /></Text>
            {" "}Exploring app at {options.discover}...
          </Text>
        </Box>
        {discoverStatus && (
          <Box marginLeft={3}>
            <Text dimColor>{discoverStatus}</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (phase === "screenshot") {
    const step = options.discover ? 3 : 2;
    const total = options.discover ? 5 : 4;
    return (
      <Box flexDirection="column" paddingX={1}>
        <StepIndicator current={step} total={total} label="Capturing screenshot" />
        <Box marginTop={1}>
          <Text>
            <Text color="green"><Spinner type="dots" /></Text>
            {" "}Taking screenshot of {options.screenshot}...
          </Text>
        </Box>
      </Box>
    );
  }

  if (phase === "agent-loop") {
    const phaseLabel =
      agentPhase === "screenshotting" ? (agentStatus || "Capturing screenshots...") :
      agentPhase === "analyzing"      ? "Analyzing changes..." :
      agentPhase === "planning"       ? "Planning screenshots..." :
      agentPhase === "composing"      ? "Writing posts from screenshots..." :
      agentPhase === "done"           ? "Done" :
      "Starting AI agent...";
    return (
      <Box flexDirection="column" paddingX={1}>
        <StepIndicator current={contentPlan ? 3 : 2} total={5} label="AI agent loop" />
        <Box marginTop={1}>
          <Text>
            <Text color="green"><Spinner type="dots" /></Text>
            {" "}{phaseLabel}
          </Text>
        </Box>
        {agentStatus && agentPhase !== "screenshotting" && agentStatus !== phaseLabel && (
          <Box marginLeft={3} marginTop={1}>
            <Text dimColor>{agentStatus}</Text>
          </Box>
        )}
        {contentPlan && (
          <Box marginTop={1} marginLeft={2} flexDirection="column">
            <Text bold color="cyan">Content Plan:</Text>
            <Box marginLeft={2} flexDirection="column">
              <Text><Text bold>Angle:</Text> {contentPlan.narrativeAngle}</Text>
              <Text><Text bold>Audience:</Text> {contentPlan.targetAudience}</Text>
              <Text><Text bold>Key changes:</Text></Text>
              {contentPlan.keyChanges.map((change, i) => (
                <Text key={i}>  - {change}</Text>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    );
  }

  if (phase === "plan-review" && contentPlan) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <StepIndicator current={2} total={5} label="Review content plan" />

        <Box marginTop={1} flexDirection="column">
          <Text bold color="cyan">Content Plan:</Text>
          <Box marginLeft={2} flexDirection="column">
            <Text><Text bold>Angle:</Text> {contentPlan.narrativeAngle}</Text>
            <Text><Text bold>Audience:</Text> {contentPlan.targetAudience}</Text>
            <Text><Text bold>Key changes:</Text></Text>
            {contentPlan.keyChanges.map((change, i) => (
              <Text key={i}>  - {change}</Text>
            ))}
            {contentPlan.screenshotStrategy ? (
              <Text><Text bold>Screenshot strategy:</Text> {contentPlan.screenshotStrategy}</Text>
            ) : null}
            {contentPlan.suggestedTone && (
              <Text><Text bold>Tone:</Text> {contentPlan.suggestedTone}</Text>
            )}
          </Box>
        </Box>

        <Box marginTop={1} flexDirection="column">
          {planFeedback.length > 0 && (
            <Box>
              <Text dimColor>Feedback: </Text>
              <Text>{planFeedback}<Text color="green">|</Text></Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text dimColor>
              Press <Text bold>Enter</Text> to continue, type feedback + <Text bold>Enter</Text> to revise, <Text bold>Esc</Text> to quit
            </Text>
          </Box>
        </Box>
      </Box>
    );
  }

  if (phase === "content-revise") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color="yellow">Edit content:</Text>
        </Box>
        <Box>
          <Text dimColor>What should be changed? </Text>
          <Text>{contentReviseInput}<Text color="green">|</Text></Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            Type your feedback + <Text bold>Enter</Text> to revise, <Text bold>Esc</Text> to cancel
          </Text>
        </Box>
      </Box>
    );
  }

  if (phase === "revising") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginTop={1}>
          <Text>
            <Text color="green"><Spinner type="dots" /></Text>
            {" "}Revising content with AI...
          </Text>
        </Box>
        <Box marginLeft={3}>
          <Text dimColor>Feedback: {contentReviseInput}</Text>
        </Box>
      </Box>
    );
  }

  if (phase === "ai-generating") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <StepIndicator current={options.discover ? 4 : options.screenshot ? 3 : 2} total={options.discover ? 6 : options.screenshot ? 5 : 4} label="AI generation" />
        <Box marginTop={1}>
          <Text>
            <Text color="green"><Spinner type="dots" /></Text>
            {" "}Generating content with AI...
          </Text>
        </Box>
      </Box>
    );
  }

  if (phase === "preview") {
    const config = loadConfig();
    const postOptions: PostOptions = { only: options.only, exclude: options.exclude };
    const adapters = filterAdapters(createAdapters(config, postOptions), postOptions);

    return (
      <Box flexDirection="column" paddingX={1}>
        <StepIndicator current={options.discover ? 4 : 3} total={options.discover ? 5 : 4} label="Review content" />

        {contentPlan && (
          <Box marginTop={1} marginBottom={1} flexDirection="column">
            <Text color="green" bold>Content Plan</Text>
            <Box marginLeft={2} flexDirection="column">
              <Text><Text bold>Angle:</Text> {contentPlan.narrativeAngle}</Text>
              <Text><Text bold>Audience:</Text> {contentPlan.targetAudience}</Text>
              {contentPlan.keyChanges.map((change, i) => (
                <Text key={i} dimColor>  - {change}</Text>
              ))}
            </Box>
          </Box>
        )}

        {agentLoopResult && (
          <Box marginTop={1} marginBottom={1} flexDirection="column">
            <Text color="green" bold>
              ✓ AI captured {agentLoopResult.screenshots.length} screenshot{agentLoopResult.screenshots.length !== 1 ? "s" : ""}
            </Text>
            {agentLoopResult.plan.reasoning && (
              <Box marginLeft={2}>
                <Text dimColor>{agentLoopResult.plan.reasoning}</Text>
              </Box>
            )}
            {agentLoopResult.screenshots.map((s, i) => (
              <Box key={i} marginLeft={2}>
                <Text>
                  <Text dimColor>•</Text> <Text bold>{s.instruction.description}</Text>
                  <Text dimColor> ({Math.round(s.buffer.length / 1024)}KB)</Text>
                </Text>
              </Box>
            ))}
          </Box>
        )}

        {discoveryResult && !agentLoopResult && (
          <Box marginTop={1} marginBottom={1} flexDirection="column">
            <Text color="green" bold>
              ✓ Discovered {discoveryResult.features.length} feature{discoveryResult.features.length !== 1 ? "s" : ""} across {discoveryResult.pagesVisited.length} page{discoveryResult.pagesVisited.length !== 1 ? "s" : ""}
            </Text>
            {discoveryResult.features.slice(0, 5).map((f, i) => (
              <Box key={i} marginLeft={2}>
                <Text>
                  <Text dimColor>•</Text> <Text bold>{f.matchedText}</Text>
                  <Text dimColor> ({f.keyword}, {Math.round(f.confidence * 100)}% match, {Math.round(f.screenshot.length / 1024)}KB screenshot)</Text>
                </Text>
              </Box>
            ))}
          </Box>
        )}

        {aiUsed && (
          <Box marginTop={1}>
            <Text color="green" bold>✓ AI-generated content</Text>
          </Box>
        )}

        {aiWarning && (
          <Box marginTop={1}>
            <Text color="yellow">{aiWarning}</Text>
          </Box>
        )}

        {changelog && (
          <Box marginTop={1} marginBottom={1}>
            <Text dimColor>
              Changelog: {changelog.summary} ({changelog.range})
            </Text>
          </Box>
        )}

        {screenshotBuffer && (
          <Box marginBottom={1}>
            <Text color="green">✓</Text>
            <Text> Screenshot captured ({Math.round(screenshotBuffer.length / 1024)}KB)</Text>
          </Box>
        )}

        <Box marginBottom={1}>
          <Text bold color="yellow">
            Generated content preview:
          </Text>
        </Box>

        {Array.from(adapters.entries()).map(([key, adapter]) => {
          const text = generatedTexts.get(key) ?? "";
          const charCount = text.length;
          const maxLen = adapter.maxTextLength;

          return (
            <Box key={key} flexDirection="column" marginBottom={1}>
              <Box>
                <Text bold color="cyan">{adapter.name}</Text>
                <Text dimColor> ({charCount}/{maxLen} chars)</Text>
              </Box>
              <Box marginLeft={2}>
                <Text>{text}</Text>
              </Box>
            </Box>
          );
        })}

        <Box marginTop={1}>
          <Text dimColor>
            Press <Text bold>Enter</Text> or <Text bold>P</Text> to post{aiUsed ? <>, <Text bold>E</Text> to edit</> : ""}, <Text bold>Q</Text> to quit
          </Text>
        </Box>
      </Box>
    );
  }

  if (phase === "posting") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <StepIndicator current={options.discover ? 5 : 4} total={options.discover ? 5 : 4} label="Posting" />
        <Box marginTop={1} marginBottom={1}>
          <Text bold>● Posting to {platformStates.length} platforms...</Text>
        </Box>
        {platformStates.map((p) => (
          <PlatformStatusLine key={p.key} name={p.name} status={p.status} detail={p.detail} channel={p.channel} />
        ))}
        <Box marginTop={1}>
          <Text dimColor>
            {platformStates.filter((p) => p.status === "success" || p.status === "error").length}/{platformStates.length}{" "}
            complete
          </Text>
        </Box>
      </Box>
    );
  }

  if (phase === "done") {
    return <PostSummary results={results} totalTime={Date.now() - startTime} />;
  }

  return null;
}

export async function runAnnounceCommand(options: AnnounceCommandOptions): Promise<void> {
  // Determine if we should use git
  if (!options.description && !options.from && !options.fromGit && !options.commits && !options.since && !options.tag && !options.discover) {
    console.error(
      'Error: Provide a description or use --from-git.\n\nUsage:\n  crosspost announce "description"\n  crosspost announce --from-git --tag v1.0\n  crosspost announce --from-git --since 2026-03-01',
    );
    process.exit(1);
  }

  // JSON output mode
  if (options.json) {
    try {
      let changelog: Changelog | undefined;
      let description = options.description;

      if (options.from) {
        description = readFileSync(options.from, "utf-8").trim();
      }

      const useGit = options.fromGit || options.commits || options.since || options.tag;
      if (useGit) {
        changelog = await getCommitRange({
          commits: options.commits,
          since: options.since,
          tag: options.tag,
        });
      }

      const projectName = options.projectName ?? (await getProjectName());
      const tone = (options.tone ?? "casual") as Tone;
      const template = (options.template as TemplateType) ?? detectTemplate(changelog);

      const config = loadConfig();
      const ctx: AnnounceContext = {
        projectName,
        version: options.version,
        description,
        changelog,
        url: options.url ?? config.project?.url,
        tone,
        template,
      };

      const postOptions: PostOptions = { only: options.only, exclude: options.exclude };
      const adapters = filterAdapters(createAdapters(config, postOptions), postOptions);

      const verbosity = (options.verbosity as Verbosity) ?? undefined;
      let aiGenerated = false;
      const generated: Record<string, { text: string; charCount: number; maxLength: number }> = {};

      // Try AI generation (on by default)
      if (options.ai !== false) {
        const aiOpts = buildAiOptions(config.ai, { provider: options.aiProvider, model: options.aiModel });
        if (aiOpts) {
          try {
            const diff = await getDiffForRange({ commits: options.commits, since: options.since, tag: options.tag });
            const aiTexts = await generateWithAi(ctx, adapters, aiOpts, verbosity, diff || undefined);
            for (const [key, adapter] of adapters) {
              const text = aiTexts.get(key) ?? generateForPlatform(ctx, key, adapter, verbosity);
              generated[key] = { text, charCount: text.length, maxLength: adapter.maxTextLength };
            }
            aiGenerated = true;
          } catch {
            // Fallback to template below
          }
        }
      }

      if (!aiGenerated) {
        for (const [key, adapter] of adapters) {
          const text = generateForPlatform(ctx, key, adapter, verbosity);
          generated[key] = { text, charCount: text.length, maxLength: adapter.maxTextLength };
        }
      }

      if (options.dryRun) {
        console.log(JSON.stringify({ dryRun: true, aiGenerated, changelog: changelog?.summary, generated }, null, 2));
        return;
      }

      // Post
      const images: Buffer[] = [];
      if (options.image) {
        for (const imgPath of options.image) {
          images.push(readFileSync(imgPath));
        }
      }
      if (options.screenshot) {
        const result = await captureScreenshot({ url: options.screenshot, headed: options.headed });
        images.push(result.buffer);
      }

      const perPlatformText: Record<string, string> = {};
      for (const [key] of adapters) {
        perPlatformText[key] = generated[key].text;
      }

      const results = await postToAll(
        adapters,
        { text: description ?? changelog?.summary ?? "Update", images: images.length > 0 ? images : undefined, url: options.url },
        { ...postOptions, perPlatformText },
      );

      console.log(JSON.stringify({ changelog: changelog?.summary, generated, results }, null, 2));
    } catch (err) {
      console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  // Dry run with preview
  if (options.dryRun) {
    try {
      let changelog: Changelog | undefined;
      let description = options.description;

      if (options.from) {
        description = readFileSync(options.from, "utf-8").trim();
      }

      const useGit = options.fromGit || options.commits || options.since || options.tag;
      if (useGit) {
        changelog = await getCommitRange({
          commits: options.commits,
          since: options.since,
          tag: options.tag,
        });
      }

      const projectName = options.projectName ?? (await getProjectName());
      const tone = (options.tone ?? "casual") as Tone;
      const template = (options.template as TemplateType) ?? detectTemplate(changelog);

      const config = loadConfig();
      const ctx: AnnounceContext = {
        projectName,
        version: options.version,
        description,
        changelog,
        url: options.url ?? config.project?.url,
        tone,
        template,
      };

      const postOpts: PostOptions = { only: options.only, exclude: options.exclude };
      const adapters = filterAdapters(createAdapters(config, postOpts), postOpts);

      if (adapters.size === 0) {
        render(<ErrorBox message="No platforms configured." suggestion="Run: crosspost init" />);
        return;
      }

      // Generate texts (AI or template)
      const verbosity = (options.verbosity as Verbosity) ?? undefined;
      let textsMap = new Map<string, string>();
      let dryRunAiUsed = false;

      if (options.ai !== false) {
        const aiOpts = buildAiOptions(config.ai, { provider: options.aiProvider, model: options.aiModel });
        if (aiOpts) {
          try {
            const diff = await getDiffForRange({ commits: options.commits, since: options.since, tag: options.tag });
            textsMap = await generateWithAi(ctx, adapters, aiOpts, verbosity, diff || undefined);
            dryRunAiUsed = true;
          } catch (err) {
            console.error(`AI generation failed, using templates: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else {
          console.error("AI API key not configured. Using templates. Run: crosspost init");
        }
      }

      if (textsMap.size === 0) {
        textsMap = generateAllPlatforms(ctx, adapters, verbosity);
      }

      // Render dry-run preview
      render(
        <Box flexDirection="column" paddingX={1}>
          <Box marginBottom={1}>
            <Text bold color="yellow">[DRY RUN] Announce preview — no posts will be sent</Text>
          </Box>
          {dryRunAiUsed && (
            <Box marginBottom={1}>
              <Text color="green" bold>✓ AI-generated content</Text>
            </Box>
          )}
          {changelog && (
            <Box marginBottom={1}>
              <Text dimColor>Changelog: {changelog.summary} ({changelog.range})</Text>
            </Box>
          )}
          {Array.from(adapters.entries()).map(([key, adapter]) => {
            const text = textsMap.get(key) ?? "";
            return (
              <Box key={key} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text bold color="cyan">{adapter.name}</Text>
                  <Text dimColor> ({text.length}/{adapter.maxTextLength} chars)</Text>
                </Box>
                <Box marginLeft={2}>
                  <Text>{text}</Text>
                </Box>
              </Box>
            );
          })}
          <Box marginTop={1}>
            <Text dimColor>Run without --dry-run to post for real.</Text>
          </Box>
        </Box>,
      );
    } catch (err) {
      render(<ErrorBox message={err instanceof Error ? err.message : String(err)} />);
    }
    return;
  }

  // Interactive mode
  const { waitUntilExit } = render(<AnnounceUI options={options} />);
  await waitUntilExit();
}
