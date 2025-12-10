"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import QueueItem from "@/components/QueueItem";
import { getQueue, removeFromQueue, retryDownload, isAuthenticated } from "@/lib/api";
import { createSSEConnection, SSEEvent } from "@/lib/sse";
import { Loader2, RefreshCw } from "lucide-react";

interface QueueItemData {
  id: number;
  url: string;
  title?: string;
  author?: string;
  site?: string;
  status: string;
  current_chapter: number;
  total_chapters: number;
  error_message?: string;
  eta_seconds?: number;
}

export default function QueuePage() {
  const router = useRouter();
  const [items, setItems] = useState<QueueItemData[]>([]);
  const [loading, setLoading] = useState(true);

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

  const handleRemove = async (id: number) => {
    try {
      await removeFromQueue(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error("Failed to remove:", error);
    }
  };

  const handleRetry = async (id: number) => {
    try {
      await retryDownload(id);
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: "pending", error_message: undefined } : item
        )
      );
    } catch (error) {
      console.error("Failed to retry:", error);
    }
  };

  const activeItems = items.filter((i) => ["pending", "fetching", "downloading"].includes(i.status));
  const completedItems = items.filter((i) => i.status === "completed");
  const failedItems = items.filter((i) => ["failed", "cancelled"].includes(i.status));

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-zinc-100">Download Queue</h1>
          <button
            onClick={fetchQueue}
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

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
