# Password Authentication Issue - Audiobook Downloader

## Current Status
- **Application URL**: https://get.library.icu
- **Expected Password**: `admin123`
- **Issue**: Login form returns "Invalid password" error
- **Backend API**: Working correctly (verified via curl)
- **Frontend**: Rebuilt and deployed

## Application Architecture

### Services
1. **Backend** (FastAPI)
   - Port: 8000 (localhost only)
   - Location: `/srv/audiobook-web/backend`
   - Container: `audiobook-web-backend-1`

2. **Frontend** (Next.js 14)
   - Port: 3000 (localhost only)
   - Location: `/srv/audiobook-web/frontend`
   - Container: `audiobook-web-frontend-1`

3. **Cloudflare Tunnel**
   - Routes `/api/*` → Backend (port 8000)
   - Routes everything else → Frontend (port 3000)

## Current Configuration

### Environment Variables (VPS: /srv/audiobook-web/.env)
```bash
SECRET_KEY=pcKd-VfxUsUB3VXTvs2Jud3Z39AkGu-ya5rYlXmsny8
ADMIN_PASSWORD_HASH=$$2b$$12$$u4oxHLekoy7LiWDKrFQ7Pu8RaTAeL1/oI27H0b8oXKZV9gOP93zmK
```

### Docker Compose Configuration (VPS: /srv/audiobook-web/docker-compose.yml)
```yaml
frontend:
  environment:
    - NEXT_PUBLIC_API_URL=https://get.library.icu  # Fixed: removed /api suffix
```

### Password Hash Details
- **Algorithm**: bcrypt
- **Generated hash**: `$2b$12$u4oxHLekoy7LiWDKrFQ7Pu8RaTAeL1/oI27H0b8oXKZV9gOP93zmK`
- **For password**: `admin123`
- **Docker Compose escaping**: Double-dollar signs (`$$`) required in .env file

## What Works

### ✅ Backend API Authentication
Direct API calls work perfectly:
```bash
curl -X POST https://get.library.icu/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password": "admin123"}'

# Returns: {"access_token":"...","token_type":"bearer"}
```

### ✅ Backend Container Configuration
```bash
ssh root@5.78.148.214 "docker exec audiobook-web-backend-1 printenv ADMIN_PASSWORD_HASH"
# Returns: $2b$12$u4oxHLekoy7LiWDKrFQ7Pu8RaTAeL1/oI27H0b8oXKZV9gOP93zmK
```

### ✅ Containers Running
```bash
ssh root@5.78.148.214 "docker ps --filter name=audiobook-web"
# Both frontend and backend containers are up and healthy
```

## What Doesn't Work

### ❌ Frontend Login Form
- User enters `admin123` in the login form at https://get.library.icu/login
- Form shows "Invalid password" error
- No successful authentication

## Previous Fixes Attempted

### 1. Password Hash Regeneration ✅
- **Problem**: Original hash was corrupted (only 57 chars instead of 60)
- **Solution**: Generated fresh hash using `bcrypt.hashpw('admin123'.encode('utf-8'), bcrypt.gensalt())`
- **Result**: Backend API now works with curl

### 2. API URL Configuration ✅
- **Problem**: Frontend was calling `https://get.library.icu/api/api/auth/login` (double `/api`)
- **Solution**: Changed `NEXT_PUBLIC_API_URL` from `https://get.library.icu/api` to `https://get.library.icu`
- **Result**: Frontend rebuilt with correct URL

### 3. Frontend Rebuild ✅
- **Action**: Rebuilt frontend without cache to bake in new `NEXT_PUBLIC_API_URL`
- **Command**: `docker compose build --no-cache frontend && docker compose up -d frontend`
- **Result**: Build successful, container running

## Code References

### Frontend Login Logic
**File**: `frontend/app/login/page.tsx:14-26`
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError("");
  setLoading(true);

  try {
    await login(password);
    router.push("/");
  } catch {
    setError("Invalid password");
  } finally {
    setLoading(false);
  }
};
```

### API Client
**File**: `frontend/lib/api.ts:33-47`
```typescript
export async function login(password: string): Promise<{ access_token: string }> {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    throw new Error("Invalid password");
  }

  const data = await response.json();
  localStorage.setItem("token", data.access_token);
  return data;
}
```

**File**: `frontend/lib/api.ts:1`
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
```

