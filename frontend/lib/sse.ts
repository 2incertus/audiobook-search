const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type SSEEvent = {
  type: "queue_update" | "download_progress" | "download_complete" | "download_error" | "ping";
  data: Record<string, unknown>;
};

export function createSSEConnection(onEvent: (event: SSEEvent) => void): () => void {
  const token = localStorage.getItem("token");
  if (!token) return () => {};

  const eventSource = new EventSource(`${API_BASE}/api/status/stream?token=${token}`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onEvent({ type: "queue_update", data });
    } catch {
      // Ignore parse errors
    }
  };

  eventSource.addEventListener("queue_update", (event: MessageEvent) => {
    try {
      onEvent({ type: "queue_update", data: JSON.parse(event.data) });
    } catch {
      // Ignore
    }
  });

  eventSource.addEventListener("download_progress", (event: MessageEvent) => {
    try {
      onEvent({ type: "download_progress", data: JSON.parse(event.data) });
    } catch {
      // Ignore
    }
  });

  eventSource.addEventListener("download_complete", (event: MessageEvent) => {
    try {
      onEvent({ type: "download_complete", data: JSON.parse(event.data) });
    } catch {
      // Ignore
    }
  });

  eventSource.addEventListener("download_error", (event: MessageEvent) => {
    try {
      onEvent({ type: "download_error", data: JSON.parse(event.data) });
    } catch {
      // Ignore
    }
  });

  eventSource.onerror = () => {
    // Reconnection is handled automatically by EventSource
  };

  return () => {
    eventSource.close();
  };
}
