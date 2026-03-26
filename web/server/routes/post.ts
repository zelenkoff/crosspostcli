import { loadConfig } from "../../../src/config/store.js";
import { createAdapters, filterAdapters, postToAll, type PostOptions } from "../../../src/core/engine.js";
import { getScreenshotsForPlatform } from "../../../src/core/ai-loop.js";
import { getSession } from "../session-store.js";
import type { PostRequest, PostResponse, PostResultDTO } from "../../shared/api-types.js";

export async function handlePost(req: Request): Promise<Response> {
  const body = (await req.json()) as PostRequest;
  const { sessionId, texts, dryRun, only, exclude } = body;

  const config = loadConfig();
  const postOptions: PostOptions = { only, exclude, dryRun };
  const adapters = filterAdapters(createAdapters(config, postOptions), postOptions);

  // Collect per-platform images from session if available
  const perPlatformImages: Record<string, Buffer[]> = {};
  if (sessionId) {
    const session = getSession(sessionId);
    if (session?.agentResult) {
      for (const [key] of adapters) {
        const images = getScreenshotsForPlatform(session.agentResult, key);
        if (images.length > 0) perPlatformImages[key] = images;
      }
    }
  }

  const results = await postToAll(
    adapters,
    { text: "" }, // base text — overridden per platform
    {
      ...postOptions,
      perPlatformText: texts,
      perPlatformImages: Object.keys(perPlatformImages).length > 0 ? perPlatformImages : undefined,
    },
  );

  const dtos: PostResultDTO[] = results.map((r) => ({
    platform: r.platform,
    success: r.success,
    url: r.url,
    error: r.error,
  }));

  const body_response: PostResponse = { results: dtos };
  return Response.json(body_response);
}
