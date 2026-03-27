import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, render, useInput, useApp } from "ink";
import { loadConfig, saveConfig } from "../config/store.js";
import { PLATFORM_NAMES, type PlatformName, type Config } from "../config/schema.js";
import { StepIndicator } from "../ui/StepIndicator.js";
import { SuccessBox } from "../ui/SuccessBox.js";
import { ErrorBox } from "../ui/ErrorBox.js";
import { createAdapters, validateAll } from "../core/engine.js";

const PLATFORM_DISPLAY: Record<string, string> = {
  telegram: "Telegram",
  x: "X / Twitter",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  devto: "DEV.to",
  discord: "Discord",
  blog: "Blog (MDX/MD)",
};

const PLATFORM_FIELDS: Record<string, Array<{ key: string; label: string; secret: boolean; optional?: boolean }>> = {
  telegram: [
    { key: "bot_token", label: "Bot Token", secret: true },
    { key: "_channels", label: "Channel ID (e.g., @mychannel)", secret: false },
    { key: "_channel_language", label: "Channel language (e.g., en, ru, es — or Enter to skip)", secret: false, optional: true },
  ],
  x: [
    { key: "api_key", label: "API Key", secret: true },
    { key: "api_secret", label: "API Secret", secret: true },
    { key: "access_token", label: "Access Token", secret: true },
    { key: "access_secret", label: "Access Secret", secret: true },
    { key: "language", label: "Language (e.g., en, ru, es — or Enter to skip)", secret: false, optional: true },
  ],
  bluesky: [
    { key: "handle", label: "Handle (e.g., user.bsky.social)", secret: false },
    { key: "app_password", label: "App Password", secret: true },
    { key: "language", label: "Language (e.g., en, ru, es — or Enter to skip)", secret: false, optional: true },
  ],
  mastodon: [
    { key: "instance_url", label: "Instance URL (e.g., https://mastodon.social)", secret: false },
    { key: "access_token", label: "Access Token", secret: true },
    { key: "language", label: "Language (e.g., en, ru, es — or Enter to skip)", secret: false, optional: true },
  ],
  devto: [
    { key: "api_key", label: "API Key (from dev.to/settings/extensions)", secret: true },
    { key: "language", label: "Language (e.g., en, ru, es — or Enter to skip)", secret: false, optional: true },
  ],
  discord: [
    { key: "_webhook_url", label: "Webhook URL", secret: true },
    { key: "_webhook_language", label: "Webhook language (e.g., en, ru, es — or Enter to skip)", secret: false, optional: true },
  ],
  blog: [
    { key: "content_dir", label: "Content directory path", secret: false },
    { key: "language", label: "Language (e.g., en, ru, es — or Enter to skip)", secret: false, optional: true },
  ],
};

type Step = "welcome" | "select" | "credentials" | "testing" | "ai-setup" | "project-url" | "complete";
type AiSetupField = "ask" | "provider" | "api_key";

