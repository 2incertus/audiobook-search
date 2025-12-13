import asyncio
import os
import re
import subprocess
import time
from datetime import datetime
from http.client import IncompleteRead

import requests
from mutagen.id3 import (
    ID3,
    APIC,
    TALB,
    TPE1,
    TPE2,
    TCON,
    TDRC,
    TRCK,
    TIT2,
    ID3NoHeaderError,
)

from app.config import settings
from app.database import async_session_maker
from app.models import QueueItem, Download
from app.services.progress_tracker import progress_tracker
from scrapers import get_scraper, TokybookScraper

# Lock to ensure only one worker runs at a time
_worker_lock = asyncio.Lock()
_is_processing = False


def sanitize_title_for_fs(title: str) -> str:
    """Replace filesystem-unsafe characters while keeping title readable."""
    return re.sub(r'[<>:"/\\|?*]', "_", title).strip()


def download_chapter_session(session, url, final_file_name, headers, max_attempts=5):
    """Download a chapter using session with retry logic."""
    for attempt in range(max_attempts):
        try:
            with session.get(url, headers=headers, stream=True, timeout=(10, 180)) as r:
                if r.status_code == 403:
                    raise requests.exceptions.HTTPError("403 Forbidden")
                r.raise_for_status()
                with open(final_file_name, "wb") as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
            return True
        except (requests.exceptions.RequestException, IncompleteRead) as e:
            print(f"Attempt {attempt + 1} failed: {e}")
            if attempt < max_attempts - 1:
                time.sleep(2 ** attempt)
    return False


