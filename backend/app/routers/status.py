import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends
from sse_starlette.sse import EventSourceResponse

from app.auth import get_current_user
from app.services.progress_tracker import progress_tracker

router = APIRouter()


@router.get("/stream")
async def status_stream(
    _user: Annotated[str, Depends(get_current_user)],
):
    async def event_generator():
        queue = await progress_tracker.subscribe()
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield {
                        "event": event["type"],
                        "data": event["data"],
                    }
                except asyncio.TimeoutError:
                    # Send keepalive
                    yield {"event": "ping", "data": ""}
        finally:
            progress_tracker.unsubscribe(queue)

    return EventSourceResponse(event_generator())
