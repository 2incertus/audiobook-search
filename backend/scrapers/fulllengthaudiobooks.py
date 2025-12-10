import requests
from bs4 import BeautifulSoup
from typing import Dict, Any, Optional
import re


class FulllengthAudiobooksScraper:
    """
    Scrape audiobook metadata and chapter MP3 links from a fulllengthaudiobooks.net page.
    """

    def _clean_title_string(self, raw_title: str) -> Dict[str, Optional[str]]:
        """
        Cleans the raw title string and attempts to separate the author and main title.
        """
        cleaned = raw_title.strip()

        cleaned = re.sub(
            r"\s*(Audiobook\s*Free|Audio Book Online|Audiobook|Free)$",
            "",
            cleaned,
            flags=re.I,
        ).strip()

        parts = re.split(r"\s*[-\u2013]\s*", cleaned, maxsplit=1)

        if len(parts) == 2:
            author = parts[0].strip()
            title = parts[1].strip()
        else:
            author = None
            title = cleaned

        return {"title": title, "author": author}

    def fetch_book_data(self, book_url: str) -> Dict[str, Any]:
        """
        Fetches the book page and extracts all relevant data including chapter URLs.
        """
        print(f"Fetching data from: {book_url}")
        try:
            response = requests.get(book_url, timeout=10)
            response.raise_for_status()
            html = response.text
        except requests.exceptions.RequestException as e:
            print(f"Error fetching URL: {e}")
            return {}

        soup = BeautifulSoup(html, "html.parser")

        # 1. Extract Title and Author
        raw_h1 = soup.find("h1", class_="entry-title post-title")
        raw_title_text = raw_h1.text if raw_h1 else "Unknown Title"

        title_info = self._clean_title_string(raw_title_text)

        # 2. Extract Cover URL
        cover_tag = soup.select_one(".wp-caption img")
        cover_url = cover_tag.get("src") if cover_tag else None

        # 3. Extract Chapter Audio Links
        chapters = []
        audio_sources = soup.select('.entry source[type="audio/mpeg"]')

        for index, source in enumerate(audio_sources):
            chapter_url = source.get("src")
            if chapter_url:
                clean_url = chapter_url.split("?")[0]
                chapter_title = f"Chapter {index + 1:03d}"
                chapters.append({"title": chapter_title, "url": clean_url})

        return {
            "site": "fulllengthaudiobooks.net",
            "book_url": book_url,
            "title": title_info["title"],
            "author": title_info["author"],
            "narrator": None,
            "year": None,
            "cover_url": cover_url,
            "chapters": chapters,
        }
