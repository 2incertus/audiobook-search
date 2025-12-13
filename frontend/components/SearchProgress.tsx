"use client";

import { Loader2 } from "lucide-react";

interface SearchProgressProps {
  currentSite: number;
  totalSites: number;
  message?: string;
}

export default function SearchProgress({ 
  currentSite, 
  totalSites, 
  message = "Searching..." 
}: SearchProgressProps) {
  const progress = totalSites > 0 ? (currentSite / totalSites) * 100 : 0;

  return (
    <div className="w-full max-w-2xl mx-auto mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Loader2 size={16} className="animate-spin text-zinc-400" />
          <span className="text-sm text-zinc-400 truncate">
            {message}
          </span>
        </div>
        <span className="text-xs text-zinc-500 whitespace-nowrap">
          {currentSite}/{totalSites}
        </span>
      </div>
      
      <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
        <div 
          className="bg-emerald-600 h-full rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
