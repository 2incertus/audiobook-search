# Deployment Guide

## Prerequisites

- Docker and Docker Compose installed on VPS
- Cloudflare tunnel already configured (`audiobookshelf-vps`)

## Quick Deploy to Hetzner VPS

### 1. Copy files to server

```bash
# From your local machine
scp -r audiobook-web root@5.78.148.214:/srv/audiobook-downloader
```

### 2. Set up environment

```bash
ssh root@5.78.148.214

cd /srv/audiobook-downloader

# Create .env file
cat > .env << 'EOF'
SECRET_KEY=$(openssl rand -hex 32)
ADMIN_PASSWORD_HASH=$2b$12$your-hashed-password
EOF

# Generate password hash (run this locally or on server)
python3 -c "from passlib.hash import bcrypt; print(bcrypt.hash('your-password-here'))"
```

### 3. Update Cloudflare Tunnel

Edit `/srv/cloudflared/config.yml`:

```yaml
tunnel: 0a26fe8e-d66f-4ed9-a6a1-1959e1297aa7
credentials-file: /home/nonroot/.cloudflared/0a26fe8e-d66f-4ed9-a6a1-1959e1297aa7.json
ingress:
  - hostname: books.library.icu
    service: http://localhost:13378
  - hostname: get.library.icu
    service: http://localhost:3000
  - service: http_status:404
```

Add DNS record:
```bash
cloudflared tunnel route dns audiobookshelf-vps get.library.icu
```

Restart cloudflared:
```bash
docker restart cloudflared
```

### 4. Start the application

```bash
cd /srv/audiobook-downloader

# Use production compose file
docker compose -f docker-compose.prod.yml up -d --build
```

### 5. Verify

- Visit https://get.library.icu
- Log in with your password
- Search for an audiobook and add to queue
- Check Audiobookshelf at https://books.library.icu - new books should appear

## Local Development

```bash
cd audiobook-web

# Create .env
cp .env.example .env
# Edit .env with your values

# Start services
docker compose up --build

# Or run separately:
# Backend
cd backend
pip install -e .
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Updating

```bash
cd /srv/audiobook-downloader
git pull  # or scp new files
docker compose -f docker-compose.prod.yml up -d --build
```

## Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Backend only
docker compose -f docker-compose.prod.yml logs -f backend

# Frontend only
docker compose -f docker-compose.prod.yml logs -f frontend
```