### Backend Authentication
**File**: `backend/app/auth.py:14-20`
```python
def verify_password(plain_password: str) -> bool:
    if not settings.admin_password_hash:
        return False
    return bcrypt.checkpw(
        plain_password.encode('utf-8'),
        settings.admin_password_hash.encode('utf-8')
    )
```

**File**: `backend/app/routers/auth.py:12-22`
```python
@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    if not verify_password(request.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )
    access_token = create_access_token(
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes)
    )
    return TokenResponse(access_token=access_token)
```

## Debugging Steps to Try

### 1. Check Frontend Browser Console
Open browser DevTools (F12) and look for:
- Network requests to `/api/auth/login`
- Request payload
- Response status and body
- Any JavaScript errors

### 2. Check Backend Logs During Login Attempt
```bash
ssh root@5.78.148.214 "docker logs -f audiobook-web-backend-1"
```
Look for:
- POST requests to `/api/auth/login`
- HTTP status codes (200 = success, 401 = wrong password)
- Any error messages

### 3. Verify Frontend Environment Variable
```bash
ssh root@5.78.148.214 "docker exec audiobook-web-frontend-1 cat /app/.next/server/app/login/page.js | grep -A5 NEXT_PUBLIC"
```
This will show if `NEXT_PUBLIC_API_URL` is baked into the build correctly.

### 4. Test API from Browser
Open browser console on https://get.library.icu and run:
```javascript
fetch('https://get.library.icu/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: 'admin123' })
}).then(r => r.json()).then(console.log)
```

### 5. Check Cloudflare Tunnel Routing
```bash
ssh root@5.78.148.214 "cat /srv/cloudflared/config.yml"
```
Verify routing:
- `get.library.icu/api/*` → `http://localhost:8000`
- `get.library.icu` → `http://localhost:3000`

### 6. Verify Backend Health
```bash
curl https://get.library.icu/api/health
# Should return: {"status":"ok"}
```

## Possible Issues to Investigate

### 1. Browser Caching
- Frontend JavaScript might be cached
- Try incognito/private browsing mode
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

### 2. CORS Issues
Check if CORS is blocking the request:
- Backend CORS config: `backend/app/main.py:26-32`
- Current setting: `["https://get.library.icu","http://localhost:3000","http://frontend:3000"]`

### 3. NEXT_PUBLIC_API_URL Not Applied
The environment variable is baked in at build time:
- If frontend was built before the change, it has the old URL
- Solution: Force rebuild without cache (already done)

### 4. Cloudflare Tunnel Caching
Cloudflare might be caching responses:
- Check CF-Cache-Status header
- Purge Cloudflare cache if needed

### 5. Password Encoding Issue
Check if there's a character encoding mismatch:
- Backend expects UTF-8
- Frontend sends UTF-8
- Verify no special characters being added

## Quick Test Commands

### Test Backend Directly
```bash
ssh root@5.78.148.214 "curl -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{\"password\": \"admin123\"}'"
```

### Test Via Cloudflare Tunnel
```bash
curl -X POST https://get.library.icu/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password": "admin123"}'
```

### Check What Frontend Is Actually Calling
In browser console on https://get.library.icu:
```javascript
// Check the API_BASE value
console.log(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000")
```

## VPS Access
- **Host**: 5.78.148.214
- **User**: root
- **Password**: 9wVHdugpxHFn
- **Application Path**: /srv/audiobook-web

## Files Modified
1. `/srv/audiobook-web/.env` - Updated password hash
2. `/srv/audiobook-web/docker-compose.yml` - Fixed NEXT_PUBLIC_API_URL
3. `backend/app/auth.py` - Changed from passlib to direct bcrypt usage

## Next Steps
1. Check browser console for actual API endpoint being called
2. Check backend logs during a login attempt
3. Verify the built frontend has correct API_BASE value
4. Test from browser console to isolate frontend vs backend issue
