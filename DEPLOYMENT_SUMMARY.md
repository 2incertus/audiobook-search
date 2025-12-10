# Audiobook Downloader - Deployment Summary

## Project Overview
Built a web UI for downloading audiobooks from 6 different sites, deployed to Hetzner VPS alongside existing Audiobookshelf installation.

## What Was Built

### Backend (FastAPI + Python)
- **Framework**: FastAPI with SQLAlchemy
- **Database**: SQLite
- **Authentication**: JWT with bcrypt password hashing
- **Features**:
  - Search across 6 audiobook sites
  - Download queue management
  - Background download worker
  - Real-time progress updates via Server-Sent Events (SSE)
  - Downloaded files saved to `/mnt/media/audiobooks`
- **Scrapers**: Copied and adapted from existing tokybook project
  - Supports m3u8 streaming conversion with FFmpeg
  - ID3 tag manipulation with mutagen

### Frontend (Next.js 14 + Tailwind CSS)
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Pages**:
  - Login (password protected)
  - Search (home page)
  - Queue (active downloads with real-time progress)
  - History (completed downloads)
- **Components**:
  - Navbar with navigation
  - SearchBar with site filtering
  - SearchResults with bulk actions
  - QueueItem with progress tracking
- **Real-time Updates**: SSE for download progress

### Infrastructure
- **VPS**: Hetzner Cloud (CPX11: 2 vCPU / 2 GB RAM / 40 GB SSD)
- **Storage**: 100GB volume at `/mnt/media/audiobooks` (resized from 100GB, filesystem expanded to 148GB)
- **Domain**: get.library.icu (via Cloudflare Tunnel)
- **Containers**: Docker Compose orchestration

## Deployment Timeline

### 1. Initial Setup & Planning ✅
- Explored existing tokybook downloader codebase
- Gathered requirements via user questions
- Created implementation plan

### 2. Backend Development ✅
- Created FastAPI application structure
- Implemented authentication with JWT
- Built SQLAlchemy models (QueueItem, Download)
- Created API endpoints:
  - `/api/auth/login` - Authentication
  - `/api/search` - Multi-site audiobook search
  - `/api/queue` - Queue management
  - `/api/downloads` - Download history
  - `/api/status` - SSE status updates
- Implemented background download worker

### 3. Frontend Development ✅
- Created Next.js 14 app with App Router
- Built all pages and components
- Implemented SSE client for real-time updates
- Configured for production with standalone output

### 4. Docker Configuration ✅
- Created Dockerfiles for backend and frontend
- Created docker-compose.yml for orchestration
- Configured environment variables

### 5. VPS Preparation ✅
- Resized volume from 100GB to 150GB
- Expanded filesystem with `resize2fs`
  - Before: 98GB (96% full)
  - After: 148GB (64% full, 52GB free)

### 6. Deployment to VPS ✅
- Transferred application files via tar/scp
- Built Docker images on VPS
- Started containers
- Configured Cloudflare Tunnel routing

### 7. Cloudflare Tunnel Configuration ✅
- Updated `/srv/cloudflared/config.yml` with new routes:
  - `get.library.icu/api/*` → Backend (port 8000)
  - `get.library.icu` → Frontend (port 3000)
  - `books.library.icu` → Audiobookshelf (port 13378)
- Added DNS CNAME for get.library.icu
- Restarted cloudflared container

### 8. Testing & Verification ✅
- Verified containers running
- Tested backend health endpoint
- Confirmed Cloudflare Tunnel routing
- Verified public URL accessibility

## Current Status

### ✅ Working
- Application deployed and accessible at https://get.library.icu
- Backend API responding correctly
- Frontend serving pages
- Cloudflare Tunnel routing both services
- Download directory mounted at `/mnt/media/audiobooks`
- Backend authentication works via direct API calls (curl)

### ❌ Issue: Password Login Not Working
- User cannot login via web interface
- Backend API works when tested with curl
- Frontend rebuilt with correct API URL
- Password hash verified
- **See PASSWORD_ISSUE.md for detailed debugging information**

## File Structure

```
audiobook-web/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app
│   │   ├── config.py            # Settings
│   │   ├── database.py          # SQLAlchemy setup
│   │   ├── models.py            # Database models
│   │   ├── schemas.py           # Pydantic schemas
│   │   ├── auth.py              # Authentication
│   │   ├── routers/
│   │   │   ├── auth.py          # Login endpoint
│   │   │   ├── search.py        # Search endpoints
│   │   │   ├── queue.py         # Queue management
│   │   │   ├── downloads.py    # Download history
│   │   │   └── status.py        # SSE status
│   │   └── services/
│   │       └── download_worker.py  # Background worker
│   ├── scrapers/                # Copied from tokybook
│   ├── Dockerfile
│   └── pyproject.toml
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx             # Home/Search page
│   │   ├── login/
│   │   │   └── page.tsx         # Login page
│   │   ├── queue/
│   │   │   └── page.tsx         # Queue page
│   │   └── history/
│   │       └── page.tsx         # History page
│   ├── components/
│   │   ├── Navbar.tsx
│   │   ├── SearchBar.tsx
│   │   ├── SearchResults.tsx
│   │   └── QueueItem.tsx
│   ├── lib/
│   │   ├── api.ts               # API client
│   │   └── sse.ts               # SSE client
│   ├── Dockerfile
│   ├── next.config.mjs
│   └── package.json
├── docker-compose.yml
├── .env
├── PASSWORD_ISSUE.md            # Password debugging guide
└── DEPLOYMENT_SUMMARY.md        # This file
```

