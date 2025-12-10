from dataclasses import dataclass
from typing import Callable, Dict, List, Optional
from urllib.parse import quote_plus, urljoin, urlparse
import logging

import requests
from bs4 import BeautifulSoup

from scrapers.tokybook import TokybookScraper
from scrapers.zaudiobooks import ZaudiobooksScraper
from scrapers.goldenaudiobook import GoldenAudiobookScraper
from scrapers.fulllengthaudiobooks import FulllengthAudiobooksScraper
from scrapers.hdaudiobooks import HDAudiobooksScraper
from scrapers.bigaudiobooks import BigAudiobooksScraper

logger = logging.getLogger(__name__)


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


@dataclass
class SearchResult:
    title: str
    url: str
    site: str
    author: Optional[str] = None
    cover_url: Optional[str] = None
    match: Optional[str] = None
    score: float = 0.0


def get_scraper(url: str):
    """Factory function to select the correct scraper based on the URL."""
    if "tokybook.com" in url:
        return TokybookScraper()
    if "goldenaudiobook.net" in url or "goldenaudiobook.com" in url:
        return GoldenAudiobookScraper()
    if "zaudiobooks.com" in url:
        return ZaudiobooksScraper()
    if "fulllengthaudiobooks.net" in url:
        return FulllengthAudiobooksScraper()
    if "hdaudiobooks.net" in url:
        return HDAudiobooksScraper()
    if "bigaudiobooks.net" in url:
        return BigAudiobooksScraper()
    return None


def _fetch_tokybook_details(slug: str) -> Optional[dict]:
    """Fetch author and other details for a tokybook result."""
    try:
        details_url = "https://tokybook.com/api/v1/search/post-details"
        payload = {"dynamicSlugId": slug}
        resp = requests.post(details_url, json=payload, timeout=5)
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return None