function InitWizard() {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>("welcome");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [currentPlatformIndex, setCurrentPlatformIndex] = useState(0);
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [config, setConfig] = useState<Config>(loadConfig());
  const [validationResults, setValidationResults] = useState<Map<string, boolean>>(new Map());
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [aiSetupField, setAiSetupField] = useState<AiSetupField>("ask");
  const [aiProvider, setAiProvider] = useState<"anthropic" | "openai">("anthropic");
  const [aiCursor, setAiCursor] = useState(0);

  const platformList = Array.from(PLATFORM_NAMES);
  const selectedList = platformList.filter((p) => selectedPlatforms.has(p));

  useInput((input, key) => {
    if (step === "welcome") {
      if (key.return) setStep("select");
      return;
    }

    if (step === "select") {
      if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
      if (key.downArrow) setCursor((c) => Math.min(platformList.length - 1, c + 1));
      if (input === " ") {
        setSelectedPlatforms((prev) => {
          const next = new Set(prev);
          const platform = platformList[cursor];
          if (next.has(platform)) next.delete(platform);
          else next.add(platform);
          return next;
        });
      }
      if (key.return && selectedPlatforms.size > 0) {
        setCurrentPlatformIndex(0);
        setCurrentFieldIndex(0);
        setInputValue("");
        setStep("credentials");
      }
      return;
    }

    if (step === "credentials") {
      const platform = selectedList[currentPlatformIndex];
      const fields = PLATFORM_FIELDS[platform] ?? [];
      const field = fields[currentFieldIndex];
      const isOptional = field?.optional === true;

      if (key.return && (inputValue.trim() || isOptional)) {
        const value = inputValue.trim();

        // Store the value (skip empty optional fields)
        const newConfig = { ...config };
        const platConfig = { ...newConfig.platforms[platform as keyof typeof newConfig.platforms] } as Record<string, unknown>;
        platConfig.enabled = true;

        if (field.key === "_channels") {
          // Telegram channels — upsert by ID to avoid duplicates on re-init
          const channels = (platConfig.channels as Array<{ id: string; language?: string }>) ?? [];
          const existing = channels.find((c) => c.id === value);
          if (!existing) channels.push({ id: value });
          platConfig.channels = channels;
        } else if (field.key === "_channel_language") {
          // Set language on the last added Telegram channel
          if (value) {
            const channels = (platConfig.channels as Array<{ id: string; language?: string }>) ?? [];
            if (channels.length > 0) {
              channels[channels.length - 1].language = value;
              platConfig.channels = channels;
            }
          }
        } else if (field.key === "_webhook_url") {
          // Discord webhooks
          const webhooks = (platConfig.webhooks as Array<{ url: string; language?: string }>) ?? [];
          webhooks.push({ url: value });
          platConfig.webhooks = webhooks;
        } else if (field.key === "_webhook_language") {
          // Set language on the last added Discord webhook
          if (value) {
            const webhooks = (platConfig.webhooks as Array<{ url: string; language?: string }>) ?? [];
            if (webhooks.length > 0) {
              webhooks[webhooks.length - 1].language = value;
              platConfig.webhooks = webhooks;
            }
          }
        } else if (value) {
          platConfig[field.key] = value;
        }

        (newConfig.platforms as Record<string, unknown>)[platform] = platConfig;
        setConfig(newConfig as Config);
        setInputValue("");

        // Move to next field or next platform
        if (currentFieldIndex < fields.length - 1) {
          setCurrentFieldIndex(currentFieldIndex + 1);
        } else if (currentPlatformIndex < selectedList.length - 1) {
          setCurrentPlatformIndex(currentPlatformIndex + 1);
          setCurrentFieldIndex(0);
        } else {
          // Save and test
          saveConfig(newConfig as Config);
          setStep("testing");
        }
      } else if (key.backspace || key.delete) {
        setInputValue((v) => v.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setInputValue((v) => v + input);
      }
      return;
    }

    if (step === "ai-setup") {
      const providers = ["anthropic", "openai"] as const;

      if (aiSetupField === "ask") {
        // Y/N prompt: set up AI?
        const lower = input.toLowerCase();
        if (lower === "y" || key.return) {
          setAiSetupField("provider");
          setAiCursor(0);
        } else if (lower === "n" || key.escape) {
          setStep("project-url");
        }
        return;
      }

      if (aiSetupField === "provider") {
        if (key.upArrow) setAiCursor((c) => Math.max(0, c - 1));
        if (key.downArrow) setAiCursor((c) => Math.min(providers.length - 1, c + 1));
        if (key.return) {
          setAiProvider(providers[aiCursor]);
          setInputValue("");
          setAiSetupField("api_key");
        }
        return;
      }

      if (aiSetupField === "api_key") {
        if (key.return && inputValue.trim()) {
          const newConfig = { ...config };
          newConfig.ai = {
            ...newConfig.ai,
            enabled: true,
            provider: aiProvider,
            api_key: inputValue.trim(),
          };
          setConfig(newConfig as Config);
          saveConfig(newConfig as Config);
          setInputValue("");
          setStep("project-url");
        } else if (key.backspace || key.delete) {
          setInputValue((v) => v.slice(0, -1));
        } else if (input && !key.ctrl && !key.meta) {
          setInputValue((v) => v + input);
        }
        return;
      }
    }

    if (step === "project-url") {
      if (key.return) {
        const url = inputValue.trim();
        if (url) {
          const newConfig = { ...config };
          newConfig.project = { ...newConfig.project, url };
          setConfig(newConfig as Config);
          saveConfig(newConfig as Config);
        }
        setInputValue("");
        setStep("complete");
      } else if (key.backspace || key.delete) {
        setInputValue((v) => v.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setInputValue((v) => v + input);
      }
      return;
    }
  });

  // Run validation when testing
  useEffect(() => {
    if (step !== "testing") return;
    async function test() {
      try {
        const adapters = createAdapters(config);
        // Run validation per-adapter and capture any errors
        const results = new Map<string, boolean>();
        const errors = new Map<string, string>();
        await Promise.all(
          Array.from(adapters.entries()).map(async ([key, adapter]) => {
            try {
              // Use validateOrThrow if available (gives richer errors), fall back to validate()
              if ("validateOrThrow" in adapter && typeof (adapter as any).validateOrThrow === "function") {
                await (adapter as any).validateOrThrow();
                results.set(key, true);
              } else {
                const ok = await adapter.validate();
                results.set(key, ok);
                if (!ok) errors.set(key, "Authentication failed — check credentials");
              }
            } catch (err) {
              results.set(key, false);
              errors.set(key, err instanceof Error ? err.message : String(err));
            }
          })
        );
        setValidationResults(results);
        setValidationErrors(errors);
        if (config.ai?.api_key) {
          setStep("project-url");
        } else {
          setStep("ai-setup");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStep("ai-setup");
      }
    }
    test();
  }, [step]);

  // Exit when complete
  useEffect(() => {
    if (step === "complete") {
      const timer = setTimeout(() => exit(), 100);
      return () => clearTimeout(timer);
    }
  }, [step]);

  if (step === "welcome") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {"◆ CrossPost Setup"}
          </Text>
        </Box>
        <Text>Publish to multiple platforms from your terminal.</Text>
        <Text>Bring your own API keys. No server. No subscription.</Text>
        <Box marginTop={1}>
          <Text dimColor>Press Enter to continue...</Text>
        </Box>
      </Box>
    );
  }

  if (step === "select") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {"◆ CrossPost Setup"}
          </Text>
        </Box>
        <Text>Which platforms do you want to connect?</Text>
        <Text dimColor>(use ↑↓ to move, space to select, enter to confirm)</Text>
        <Box flexDirection="column" marginTop={1}>
          {platformList.map((p, i) => (
            <Box key={p}>
              <Text color={cursor === i ? "cyan" : undefined}>
                {cursor === i ? "❯ " : "  "}
                {selectedPlatforms.has(p) ? "◉" : "◯"} {PLATFORM_DISPLAY[p]}
              </Text>
            </Box>
          ))}
        </Box>
        {selectedPlatforms.size > 0 && (
          <Box marginTop={1}>
            <Text dimColor>
              {selectedPlatforms.size} selected — press Enter to continue
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  if (step === "credentials") {
    const platform = selectedList[currentPlatformIndex];
    const fields = PLATFORM_FIELDS[platform] ?? [];
    const field = fields[currentFieldIndex];
    const totalSteps = selectedList.length;
    const currentStep = currentPlatformIndex + 1;

    // Platform-specific hints shown below the input
    const hint =
      platform === "bluesky" && field.key === "app_password"
        ? "Use an App Password — NOT your account password.\nCreate one at: bsky.app/settings/app-passwords"
        : platform === "bluesky" && field.key === "handle"
        ? "e.g. username.bsky.social  (don't include @)"
        : platform === "devto" && field.key === "api_key"
        ? "Get your API key at: dev.to/settings/extensions"
        : null;

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {"◆ CrossPost Setup"}
          </Text>
        </Box>
        <Text bold>
          Setting up {PLATFORM_DISPLAY[platform]} ({currentStep}/{totalSteps})
        </Text>
        <Box marginTop={1}>
          <Text>{field.label}: </Text>
          <Text color="cyan">{field.secret ? "•".repeat(inputValue.length) : inputValue}</Text>
          <Text>{"█"}</Text>
        </Box>
        {hint && (
          <Box marginTop={1}>
            {hint.split("\n").map((line, i) => (
              <Text key={i} dimColor>{line}</Text>
            ))}
          </Box>
        )}
        <StepIndicator current={currentStep} total={totalSteps} label={PLATFORM_DISPLAY[platform]} />
      </Box>
    );
  }

  if (step === "testing") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {"◆ CrossPost Setup"}
          </Text>
        </Box>
        <Text>Testing connections...</Text>
      </Box>
    );
  }

  if (step === "ai-setup") {
    const providers = ["Anthropic (Claude)", "OpenAI (GPT)"] as const;

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {"◆ CrossPost Setup — AI Content Generation"}
          </Text>
        </Box>

        {aiSetupField === "ask" && (
          <>
            <Text>The <Text bold>announce</Text> command uses AI to generate platform-optimized posts.</Text>
            <Text>Bring your own API key from Anthropic or OpenAI.</Text>
            <Box marginTop={1}>
              <Text>Set up AI content generation? <Text bold>[Y/n]</Text></Text>
            </Box>
          </>
        )}

        {aiSetupField === "provider" && (
          <>
            <Text>Select your AI provider:</Text>
            <Box flexDirection="column" marginTop={1}>
              {providers.map((p, i) => (
                <Box key={i}>
                  <Text color={aiCursor === i ? "cyan" : undefined}>
                    {aiCursor === i ? "❯ " : "  "}
                    {aiCursor === i ? "◉" : "◯"} {p}
                  </Text>
                </Box>
              ))}
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Press Enter to confirm</Text>
            </Box>
          </>
        )}

        {aiSetupField === "api_key" && (
          <>
            <Text>Enter your {aiProvider === "anthropic" ? "Anthropic" : "OpenAI"} API key:</Text>
            <Box marginTop={1}>
              <Text>API Key: </Text>
              <Text color="cyan">{"•".repeat(inputValue.length)}</Text>
              <Text>{"█"}</Text>
            </Box>
          </>
        )}
      </Box>
    );
  }

  if (step === "project-url") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {"◆ CrossPost Setup — Project URL"}
          </Text>
        </Box>
        <Text>Enter the public URL of your app or product.</Text>
        <Text dimColor>This will be appended to every post so readers can find your app.</Text>
        <Box marginTop={1}>
          <Text>URL (press Enter to skip): </Text>
          <Text color="cyan">{inputValue}</Text>
          <Text>{"█"}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>e.g. https://myapp.com or https://myapp.com/changelog</Text>
        </Box>
      </Box>
    );
  }

  // Complete
  const details = selectedList.map((p) => {
    const valid = validationResults.get(p);
    const errMsg = validationErrors.get(p);
    if (valid) return `✓ ${PLATFORM_DISPLAY[p]} — connected`;
    if (errMsg) return `✗ ${PLATFORM_DISPLAY[p]} — ${errMsg}`;
    return `✗ ${PLATFORM_DISPLAY[p]} — failed`;
  });

  if (config.ai?.api_key) {
    const providerLabel = config.ai.provider === "openai" ? "OpenAI" : "Anthropic";
    details.push(`✓ AI (${providerLabel}) — configured`);
  }
  if (config.project?.url) {
    details.push(`✓ Project URL — ${config.project.url}`);
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <SuccessBox
        title="Setup complete!"
        message="Config saved to ~/.crosspost/config.json"
        details={details}
      />
      {error && <ErrorBox message={error} />}
      <Box marginTop={1}>
        <Text>
          Run: <Text bold>crosspost "Hello world!"</Text> to post everywhere
        </Text>
      </Box>
    </Box>
  );
}

export async function runInitCommand(): Promise<void> {
  const { waitUntilExit } = render(<InitWizard />);
  await waitUntilExit();
}
