import { useEffect, useRef } from "react";
import type { SSEEvent } from "../../shared/api-types.js";

export function useSSE(
  url: string | null,
  onEvent: (event: SSEEvent) => void,
): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!url) return;

    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as SSEEvent;
        onEventRef.current(parsed);
        if (parsed.type === "complete" || parsed.type === "error") {
          es.close();
        }
      } catch {
        // ignore malformed
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [url]);
}
