from datetime import datetime
from pydantic import BaseModel


# Auth
class LoginRequest(BaseModel):
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# Search
class SearchRequest(BaseModel):
    query: str
    sites: list[str] | None = None
    limit: int = 10
    max_pages: int = 3


class SearchResult(BaseModel):
    title: str
    author: str | None = None
    site: str
    url: str
    cover_url: str | None = None
    match: str | None = None
    score: float = 0.0


class SearchResponse(BaseModel):
    results: list[SearchResult]


# Queue
class QueueAddRequest(BaseModel):
    urls: list[str]


class QueueItemResponse(BaseModel):
    id: int
    url: str
    title: str | None
    author: str | None
    narrator: str | None
    site: str | None
    cover_url: str | None
    status: str
    current_chapter: int
    total_chapters: int
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None

    class Config:
        from_attributes = True


class QueueResponse(BaseModel):
    items: list[QueueItemResponse]


# Downloads
class DownloadResponse(BaseModel):
    id: int
    url: str
    title: str
    author: str | None
    narrator: str | None
    year: str | None
    site: str | None
    cover_url: str | None
    chapters_total: int
    file_path: str | None
    completed_at: datetime

    class Config:
        from_attributes = True


class DownloadsListResponse(BaseModel):
    items: list[DownloadResponse]
    total: int
    page: int
    limit: int


# SSE Events
class ProgressEvent(BaseModel):
    queue_id: int
    status: str
    current_chapter: int
    total_chapters: int
    message: str | None = None
