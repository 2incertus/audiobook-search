import asyncio
import json
from typing import Any


class ProgressTracker:
    def __init__(self):
        self._subscribers: set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue):
        self._subscribers.discard(queue)

    async def broadcast(self, event_type: str, data: dict[str, Any]):
        message = {
            "type": event_type,
            "data": json.dumps(data),
        }
        async with self._lock:
            for queue in self._subscribers:
                try:
                    queue.put_nowait(message)
                except asyncio.QueueFull:
                    pass  # Skip if queue is full

    async def queue_update(self, queue_id: int, status: str, **kwargs):
        await self.broadcast(
            "queue_update",
            {"queue_id": queue_id, "status": status, **kwargs},
        )

    async def download_progress(
        self,
        queue_id: int,
        current_chapter: int,
        total_chapters: int,
        message: str | None = None,
        eta_seconds: int | None = None,
    ):
        await self.broadcast(
            "download_progress",
            {
                "queue_id": queue_id,
                "current_chapter": current_chapter,
                "total_chapters": total_chapters,
                "message": message,
                "eta_seconds": eta_seconds,
            },
        )

    async def download_complete(self, queue_id: int, title: str):
        await self.broadcast(
            "download_complete",
            {"queue_id": queue_id, "title": title},
        )

    async def download_error(self, queue_id: int, error: str):
        await self.broadcast(
            "download_error",
            {"queue_id": queue_id, "error": error},
        )


# Global singleton
progress_tracker = ProgressTracker()
