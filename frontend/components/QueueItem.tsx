"use client";

import { AlertCircle, Ban, Check, Clock, Loader2, RotateCcw, X } from "lucide-react";

export interface QueueItemData {
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

interface QueueItemProps {
  item: QueueItemData;
  onRemove: (item: QueueItemData) => void;
  onRetry: (id: number) => void;
  actionPending?: boolean;
}

export default function QueueItem({ item, onRemove, onRetry, actionPending }: QueueItemProps) {
  const progress =
    item.total_chapters > 0 ? Math.round((item.current_chapter / item.total_chapters) * 100) : 0;

  const statusColors: Record<string, string> = {
    pending: "text-zinc-400",
    fetching: "text-blue-400",
    downloading: "text-emerald-400",
    completed: "text-emerald-500",
    failed: "text-red-400",
    cancelled: "text-zinc-500",
  };

  const StatusIcon = () => {
    switch (item.status) {
      case "downloading":
      case "fetching":
        return <Loader2 size={16} className="animate-spin" />;
      case "completed":
        return <Check size={16} />;
      case "failed":
        return <AlertCircle size={16} />;
      case "cancelled":
        return <Ban size={16} />;
      default:
        return null;
    }
  };

  const formatETA = (seconds: number): string => {
    if (seconds < 60) return "< 1 min remaining";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
  };

  const hostname = (() => {
    try {
      return new URL(item.url).hostname;
    } catch {
      return item.url;
    }
  })();

  const removeLabel = item.status === "downloading" || item.status === "fetching" ? "Cancel" : "Remove";

  return (
    <div className="p-3 sm:p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-zinc-100 truncate">{item.title || "Fetching..."}</h3>
          <p className="text-sm text-zinc-400 truncate">{item.author || item.site || hostname}</p>

          <div
            className={`flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-sm ${
              statusColors[item.status] || "text-zinc-400"
            }`}
          >
            <StatusIcon />
            <span className="capitalize">{item.status}</span>
            {item.status === "downloading" && item.total_chapters > 0 && (
              <>
                <span className="text-zinc-500 whitespace-nowrap">
                  ({item.current_chapter}/{item.total_chapters})
                </span>
                {typeof item.eta_seconds === "number" && item.eta_seconds > 0 && (
                  <span className="text-zinc-500 whitespace-nowrap inline-flex items-center gap-1">
                    <Clock size={14} className="opacity-80" />
                    {formatETA(item.eta_seconds)}
                  </span>
                )}
              </>
            )}
          </div>

          {item.status === "downloading" && item.total_chapters > 0 && (
            <div className="mt-2">
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {(item.status === "failed" || item.status === "cancelled") && item.error_message && (
            <p
              className={`mt-2 text-sm break-words ${
                item.status === "failed" ? "text-red-400" : "text-zinc-500"
              }`}
            >
              {item.error_message}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 justify-end">
          {(item.status === "failed" || item.status === "cancelled") && (
            <button
              onClick={() => onRetry(item.id)}
              disabled={actionPending}
              className="p-2 text-zinc-400 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation"
              title="Retry"
            >
              <RotateCcw size={16} />
            </button>
          )}
          <button
            onClick={() => onRemove(item)}
            disabled={actionPending}
            className="p-2 text-zinc-400 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation"
            title={removeLabel}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

