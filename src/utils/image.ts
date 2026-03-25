interface PlatformImageLimits {
  maxSize: number;
  maxWidth: number;
  maxHeight: number;
  format: "png" | "jpeg";
  quality: number;
}

const PLATFORM_LIMITS: Record<string, PlatformImageLimits> = {
  telegram: { maxSize: 10_000_000, maxWidth: 1280, maxHeight: 1280, format: "jpeg", quality: 90 },
  x: { maxSize: 5_000_000, maxWidth: 4096, maxHeight: 4096, format: "jpeg", quality: 85 },
  bluesky: { maxSize: 1_000_000, maxWidth: 800, maxHeight: 800, format: "jpeg", quality: 75 },
  mastodon: { maxSize: 10_000_000, maxWidth: 1280, maxHeight: 1280, format: "jpeg", quality: 90 },
  discord: { maxSize: 25_000_000, maxWidth: 1920, maxHeight: 1080, format: "png", quality: 95 },
  medium: { maxSize: 5_000_000, maxWidth: 1400, maxHeight: 1400, format: "jpeg", quality: 85 },
};

export function getPlatformLimits(platform: string): PlatformImageLimits {
  return (
    PLATFORM_LIMITS[platform] ?? {
      maxSize: 5_000_000,
      maxWidth: 1280,
      maxHeight: 1280,
      format: "jpeg",
      quality: 85,
    }
  );
}

export async function optimizeForPlatform(imageBuffer: Buffer, platform: string): Promise<Buffer> {
  // Try to use sharp if available, otherwise return original
  try {
    const sharp = (await import("sharp")).default;
    const limits = getPlatformLimits(platform);

    let pipeline = sharp(imageBuffer).resize(limits.maxWidth, limits.maxHeight, {
      fit: "inside",
      withoutEnlargement: true,
    });

    if (limits.format === "jpeg") {
      pipeline = pipeline.jpeg({ quality: limits.quality });
    } else {
      pipeline = pipeline.png({ quality: limits.quality });
    }

    const optimized = await pipeline.toBuffer();

    // If still too large, reduce quality further
    if (optimized.length > limits.maxSize) {
      const reducedQuality = Math.max(30, limits.quality - 30);
      return sharp(imageBuffer)
        .resize(Math.floor(limits.maxWidth * 0.7), Math.floor(limits.maxHeight * 0.7), {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: reducedQuality })
        .toBuffer();
    }

    return optimized;
  } catch {
    // Sharp not installed — return buffer as-is
    return imageBuffer;
  }
}

export function getImageMimeType(buffer: Buffer): string {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return "image/gif";
  if (buffer[0] === 0x52 && buffer[1] === 0x49) return "image/webp";
  return "image/png";
}
