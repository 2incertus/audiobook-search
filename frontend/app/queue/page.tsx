"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import QueueItem, { QueueItemData } from "@/components/QueueItem";
import { getQueue, removeFromQueue, retryDownload, isAuthenticated } from "@/lib/api";
import { createSSEConnection, SSEEvent } from "@/lib/sse";
import { Loader2, RefreshCw } from "lucide-react";

export default function QueuePage() {
  const router = useRouter();
  const [items, setItems] = useState<QueueItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [pendingActionIds, setPendingActionIds] = useState<Set<number>>(new Set());

  const fetchQueue = useCallback(async () => {
    try {
      const data = await getQueue();
      setItems(data.items || []);
    } catch (error) {
      console.error("Failed to fetch queue:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    fetchQueue();

    // Set up SSE for real-time updates
    const cleanup = createSSEConnection((event: SSEEvent) => {
      if (event.type === "queue_update" || event.type === "download_progress") {
        const data = event.data;
        setItems((prev) =>
          prev.map((item) =>
            item.id === data.queue_id
              ? {
                  ...item,
                  status: (data.status as string) || item.status,
                  current_chapter: (data.current_chapter as number) ?? item.current_chapter,
                  total_chapters: (data.total_chapters as number) ?? item.total_chapters,
                  title: (data.title as string) || item.title,
                  eta_seconds: (data.eta_seconds as number) ?? item.eta_seconds,
                  error_message: (data.error_message as string) ?? item.error_message,
                }
              : item
          )
        );
      } else if (event.type === "download_complete") {
        fetchQueue();
      } else if (event.type === "download_error") {
        const data = event.data;
        setItems((prev) =>
          prev.map((item) =>
            item.id === data.queue_id
              ? { ...item, status: "failed", error_message: data.error as string }
              : item
          )
        );
      }
    });

    // Poll every 5 seconds as backup
    const interval = setInterval(fetchQueue, 5000);

    return () => {
      cleanup();
      clearInterval(interval);
    };
  }, [router, fetchQueue]);

  const handleRemove = async (item: QueueItemData) => {
    setNotice(null);

    const isCancellable = item.status === "downloading" || item.status === "fetching";

    setPendingActionIds((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });

    try {
      if (isCancellable) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: "cancelled", error_message: "Cancelling..." } : i
          )
        );
      }

      await removeFromQueue(item.id);

      if (isCancellable) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: "cancelled", error_message: "Cancelled by user" } : i
          )
        );
        setNotice({ type: "success", message: "Download cancelled" });
      } else {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        setNotice({ type: "success", message: "Removed from queue" });
      }
    } catch (error) {
      console.error("Failed to remove:", error);
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to update queue",
      });
      fetchQueue();
    } finally {
      setPendingActionIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleRetry = async (id: number) => {
    setNotice(null);
    setPendingActionIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    try {
      await retryDownload(id);
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: "pending", error_message: undefined } : item
        )
      );
      setNotice({ type: "success", message: "Retry started" });
    } catch (error) {
      console.error("Failed to retry:", error);
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to retry download",
      });
    } finally {
      setPendingActionIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const activeItems = useMemo(
    () => items.filter((i) => ["pending", "fetching", "downloading"].includes(i.status)),
    [items]
  );
  const completedItems = useMemo(() => items.filter((i) => i.status === "completed"), [items]);
  const failedItems = useMemo(() => items.filter((i) => ["failed", "cancelled"].includes(i.status)), [items]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <h1 className="text-2xl font-bold text-zinc-100">Download Queue</h1>
          <button
            onClick={fetchQueue}
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        {notice && (
          <div
            role={notice.type === "error" ? "alert" : "status"}
            className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
              notice.type === "success"
                ? "border-emerald-900/50 bg-emerald-950/30 text-emerald-200"
                : "border-red-900/50 bg-red-950/30 text-red-200"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex-1 min-w-0">{notice.message}</span>
              <button
                onClick={() => setNotice(null)}
                aria-label="Dismiss message"
                className="text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin text-zinc-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center text-zinc-500 py-12">
            <p>Your queue is empty</p>
            <p className="text-sm mt-2">Search for audiobooks to add them here</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Active Downloads */}
            {activeItems.length > 0 && (
              <section>
                <h2 className="text-lg font-medium text-zinc-300 mb-3">
                  Active ({activeItems.length})
                </h2>
                <div className="space-y-3">
                  {activeItems.map((item) => (
                    <QueueItem
                      key={item.id}
                      item={item}
                      onRemove={handleRemove}
                      onRetry={handleRetry}
                      actionPending={pendingActionIds.has(item.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Failed */}
            {failedItems.length > 0 && (
              <section>
                <h2 className="text-lg font-medium text-red-400 mb-3">
                  Failed ({failedItems.length})
                </h2>
                <div className="space-y-3">
                  {failedItems.map((item) => (
                    <QueueItem
                      key={item.id}
                      item={item}
                      onRemove={handleRemove}
                      onRetry={handleRetry}
                      actionPending={pendingActionIds.has(item.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Completed */}
            {completedItems.length > 0 && (
              <section>
                <h2 className="text-lg font-medium text-emerald-400 mb-3">
                  Completed ({completedItems.length})
                </h2>
                <div className="space-y-3">
                  {completedItems.map((item) => (
                    <QueueItem
                      key={item.id}
                      item={item}
                      onRemove={handleRemove}
                      onRetry={handleRetry}
                      actionPending={pendingActionIds.has(item.id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
