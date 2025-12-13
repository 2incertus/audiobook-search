from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import QueueItem
from app.schemas import QueueAddRequest, QueueItemResponse, QueueResponse
from app.services.download_worker import process_queue
from app.services.progress_tracker import progress_tracker

router = APIRouter()


@router.get("", response_model=QueueResponse)
async def get_queue(
    _user: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(QueueItem).order_by(QueueItem.created_at.desc())
    )
    items = result.scalars().all()
    return QueueResponse(items=[QueueItemResponse.model_validate(i) for i in items])


@router.post("", response_model=QueueResponse)
async def add_to_queue(
    request: QueueAddRequest,
    background_tasks: BackgroundTasks,
    _user: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    new_items = []
    for url in request.urls:
        url = url.strip()
        if not url:
            continue
        item = QueueItem(url=url, status="pending")
        db.add(item)
        new_items.append(item)

    await db.commit()
    for item in new_items:
        await db.refresh(item)

    # Trigger background processing
    background_tasks.add_task(process_queue)

    return QueueResponse(items=[QueueItemResponse.model_validate(i) for i in new_items])


@router.delete("/{item_id}")
async def remove_from_queue(
    item_id: int,
    _user: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(QueueItem).where(QueueItem.id == item_id))
    item = result.scalar_one_or_none()

    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    if item.status in ("downloading", "fetching"):
        # Mark as cancelled so worker stops (or doesn't transition into downloading)
        item.status = "cancelled"
        item.error_message = "Cancelled by user"
        await db.commit()
        await progress_tracker.queue_update(item.id, "cancelled", error_message=item.error_message)
    else:
        await db.execute(delete(QueueItem).where(QueueItem.id == item_id))
        await db.commit()

    return {"ok": True}


@router.post("/{item_id}/retry")
async def retry_download(
    item_id: int,
    background_tasks: BackgroundTasks,
    _user: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(QueueItem).where(QueueItem.id == item_id))
    item = result.scalar_one_or_none()

    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    if item.status not in ("failed", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only retry failed or cancelled items",
        )

    item.status = "pending"
    item.error_message = None
    item.current_chapter = 0
    await db.commit()

    # Trigger background processing
    background_tasks.add_task(process_queue)

    return {"ok": True}
