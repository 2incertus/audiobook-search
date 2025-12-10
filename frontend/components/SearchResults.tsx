"use client";

import { useState } from "react";
import { Plus, Check, ExternalLink } from "lucide-react";
import Image from "next/image";

interface SearchResult {
  title: string;
  author?: string;
  site: string;
  url: string;
  cover_url?: string;
}

interface SearchResultsProps {
  results: SearchResult[];
  onAddToQueue: (urls: string[]) => Promise<void>;
}

export default function SearchResults({ results, onAddToQueue }: SearchResultsProps) {
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const toggleSelect = (url: string) => {
    const newSet = new Set(selectedUrls);
    if (newSet.has(url)) {
      newSet.delete(url);
    } else {
      newSet.add(url);
    }
    setSelectedUrls(newSet);
  };

  const handleAddSelected = async () => {
    if (selectedUrls.size === 0) return;
    setAdding(true);
    try {
      await onAddToQueue(Array.from(selectedUrls));
      const combined = new Set(addedUrls);
      selectedUrls.forEach(url => combined.add(url));
      setAddedUrls(combined);
      setSelectedUrls(new Set());
    } finally {
      setAdding(false);
    }
  };

  const handleAddSingle = async (url: string) => {
    setAdding(true);
    try {
      await onAddToQueue([url]);
      const updated = new Set(addedUrls);
      updated.add(url);
      setAddedUrls(updated);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      {selectedUrls.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-zinc-800 rounded-lg">
          <span className="text-sm text-zinc-300">
            {selectedUrls.size} selected
          </span>
          <button
            onClick={handleAddSelected}
            disabled={adding}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-md text-sm font-medium transition-colors touch-manipulation"
          >
            <Plus size={16} />
            Add to Queue
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-1">
        {results.map((result, idx) => {
          const isAdded = addedUrls.has(result.url);
          const isSelected = selectedUrls.has(result.url);

          return (
            <div
              key={`${result.url}-${idx}`}
              className={`flex items-start gap-3 sm:gap-4 p-3 sm:p-4 bg-zinc-900 border rounded-lg transition-colors cursor-pointer ${
                isSelected
                  ? "border-emerald-600 bg-zinc-800"
                  : "border-zinc-800 hover:border-zinc-700"
              }`}
              onClick={() => !isAdded && toggleSelect(result.url)}
            >
              {/* Cover Image */}
              <div className="w-14 h-14 sm:w-16 sm:h-16 bg-zinc-800 rounded overflow-hidden flex-shrink-0">
                {result.cover_url ? (
                  <Image
                    src={result.cover_url}
                    alt={result.title}
                    width={64}
                    height={64}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                    No Cover
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-zinc-100 text-sm sm:text-base truncate">{result.title}</h3>
                <p className="text-xs sm:text-sm text-zinc-400 truncate">
                  {result.author || "Unknown Author"}
                </p>
                <p className="text-xs text-zinc-500">{result.site}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors touch-manipulation"
                >
                  <ExternalLink size={16} />
                </a>
                {isAdded ? (
                  <div className="p-2 text-emerald-500">
                    <Check size={18} className="sm:size-[20px]" />
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddSingle(result.url);
                    }}
                    disabled={adding}
                    className="p-2 text-zinc-400 hover:text-emerald-500 transition-colors touch-manipulation"
                  >
                    <Plus size={18} className="sm:size-[20px]" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