async def process_single_download(queue_item: QueueItem) -> bool:
    """Process a single download from the queue."""
    async with async_session_maker() as db:
        # Update status to fetching
        result = await db.get(QueueItem, queue_item.id)
        if not result or result.status == "cancelled":
            return False

        result.status = "fetching"
        result.started_at = datetime.utcnow()
        await db.commit()

        await progress_tracker.queue_update(
            queue_item.id, "fetching", message="Fetching book metadata..."
        )

        # Get scraper and fetch book data
        scraper = get_scraper(queue_item.url)
        if not scraper:
            result.status = "failed"
            result.error_message = "Unsupported website"
            await db.commit()
            await progress_tracker.download_error(queue_item.id, "Unsupported website")
            return False

        try:
            # Run scraper in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            book_data = await loop.run_in_executor(
                None, scraper.fetch_book_data, queue_item.url
            )
        except Exception as e:
            result.status = "failed"
            result.error_message = str(e)
            await db.commit()
            await progress_tracker.download_error(queue_item.id, str(e))
            return False

        if not book_data:
            result.status = "failed"
            result.error_message = "Could not retrieve book data"
            await db.commit()
            await progress_tracker.download_error(queue_item.id, "Could not retrieve book data")
            return False

        # If the user cancelled during metadata fetching, stop before transitioning to downloading.
        await db.refresh(result)
        if result.status == "cancelled":
            await progress_tracker.queue_update(queue_item.id, "cancelled")
            return False

        # Update queue item with metadata
        result.title = book_data.get("title")
        result.author = book_data.get("author")
        result.narrator = book_data.get("narrator")
        result.site = book_data.get("site")
        result.cover_url = book_data.get("cover_url")
        result.total_chapters = len(book_data.get("chapters", []))
        result.status = "downloading"
        await db.commit()

        await progress_tracker.queue_update(
            queue_item.id,
            "downloading",
            title=result.title,
            total_chapters=result.total_chapters,
        )

        # Download cover art
        artwork_data = None
        mime_type = None
        if book_data.get("cover_url"):
            try:
                artwork_response = requests.get(book_data["cover_url"], timeout=10)
                artwork_response.raise_for_status()
                content_type = artwork_response.headers.get("Content-Type", "")
                if content_type.startswith("image/"):
                    artwork_data = artwork_response.content
                    mime_type = "image/jpeg" if "jpeg" in content_type else "image/png"
            except Exception:
                pass

        # Create output directory
        sanitized_title = sanitize_title_for_fs(book_data["title"])
        book_dir = os.path.join(settings.books_output_dir, sanitized_title)
        os.makedirs(book_dir, exist_ok=True)

        # Download chapters
        total_chapters = len(book_data["chapters"])
        session = requests.Session()

        for i, chapter in enumerate(book_data["chapters"], start=1):
            # Check if cancelled
            await db.refresh(result)
            if result.status == "cancelled":
                await progress_tracker.queue_update(queue_item.id, "cancelled")
                return False

            chapter_title = chapter["title"]
            final_file_name = os.path.join(book_dir, f"{chapter_title}.mp3")

            # Skip if already exists (resume logic)
            if os.path.exists(final_file_name):
                # Check if next chapter exists
                if i < total_chapters:
                    next_title = book_data["chapters"][i]["title"]
                    next_path = os.path.join(book_dir, f"{next_title}.mp3")
                    if os.path.exists(next_path):
                        result.current_chapter = i
                        await db.commit()
                        await progress_tracker.download_progress(
                            queue_item.id, i, total_chapters, f"Skipping {chapter_title}"
                        )
                        continue

            # Calculate ETA if we have progress data
            eta_seconds = None
            completed_chapters = i - 1  # Chapters completed before this one
            if completed_chapters > 0 and result.started_at:
                elapsed = (datetime.utcnow() - result.started_at).total_seconds()
                time_per_chapter = elapsed / completed_chapters
                chapters_remaining = result.total_chapters - completed_chapters
                eta_seconds = int(time_per_chapter * chapters_remaining)

            await progress_tracker.download_progress(
                queue_item.id, i, total_chapters, f"Downloading {chapter_title}...", eta_seconds
            )

            try:
                # Tokybook uses m3u8 streaming
                if book_data.get("site") == "tokybook.com":
                    temp_ts_file = os.path.join(book_dir, f"{chapter_title}.ts")

                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(
                        None,
                        TokybookScraper.download_chapter,
                        chapter,
                        book_data,
                        temp_ts_file,
                        None,
                    )

                    # Convert TS to MP3 using FFmpeg
                    try:
                        subprocess.run(
                            [
                                "ffmpeg",
                                "-i", temp_ts_file,
                                "-y",
                                "-vn",
                                "-acodec", "libmp3lame",
                                "-q:a", "2",
                                "-loglevel", "error",
                                final_file_name,
                            ],
                            check=True,
                        )
                        if os.path.exists(temp_ts_file):
                            os.remove(temp_ts_file)
                    except subprocess.CalledProcessError:
                        raise Exception(f"FFmpeg conversion failed for {chapter_title}")

                # Session-based download for other sites
                else:
                    headers = book_data.get("site_headers", {})
                    loop = asyncio.get_event_loop()
                    success = await loop.run_in_executor(
                        None,
                        download_chapter_session,
                        session,
                        chapter["url"],
                        final_file_name,
                        headers,
                    )
                    if not success:
                        raise Exception(f"Failed to download {chapter_title}")

                # Add ID3 tags
                try:
                    audio = ID3(final_file_name)
                except ID3NoHeaderError:
                    audio = ID3()

                audio.add(TALB(encoding=3, text=sanitized_title))
                audio.add(TCON(encoding=3, text="Audiobook"))
                audio.add(TRCK(encoding=3, text=f"{i}/{total_chapters}"))
                audio.add(TIT2(encoding=3, text=chapter_title))

                if book_data.get("author"):
                    audio.add(TPE1(encoding=3, text=book_data["author"]))
                if book_data.get("narrator"):
                    audio.add(TPE2(encoding=3, text=book_data["narrator"]))
                if book_data.get("year"):
                    audio.add(TDRC(encoding=3, text=book_data["year"]))
                if artwork_data and mime_type:
                    audio.add(APIC(
                        encoding=3,
                        mime=mime_type,
                        type=3,
                        desc="Cover",
                        data=artwork_data,
                    ))

                audio.save(final_file_name, v2_version=3)

                result.current_chapter = i
                await db.commit()

            except Exception as e:
                result.status = "failed"
                result.error_message = str(e)
                await db.commit()
                await progress_tracker.download_error(queue_item.id, str(e))
                return False

        # Mark as completed
        result.status = "completed"
        result.completed_at = datetime.utcnow()
        await db.commit()

        # Add to downloads history
        download = Download(
            queue_id=queue_item.id,
            url=queue_item.url,
            title=book_data["title"],
            author=book_data.get("author"),
            narrator=book_data.get("narrator"),
            year=book_data.get("year"),
            site=book_data.get("site"),
            cover_url=book_data.get("cover_url"),
            chapters_total=total_chapters,
            file_path=book_dir,
        )
        db.add(download)
        await db.commit()

        await progress_tracker.download_complete(queue_item.id, book_data["title"])
        return True


async def process_queue():
    """Process pending items in the queue."""
    global _is_processing

    async with _worker_lock:
        if _is_processing:
            return
        _is_processing = True

    try:
        while True:
            async with async_session_maker() as db:
                from sqlalchemy import select

                # Get next pending item
                result = await db.execute(
                    select(QueueItem)
                    .where(QueueItem.status == "pending")
                    .order_by(QueueItem.created_at)
                    .limit(1)
                )
                queue_item = result.scalar_one_or_none()

                if not queue_item:
                    break

                await process_single_download(queue_item)

    finally:
        _is_processing = False
