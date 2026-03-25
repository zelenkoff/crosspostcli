import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { z } from "zod";
import type { ScreenshotOptions } from "./capture.js";

const PRESETS_DIR = join(homedir(), ".crosspost");
const PRESETS_FILE = join(PRESETS_DIR, "screenshots.json");

const AuthSchema = z.object({
  storageState: z.string().optional(),
  httpCredentials: z.object({
    username: z.string(),
    password: z.string(),
  }).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  cookies: z.array(z.object({
    name: z.string(),
    value: z.string(),
    domain: z.string(),
    path: z.string().optional(),
    httpOnly: z.boolean().optional(),
    secure: z.boolean().optional(),
    sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
  })).optional(),
  login: z.object({
    url: z.string(),
    fields: z.record(z.string(), z.string()),
    submit: z.string().optional(),
    waitAfter: z.number().optional(),
  }).optional(),
}).optional();

const PresetSchema = z.object({
  url: z.string(),
  selector: z.string().optional(),
  highlight: z.union([z.string(), z.array(z.string())]).optional(),
  hide: z.array(z.string()).optional(),
  viewport: z.object({
    width: z.number(),
    height: z.number(),
  }).optional(),
  device: z.string().optional(),
  delay: z.number().optional(),
  format: z.enum(["png", "jpeg"]).optional(),
  quality: z.number().optional(),
  fullPage: z.boolean().optional(),
  darkMode: z.boolean().optional(),
  auth: AuthSchema,
  /** @deprecated Use auth.storageState instead */
  storageState: z.string().optional(),
});

const PresetsFileSchema = z.object({
  presets: z.record(z.string(), PresetSchema),
});

export type ScreenshotPreset = z.infer<typeof PresetSchema>;

export function loadPresets(): Record<string, ScreenshotPreset> {
  if (!existsSync(PRESETS_FILE)) {
    return {};
  }
  try {
    const raw = JSON.parse(readFileSync(PRESETS_FILE, "utf-8"));
    const parsed = PresetsFileSchema.parse(raw);
    return parsed.presets;
  } catch {
    return {};
  }
}

export function savePresets(presets: Record<string, ScreenshotPreset>): void {
  mkdirSync(PRESETS_DIR, { recursive: true });
  writeFileSync(PRESETS_FILE, JSON.stringify({ presets }, null, 2));
}

export function getPreset(name: string): ScreenshotPreset | undefined {
  const presets = loadPresets();
  return presets[name];
}

export function savePreset(name: string, preset: ScreenshotPreset): void {
  const presets = loadPresets();
  presets[name] = preset;
  savePresets(presets);
}

export function deletePreset(name: string): boolean {
  const presets = loadPresets();
  if (!(name in presets)) return false;
  delete presets[name];
  savePresets(presets);
  return true;
}

export function listPresetNames(): string[] {
  return Object.keys(loadPresets());
}

export function presetToOptions(preset: ScreenshotPreset, overrides?: Partial<ScreenshotOptions>): ScreenshotOptions {
  return {
    url: preset.url,
    selector: preset.selector,
    highlight: preset.highlight,
    hide: preset.hide,
    viewport: preset.viewport,
    device: preset.device,
    delay: preset.delay,
    format: preset.format,
    quality: preset.quality,
    fullPage: preset.fullPage,
    darkMode: preset.darkMode,
    auth: preset.auth ?? (preset.storageState ? { storageState: preset.storageState } : undefined),
    storageState: preset.storageState,
    ...overrides,
  };
}
