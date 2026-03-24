import React, { useState, useEffect } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import { captureScreenshot, formatSize, listDevices, type ScreenshotOptions, type ScreenshotResult } from "../screenshot/capture.js";
import { checkSetup, installPlaywright, getInstallInstructions } from "../screenshot/setup.js";
import { getPreset, savePreset, deletePreset, listPresetNames, presetToOptions, type ScreenshotPreset } from "../screenshot/presets.js";
import { ErrorBox } from "../ui/ErrorBox.js";
import { SuccessBox } from "../ui/SuccessBox.js";

interface ScreenshotCommandOptions {
  url?: string;
  selector?: string;
  highlight?: string[];
  hide?: string[];
  device?: string;
  width?: number;
  height?: number;
  delay?: number;
  format?: "png" | "jpeg";
  quality?: number;
  fullPage?: boolean;
  output?: string;
  preset?: string;
  savePreset?: string;
  deletePreset?: string;
  listPresets?: boolean;
  listDevices?: boolean;
  setup?: boolean;
  darkMode?: boolean;
  json?: boolean;
}

// ── Setup UI ───────────────────────────────────────────────────────────

function SetupUI() {
  const { exit } = useApp();
  const [status, setStatus] = useState<"checking" | "installing" | "done" | "error">("checking");
  const [message, setMessage] = useState("Checking Playwright installation...");

  useEffect(() => {
    async function run() {
      const setupStatus = checkSetup();
      if (setupStatus.installed) {
        setMessage("Playwright is already installed.");
        setStatus("done");
        return;
      }

      setStatus("installing");
      setMessage("Installing Playwright + Chromium (~150MB)...");

      const success = await installPlaywright((msg) => setMessage(msg));
      if (success) {
        setStatus("done");
      } else {
        setStatus("error");
      }
    }
    run();
  }, []);

  useEffect(() => {
    if (status === "done" || status === "error") {
      const timer = setTimeout(() => exit(), 100);
      return () => clearTimeout(timer);
    }
  }, [status]);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        {status === "checking" || status === "installing" ? (
          <Text>
            <Text color="cyan"><Spinner type="dots" /></Text>
            {" "}{message}
          </Text>
        ) : status === "done" ? (
          <Text color="green">{"✓ "}{message}</Text>
        ) : (
          <Text color="red">{"✗ "}{message}</Text>
        )}
      </Box>
      {status === "installing" && (
        <Box marginTop={1}>
          <Text dimColor>This is a one-time setup. Please wait...</Text>
        </Box>
      )}
    </Box>
  );
}

// ── Install Prompt UI ──────────────────────────────────────────────────

function InstallPromptUI({ onInstalled }: { onInstalled: () => void }) {
  const { exit } = useApp();
  const [state, setState] = useState<"prompt" | "installing" | "done" | "cancelled">("prompt");
  const [message, setMessage] = useState("");

  useInput((input) => {
    if (state !== "prompt") return;
    if (input.toLowerCase() === "y" || input === "\r") {
      setState("installing");
      installPlaywright((msg) => setMessage(msg)).then((success) => {
        if (success) {
          setState("done");
          onInstalled();
        } else {
          setState("cancelled");
        }
      });
    } else if (input.toLowerCase() === "n") {
      setState("cancelled");
    }
  });

  useEffect(() => {
    if (state === "cancelled") {
      const timer = setTimeout(() => exit(), 100);
      return () => clearTimeout(timer);
    }
  }, [state]);

  if (state === "cancelled") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text>Screenshot cancelled.</Text>
        <Box marginTop={1}>
          <Text dimColor>{getInstallInstructions()}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text color="yellow">{"! "}</Text>
        <Text bold>Playwright is not installed yet.</Text>
      </Box>
      <Text dimColor>Screenshots require Playwright + Chromium (~150MB download).</Text>
      {state === "prompt" && (
        <Box marginTop={1}>
          <Text>Install now? [Y/n] </Text>
        </Box>
      )}
      {state === "installing" && (
        <Box marginTop={1}>
          <Text color="cyan"><Spinner type="dots" /></Text>
          <Text> {message || "Installing..."}</Text>
        </Box>
      )}
      {state === "done" && (
        <Box marginTop={1}>
          <Text color="green">{"✓ "}</Text>
          <Text>Playwright installed successfully.</Text>
        </Box>
      )}
    </Box>
  );
}

// ── Capture UI ─────────────────────────────────────────────────────────

