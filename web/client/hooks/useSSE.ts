import { useEffect, useRef } from "react";
import type { SSEEvent } from "../../shared/api-types";

export function useSSE(
  url: string | null,
  onEvent: (event: SSEEvent) => void,
): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!url) return;

    let closed = false;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      if (closed) return;
      try {
        const parsed = JSON.parse(e.data) as SSEEvent;
        onEventRef.current(parsed);
        if (parsed.type === "complete" || parsed.type === "error") {
          closed = true;
          es.close();
        }
      } catch {
        // ignore malformed
      }
    };

    // Don't close on error — EventSource will reconnect automatically.
    // This is important during plan-review pause where the server holds the
    // connection open and the browser may see a temporary gap.
    es.onerror = () => {
      // onerror fires when the connection drops; EventSource retries by default.
      // We only fully close once complete/error arrives.
    };

    return () => {
      closed = true;
      es.close();
    };
  }, [url]);
}
