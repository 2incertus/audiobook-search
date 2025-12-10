from typing import Annotated
import json
import asyncio
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.auth import get_current_user
from app.schemas import SearchRequest, SearchResponse, SearchResult
from scrapers import search_all, SUPPORTED_SITES

router = APIRouter()


@router.post("", response_model=SearchResponse)
async def search_audiobooks(
    request: SearchRequest,
    _user: Annotated[str, Depends(get_current_user)],
):
    sites = request.sites or SUPPORTED_SITES
    results = search_all(
        query=request.query,
        sites=sites,
        per_site_limit=request.limit,
        max_pages=request.max_pages,
    )

    return SearchResponse(
        results=[
            SearchResult(
                title=r.title,
                author=r.author,
                site=r.site,
                url=r.url,
                cover_url=getattr(r, "cover_url", None),
                match=getattr(r, "match", None),
                score=getattr(r, "score", 0.0),
            )
            for r in results
        ]
    )


@router.post("/progress")
async def search_audiobooks_with_progress(
    request: SearchRequest,
    _user: Annotated[str, Depends(get_current_user)],
):
    async def generate_progress():
        sites = request.sites or SUPPORTED_SITES
        
        async def progress_callback(current_site, total_sites):
            progress_data = {
                "type": "progress",
                "current_site": current_site,
                "total_sites": total_sites,
                "message": f"Searching {current_site} of {total_sites} sites..."
            }
            yield f"data: {json.dumps(progress_data)}\n\n"
        
        # Send initial progress
        yield f"data: {json.dumps({'type': 'start', 'total_sites': len(sites)})}\n\n"
        
        # Search with progress tracking
        from scrapers import search_all_with_progress
        results = await search_all_with_progress(
            query=request.query,
            sites=sites,
            per_site_limit=request.limit,
            max_pages=request.max_pages,
            progress_callback=progress_callback
        )
        
        # Send final results
        results_data = {
            "type": "complete",
            "results": [
                {
                    "title": r.title,
                    "author": r.author,
                    "site": r.site,
                    "url": r.url,
                    "cover_url": getattr(r, "cover_url", None),
                    "match": getattr(r, "match", None),
                    "score": getattr(r, "score", 0.0),
                }
                for r in results
            ]
        }
        yield f"data: {json.dumps(results_data)}\n\n"
    
    return StreamingResponse(
        generate_progress(),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Cache-Control",
        }
    )


@router.get("/sites")
async def get_supported_sites(
    _user: Annotated[str, Depends(get_current_user)],
):
    return {"sites": SUPPORTED_SITES}
