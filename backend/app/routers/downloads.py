from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Download
from app.schemas import DownloadResponse, DownloadsListResponse

router = APIRouter()


@router.get("", response_model=DownloadsListResponse)
async def get_downloads(
    _user: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str | None = None,
):
    query = select(Download)

    if search:
        search_term = f"%{search}%"
        query = query.where(
            Download.title.ilike(search_term) | Download.author.ilike(search_term)
        )

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Get paginated results
    offset = (page - 1) * limit
    query = query.order_by(Download.completed_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    items = result.scalars().all()

    return DownloadsListResponse(
        items=[DownloadResponse.model_validate(i) for i in items],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/{download_id}", response_model=DownloadResponse)
async def get_download(
    download_id: int,
    _user: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Download).where(Download.id == download_id))
    item = result.scalar_one_or_none()

    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Download not found")

    return DownloadResponse.model_validate(item)


@router.delete("/{download_id}")
async def delete_download(
    download_id: int,
    _user: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Download).where(Download.id == download_id))
    item = result.scalar_one_or_none()

    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Download not found")

    await db.execute(delete(Download).where(Download.id == download_id))
    await db.commit()

    return {"ok": True}
