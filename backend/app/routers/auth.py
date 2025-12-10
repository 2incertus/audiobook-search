from datetime import timedelta

from fastapi import APIRouter, HTTPException, status

from app.auth import verify_password, create_access_token
from app.config import settings
from app.schemas import LoginRequest, TokenResponse

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    # Debug logging (using print for visibility in docker logs)
    print(f"[DEBUG] Login attempt - password length: {len(request.password)}, first 2 chars: '{request.password[:2] if request.password else 'empty'}'", flush=True)

    if not verify_password(request.password):
        print(f"[DEBUG] Password verification FAILED", flush=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )

    print(f"[DEBUG] Password verification SUCCESS", flush=True)
    access_token = create_access_token(
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes)
    )
    return TokenResponse(access_token=access_token)