## Configuration Files

### docker-compose.yml (VPS)
```yaml
version: '3.8'

services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=https://get.library.icu
    depends_on:
      - backend
    restart: unless-stopped

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "127.0.0.1:8000:8000"
    environment:
      - DATABASE_URL=sqlite+aiosqlite:///./data/audiobooks.db
      - BOOKS_OUTPUT_DIR=/audiobooks
      - SECRET_KEY=${SECRET_KEY:-change-me-in-production}
      - ADMIN_PASSWORD_HASH=${ADMIN_PASSWORD_HASH}
      - CORS_ORIGINS=["https://get.library.icu","http://localhost:3000","http://frontend:3000"]
    volumes:
      - ./data:/app/data
      - /mnt/media/audiobooks:/audiobooks
    restart: unless-stopped
```

### .env (VPS: /srv/audiobook-web/.env)
```bash
SECRET_KEY=pcKd-VfxUsUB3VXTvs2Jud3Z39AkGu-ya5rYlXmsny8
ADMIN_PASSWORD_HASH=$$2b$$12$$u4oxHLekoy7LiWDKrFQ7Pu8RaTAeL1/oI27H0b8oXKZV9gOP93zmK
```

### Cloudflare Tunnel Config (/srv/cloudflared/config.yml)
```yaml
tunnel: 0a26fe8e-d66f-4ed9-a6a1-1959e1297aa7
credentials-file: /home/nonroot/.cloudflared/0a26fe8e-d66f-4ed9-a6a1-1959e1297aa7.json
ingress:
  - hostname: get.library.icu
    path: /api/*
    service: http://localhost:8000
  - hostname: get.library.icu
    service: http://localhost:3000
  - hostname: books.library.icu
    service: http://localhost:13378
  - service: http_status:404
```

## VPS Details
- **Host**: 5.78.148.214
- **User**: root
- **Password**: 9wVHdugpxHFn
- **Application Path**: /srv/audiobook-web
- **Audiobooks Path**: /mnt/media/audiobooks

## Useful Commands

### Check Status
```bash
ssh root@5.78.148.214 "docker ps --filter name=audiobook-web"
```

### View Logs
```bash
ssh root@5.78.148.214 "docker logs -f audiobook-web-backend-1"
ssh root@5.78.148.214 "docker logs -f audiobook-web-frontend-1"
```

### Restart Services
```bash
ssh root@5.78.148.214 "cd /srv/audiobook-web && docker compose restart"
```

### Check Downloaded Files
```bash
ssh root@5.78.148.214 "ls -lh /mnt/media/audiobooks"
```

### Rebuild Frontend
```bash
ssh root@5.78.148.214 "cd /srv/audiobook-web && docker compose build --no-cache frontend && docker compose up -d frontend"
```

### Rebuild Backend
```bash
ssh root@5.78.148.214 "cd /srv/audiobook-web && docker compose build --no-cache backend && docker compose up -d backend"
```

## Issues Encountered & Resolved

### 1. npm ci Failure ✅
- **Problem**: Missing package-lock.json
- **Solution**: Ran `npm install` locally to generate it

### 2. Next.js Config Format ✅
- **Problem**: `.ts` extension not supported
- **Solution**: Renamed to `next.config.mjs` and converted to JavaScript

### 3. TypeScript Set Spread Operator ✅
- **Problem**: `Set` spread syntax not supported without --downlevelIteration
- **Solution**: Changed to explicit Set manipulation

### 4. Missing Public Folder ✅
- **Problem**: Dockerfile COPY failed for missing public folder
- **Solution**: Created `public/.gitkeep`

### 5. Password Hash Escaping ✅
- **Problem**: Docker Compose interpreting $ as variable markers
- **Solution**: Doubled dollar signs in .env file (`$$`)

### 6. Bcrypt Compatibility ✅
- **Problem**: passlib bcrypt had compatibility issues
- **Solution**: Switched to direct bcrypt library usage

### 7. Corrupted Password Hash ✅
- **Problem**: Initial hash was invalid (57 chars instead of 60)
- **Solution**: Generated fresh hash with correct password

### 8. Double /api in URL ✅
- **Problem**: Frontend calling `/api/api/auth/login`
- **Solution**: Fixed NEXT_PUBLIC_API_URL to remove trailing `/api`

### 9. Frontend Cache ⏳
- **Problem**: Frontend rebuild used cache
- **Solution**: Rebuilt with `--no-cache` flag

### 10. Password Login Not Working ❌
- **Problem**: User cannot login via web form
- **Status**: UNRESOLVED
- **See**: PASSWORD_ISSUE.md

## Expected Login Credentials
- **URL**: https://get.library.icu
- **Password**: `admin123`

## Next Steps
1. Debug password login issue (see PASSWORD_ISSUE.md)
2. Test end-to-end download functionality
3. Monitor system performance
4. Consider adding:
   - Password change functionality
   - Download pause/resume
   - Better error handling
   - Rate limiting
   - Download scheduling
