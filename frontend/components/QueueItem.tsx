"use client";

import { X, RotateCcw, Loader2, Check, AlertCircle } from "lucide-react";

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

interface QueueItemProps {
  item: QueueItemData;
  onRemove: (id: number) => void;
  onRetry: (id: number) => void;
}

export default function QueueItem({ item, onRemove, onRetry }: QueueItemProps) {
  const progress = item.total_chapters > 0
    ? Math.round((item.current_chapter / item.total_chapters) * 100)
    : 0;

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

  return (
    <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-zinc-100 truncate">
            {item.title || "Fetching..."}
          </h3>
          <p className="text-sm text-zinc-400 truncate">
            {item.author || item.site || new URL(item.url).hostname}
          </p>

          {/* Status */}
          <div className={`flex items-center gap-2 mt-2 text-sm ${statusColors[item.status]}`}>
            <StatusIcon />
            <span className="capitalize">{item.status}</span>
            {item.status === "downloading" && item.total_chapters > 0 && (
              <>
                <span className="text-zinc-500">
                  ({item.current_chapter}/{item.total_chapters})
                </span>
                {item.eta_seconds && (
                  <span className="text-zinc-500">
                    • {formatETA(item.eta_seconds)}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Progress Bar */}
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

          {/* Error Message */}
          {item.status === "failed" && item.error_message && (
            <p className="mt-2 text-sm text-red-400 truncate">
              {item.error_message}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {(item.status === "failed" || item.status === "cancelled") && (
            <button
              onClick={() => onRetry(item.id)}
              className="p-2 text-zinc-400 hover:text-zinc-100 transition-colors"
              title="Retry"
            >
              <RotateCcw size={16} />
            </button>
          )}
          <button
            onClick={() => onRemove(item.id)}
            className="p-2 text-zinc-400 hover:text-red-400 transition-colors"
            title={item.status === "downloading" || item.status === "fetching" ? "Cancel" : "Remove"}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