function CaptureUI({ options, onResult }: { options: ScreenshotOptions; onResult?: (result: ScreenshotResult) => void }) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<"setup-check" | "install-prompt" | "capturing" | "done" | "error">("setup-check");
  const [step, setStep] = useState("Checking setup...");
  const [result, setResult] = useState<ScreenshotResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doCapture = async () => {
    setPhase("capturing");
    try {
      setStep("Launching browser");
      const captureResult = await captureScreenshot({
        ...options,
        // Hook into internal steps isn't possible, so just show generic progress
      });
      setResult(captureResult);
      onResult?.(captureResult);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  };

  useEffect(() => {
    if (phase === "setup-check") {
      const status = checkSetup();
      if (status.installed) {
        doCapture();
      } else {
        setPhase("install-prompt");
      }
    }
  }, [phase]);

  useEffect(() => {
    if (phase === "done" || phase === "error") {
      const timer = setTimeout(() => exit(), 100);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  if (phase === "install-prompt") {
    return <InstallPromptUI onInstalled={() => doCapture()} />;
  }

  if (phase === "error") {
    return <ErrorBox message={error ?? "Unknown error"} suggestion="Run: crosspost screenshot --setup" />;
  }

  if (phase === "done" && result) {
    return (
      <SuccessBox
        title="Screenshot captured"
        message={result.path}
        details={[
          `${result.width}x${result.height} ${result.format.toUpperCase()} (${formatSize(result.size)})`,
        ]}
      />
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>{"● Taking screenshot..."}</Text>
      </Box>
      <Box>
        <Text color="cyan"><Spinner type="dots" /></Text>
        <Text> {step}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{options.url}</Text>
      </Box>
    </Box>
  );
}

// ── Main Command ───────────────────────────────────────────────────────

export async function runScreenshotCommand(url?: string, opts?: ScreenshotCommandOptions): Promise<ScreenshotResult | undefined> {
  const options = opts ?? {};

  // --setup: install Playwright
  if (options.setup) {
    const { waitUntilExit } = render(<SetupUI />);
    await waitUntilExit();
    return;
  }

  // --list-presets: show saved presets
  if (options.listPresets) {
    const names = listPresetNames();
    if (names.length === 0) {
      console.log("No screenshot presets saved.");
      console.log("Save one with: crosspost screenshot <url> --save-preset <name>");
    } else {
      console.log("Screenshot presets:");
      for (const name of names) {
        const preset = getPreset(name);
        console.log(`  ${name} — ${preset?.url ?? "?"}`);
      }
    }
    return;
  }

  // --list-devices: show device presets
  if (options.listDevices) {
    console.log("Available device presets:");
    for (const device of listDevices()) {
      console.log(`  ${device}`);
    }
    console.log("\nPlaywright device names are also supported.");
    return;
  }

  // --delete-preset: remove a preset
  if (options.deletePreset) {
    const deleted = deletePreset(options.deletePreset);
    if (deleted) {
      console.log(`Preset "${options.deletePreset}" deleted.`);
    } else {
      console.log(`Preset "${options.deletePreset}" not found.`);
    }
    return;
  }

  // Resolve URL from preset or argument
  let screenshotUrl = url ?? options.url;
  let presetOptions: Partial<ScreenshotOptions> = {};

  if (options.preset) {
    const preset = getPreset(options.preset);
    if (!preset) {
      render(<ErrorBox message={`Preset "${options.preset}" not found.`} suggestion={`Available: ${listPresetNames().join(", ") || "(none)"}`} />);
      return;
    }
    presetOptions = presetToOptions(preset);
    screenshotUrl = screenshotUrl ?? preset.url;
  }

  if (!screenshotUrl) {
    console.error("Error: URL required. Usage: crosspost screenshot <url>");
    console.error("Or use a preset: crosspost screenshot --preset <name>");
    process.exit(1);
  }

  // Build options
  const captureOptions: ScreenshotOptions = {
    ...presetOptions,
    url: screenshotUrl,
    selector: options.selector ?? presetOptions.selector,
    highlight: options.highlight ?? (presetOptions as ScreenshotOptions).highlight,
    hide: options.hide ?? presetOptions.hide,
    device: options.device ?? presetOptions.device,
    viewport: (options.width && options.height)
      ? { width: options.width, height: options.height }
      : presetOptions.viewport,
    delay: options.delay ?? presetOptions.delay,
    format: options.format ?? presetOptions.format,
    quality: options.quality ?? presetOptions.quality,
    fullPage: options.fullPage ?? presetOptions.fullPage,
    output: options.output,
    darkMode: options.darkMode ?? presetOptions.darkMode,
  };

  // --save-preset: save current options as preset
  if (options.savePreset) {
    const preset: ScreenshotPreset = {
      url: captureOptions.url,
      selector: captureOptions.selector,
      highlight: captureOptions.highlight,
      hide: captureOptions.hide,
      viewport: captureOptions.viewport,
      device: captureOptions.device,
      delay: captureOptions.delay,
      format: captureOptions.format,
      quality: captureOptions.quality,
      fullPage: captureOptions.fullPage,
      darkMode: captureOptions.darkMode,
    };
    savePreset(options.savePreset, preset);
    console.log(`Preset "${options.savePreset}" saved.`);
    // Continue to capture
  }

  // JSON output
  if (options.json) {
    try {
      const setupStatus = checkSetup();
      if (!setupStatus.installed) {
        console.log(JSON.stringify({ error: "Playwright not installed", suggestion: "Run: crosspost screenshot --setup" }));
        return;
      }
      const result = await captureScreenshot(captureOptions);
      console.log(JSON.stringify({
        path: result.path,
        width: result.width,
        height: result.height,
        size: result.size,
        format: result.format,
      }, null, 2));
      return result;
    } catch (err) {
      console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      return;
    }
  }

  // Interactive capture with UI
  let capturedResult: ScreenshotResult | undefined;
  const { waitUntilExit } = render(
    <CaptureUI
      options={captureOptions}
      onResult={(r) => { capturedResult = r; }}
    />
  );
  await waitUntilExit();
  return capturedResult;
}
