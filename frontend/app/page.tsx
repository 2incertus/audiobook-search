"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import SearchBar from "@/components/SearchBar";
import SearchResults from "@/components/SearchResults";
import SearchProgress from "@/components/SearchProgress";
import { search, searchWithProgress, addToQueue, isAuthenticated } from "@/lib/api";

interface SearchResult {
  title: string;
  author?: string;
  site: string;
  url: string;
  cover_url?: string;
}

interface ProgressState {
  currentSite: number;
  totalSites: number;
  message: string;
}

export default function HomePage() {
  const router = useRouter();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
    }
  }, [router]);

  const handleSearch = async (query: string) => {
    setLoading(true);
    setSearched(true);
    setResults([]);
    setProgress(null);
    
    try {
      const data = await searchWithProgress(
        query,
        undefined,
        (progressData) => {
          if (progressData.type === 'start') {
            setProgress({
              currentSite: 0,
              totalSites: progressData.total_sites,
              message: "Starting search..."
            });
          } else if (progressData.type === 'progress') {
            setProgress({
              currentSite: progressData.current_site,
              totalSites: progressData.total_sites,
              message: progressData.message
            });
          } else if (progressData.type === 'complete') {
            setProgress(null);
            setResults(progressData.results || []);
          }
        }
      );
    } catch (error) {
      console.error("Search failed:", error);
      setResults([]);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const handleAddToQueue = async (urls: string[]) => {
    await addToQueue(urls);
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 mb-2">
            Search Audiobooks
          </h1>
          <p className="text-sm sm:text-base text-zinc-400">
            Search across 6 audiobook sites and add to your download queue
          </p>
        </div>

        <div className="flex justify-center mb-6 sm:mb-8">
          <SearchBar onSearch={handleSearch} loading={loading} />
        </div>

        {/* Progress Bar */}
        {progress && (
          <SearchProgress
            currentSite={progress.currentSite}
            totalSites={progress.totalSites}
            message={progress.message}
          />
        )}

        {searched && !progress && (
          <SearchResults results={results} onAddToQueue={handleAddToQueue} />
        )}

        {!searched && !progress && (
          <div className="text-center text-zinc-500 py-8 sm:py-12">
            <p className="text-sm sm:text-base">Search for an audiobook to get started</p>
            <p className="text-xs sm:text-sm mt-2">
              Supported sites: tokybook.com, zaudiobooks.com, goldenaudiobook.net, and more
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