def search_tokybook(query: str, limit: int = 5) -> List[SearchResult]:
    """Hit the Tokybook public search API."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    api_url = "https://tokybook.com/api/v1/search"
    headers = {"User-Agent": USER_AGENT}
    payload = {"query": query.strip(), "offset": 0, "limit": limit}
    results: List[SearchResult] = []

    try:
        resp = requests.post(api_url, json=payload, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        items = data.get("content", [])

        # Fetch author details in parallel
        slug_to_item = {}
        for item in items:
            slug = (
                item.get("bookId")
                or item.get("dynamicSlugId")
                or item.get("id")
            )
            if slug:
                slug_to_item[slug] = item

        # Fetch details for all slugs in parallel
        details_map = {}
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_to_slug = {
                executor.submit(_fetch_tokybook_details, slug): slug
                for slug in slug_to_item.keys()
            }
            for future in as_completed(future_to_slug):
                slug = future_to_slug[future]
                details = future.result()
                if details:
                    details_map[slug] = details

        # Build results with author info
        for slug, item in slug_to_item.items():
            url = f"https://tokybook.com/post/{slug}"
            title = item.get("title") or "Unknown Title"
            author = None

            # Get author from details if available
            details = details_map.get(slug)
            if details and details.get("authors"):
                author = details["authors"][0].get("name")
            elif " by " in title:
                # Fallback: extract author from title
                parts = title.split(" by ", 1)
                title = parts[0].strip()
                author_part = parts[1].strip()
                author = author_part.split("(")[0].strip()

            results.append(
                SearchResult(
                    title=title.strip(),
                    url=url,
                    site="tokybook.com",
                    author=author,
                    cover_url=item.get("coverImage"),
                )
            )
            if len(results) >= limit:
                break

    except Exception as e:
        logger.error(f"Error searching tokybook.com: {type(e).__name__}: {str(e)}")
        return []

    return results


def _search_wordpress_site(base_url: str, query: str, limit: int = 5) -> List[SearchResult]:
    """Generic WordPress search helper for audiobook sites."""
    search_url = f"{base_url}/?s={quote_plus(query.strip())}"
    headers = {"User-Agent": USER_AGENT, "Referer": base_url}
    results: List[SearchResult] = []
    site_name = urlparse(base_url).netloc

    try:
        resp = requests.get(search_url, headers=headers, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        link_nodes = soup.select(
            "h2.entry-title a, h2.post-title a, h1.title-page a, h3.post-title a, h3 a"
        )
        for node in link_nodes:
            href = node.get("href")
            if not href:
                continue
            full_url = href if href.startswith("http") else urljoin(base_url, href)
            title_text = node.get_text(strip=True) or "Unknown Title"
            results.append(
                SearchResult(
                    title=title_text,
                    url=full_url,
                    site=site_name,
                )
            )
            if len(results) >= limit:
                break

        if len(results) == 0:
            logger.warning(f"No results found for {site_name} (query: {query}). Found {len(link_nodes)} link nodes.")
    except Exception as e:
        logger.error(f"Error searching {site_name}: {type(e).__name__}: {str(e)}")
        return []

    return results


def search_zaudiobooks(query: str, limit: int = 5) -> List[SearchResult]:
    return _search_wordpress_site("https://zaudiobooks.com", query, limit)


def search_fulllengthaudiobooks(query: str, limit: int = 5) -> List[SearchResult]:
    return _search_wordpress_site("https://fulllengthaudiobooks.net", query, limit)


def search_hdaudiobooks(query: str, limit: int = 5) -> List[SearchResult]:
    return _search_wordpress_site("https://hdaudiobooks.net", query, limit)


def search_bigaudiobooks(query: str, limit: int = 5) -> List[SearchResult]:
    return _search_wordpress_site("https://bigaudiobooks.net", query, limit)


def search_goldenaudiobook(query: str, limit: int = 5) -> List[SearchResult]:
    results = _search_wordpress_site("https://goldenaudiobook.net", query, limit)
    if len(results) < limit:
        results += _search_wordpress_site("https://goldenaudiobook.com", query, limit - len(results))
    return results


SEARCHERS: Dict[str, Callable[[str, int], List[SearchResult]]] = {
    "tokybook.com": search_tokybook,
    "zaudiobooks.com": search_zaudiobooks,
    "fulllengthaudiobooks.net": search_fulllengthaudiobooks,
    "hdaudiobooks.net": search_hdaudiobooks,
    "bigaudiobooks.net": search_bigaudiobooks,
    "goldenaudiobook.net": search_goldenaudiobook,
    "goldenaudiobook.com": search_goldenaudiobook,
}

SUPPORTED_SITES = list(SEARCHERS.keys())


def search_all(
    query: str,
    sites: Optional[List[str]] = None,
    per_site_limit: int = 5,
    max_pages: int = 3,
) -> List[SearchResult]:
    """Run the query across the requested sites and return a combined list."""
    if not query.strip():
        return []

    target_sites = sites or list(SEARCHERS.keys())
    aggregated: List[SearchResult] = []

    logger.info(f"Searching query '{query}' across {len(target_sites)} sites: {target_sites}")

    for site in target_sites:
        searcher = SEARCHERS.get(site)
        if not searcher:
            logger.warning(f"No searcher found for site: {site}")
            continue

        site_results = searcher(query, per_site_limit)
        logger.info(f"Site {site} returned {len(site_results)} results")
        aggregated.extend(site_results)

    logger.info(f"Total results: {len(aggregated)} from {len(target_sites)} sites")
    return aggregated


async def search_all_with_progress(
    query: str,
    sites: Optional[List[str]] = None,
    per_site_limit: int = 5,
    max_pages: int = 3,
    progress_callback=None,
) -> List[SearchResult]:
    """Run the query across the requested sites with progress tracking."""
    if not query.strip():
        return []

    target_sites = sites or list(SEARCHERS.keys())
    aggregated: List[SearchResult] = []

    logger.info(f"Searching query '{query}' across {len(target_sites)} sites: {target_sites}")

    for i, site in enumerate(target_sites, 1):
        if progress_callback:
            await progress_callback(i, len(target_sites))
        
        searcher = SEARCHERS.get(site)
        if not searcher:
            logger.warning(f"No searcher found for site: {site}")
            continue

        site_results = searcher(query, per_site_limit)
        logger.info(f"Site {site} returned {len(site_results)} results")
        aggregated.extend(site_results)

    logger.info(f"Total results: {len(aggregated)} from {len(target_sites)} sites")
    return aggregated
