"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { getDownloads, deleteDownload, isAuthenticated } from "@/lib/api";
import { Loader2, Trash2, Search, ChevronLeft, ChevronRight } from "lucide-react";

interface Download {
  id: number;
  title: string;
  author?: string;
  narrator?: string;
  site?: string;
  chapters_total: number;
  completed_at: string;
}

export default function HistoryPage() {
  const router = useRouter();
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    fetchDownloads();
  }, [router, page, searchQuery]);

  const fetchDownloads = async () => {
    setLoading(true);
    setNotice(null);
    try {
      const data = await getDownloads(page, limit, searchQuery || undefined);
      setDownloads(data.items || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error("Failed to fetch downloads:", error);
      setNotice(error instanceof Error ? error.message : "Failed to fetch downloads");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this from history?")) return;
    try {
      await deleteDownload(id);
      setDownloads((prev) => prev.filter((d) => d.id !== id));
      setTotal((prev) => prev - 1);
      setNotice("Removed from history");
    } catch (error) {
      console.error("Failed to delete:", error);
      setNotice(error instanceof Error ? error.message : "Failed to delete");
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
          <h1 className="text-2xl font-bold text-zinc-100">Download History</h1>
          <span className="text-sm text-zinc-500">{total} total</span>
        </div>

        {notice && (
          <div
            role="status"
            className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex-1 min-w-0">{notice}</span>
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

        {/* Search */}
        <div className="relative mb-6">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search downloads..."
            className="w-full px-4 py-2 pl-10 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          />
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin text-zinc-500" />
          </div>
        ) : downloads.length === 0 ? (
          <div className="text-center text-zinc-500 py-12">
            <p>No downloads found</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {downloads.map((download) => (
                <div
                  key={download.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-zinc-900 border border-zinc-800 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-zinc-100 truncate">
                      {download.title}
                    </h3>
                    <p className="text-sm text-zinc-400 break-words">
                      {download.author || "Unknown Author"}
                      {download.narrator && ` - Narrated by ${download.narrator}`}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {download.chapters_total} chapters - {download.site} -{" "}
                      {new Date(download.completed_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(download.id)}
                    className="self-end sm:self-auto p-2 text-zinc-500 hover:text-red-400 transition-colors touch-manipulation"
                    title="Remove from history"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mt-6">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <span className="text-sm text-zinc-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
