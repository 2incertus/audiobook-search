import requests
from bs4 import BeautifulSoup
from typing import Dict, Any, Optional
import re
from urllib.parse import urlparse


class HDAudiobooksScraper:
    """
    Scrape audiobook metadata and chapter MP3 links from hdaudiobooks.net.
    """

    def _clean_title_string(self, raw_title: str) -> Dict[str, Optional[str]]:
        """
        Cleans the raw title string and attempts to separate the author and main title.
        """
        cleaned = raw_title.strip()

        cleaned = re.sub(
            r"\s*(\(AUDIOBOOK\)|&#8217;s)$", "", cleaned, flags=re.I
        ).strip()

        parts = re.split(r"\s*[-\u2013]\s*", cleaned, maxsplit=1)

        if len(parts) == 2:
            title = parts[0].strip()
            author = parts[1].strip()
        else:
            author = None
            title = cleaned

        return {"title": title, "author": author}

    def fetch_book_data(self, book_url: str) -> Dict[str, Any]:
        """
        Fetches the book page and extracts all relevant data including chapter URLs.
        """
        if urlparse(book_url).netloc != "hdaudiobooks.net":
            print(f"Error: URL {book_url} does not match target domain hdaudiobooks.net")
            return {}

        print(f"Fetching data from: {book_url}")
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                "Referer": book_url,
            }
            response = requests.get(book_url, headers=headers, timeout=10)
            response.raise_for_status()
            html = response.text
        except requests.exceptions.RequestException as e:
            print(f"Error fetching URL: {e}")
            return {}

        soup = BeautifulSoup(html, "html.parser")

        # 1. Extract Title and Author
        raw_h1 = soup.find("h1", itemprop="headline") or soup.find("h1")
        raw_title_text = raw_h1.text if raw_h1 else "Unknown Title"

        title_info = self._clean_title_string(raw_title_text)

        # 2. Extract Cover URL
        cover_tag = soup.select_one('img[itemprop="image"]') or soup.find(
            "meta", property="og:image"
        )

        if cover_tag:
            cover_url = (
                cover_tag.get("src")
                if cover_tag.name == "img"
                else cover_tag.get("content")
            )
        else:
            cover_url = None

        # 3. Extract Chapter Audio Links
        chapters = []
        audio_sources = soup.select('.entry source[type="audio/mpeg"]') or soup.select(
            '.entry-box source[type="audio/mpeg"]'
        )

        for index, source in enumerate(audio_sources):
            chapter_url = source.get("src")
            if chapter_url:
                clean_url = chapter_url.split("?")[0]
                chapter_title = f"Chapter {index + 1:03d}"
                chapters.append({"title": chapter_title, "url": clean_url})

        return {
            "site": "hdaudiobooks.net",
            "book_url": book_url,
            "title": title_info["title"],
            "author": title_info["author"],
            "narrator": None,
            "year": None,
            "cover_url": cover_url,
            "chapters": chapters,
        }
