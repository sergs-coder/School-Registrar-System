import time
from collections import defaultdict, deque

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import AppError, Forbidden, Unauthorized
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import Role, User

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> User:
    if creds is None:
        raise Unauthorized()
    try:
        payload = decode_access_token(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise Unauthorized("Your session has expired.", code="TOKEN_EXPIRED")
    except jwt.InvalidTokenError:
        raise Unauthorized("Invalid session.", code="INVALID_TOKEN")
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise Unauthorized("Account is not active.", code="INVALID_TOKEN")
    return user


def require_consent(user: User = Depends(get_current_user)) -> User:
    if user.privacy_consent_at is None:
        raise Forbidden("Please review and accept the Data Privacy notice first.", code="CONSENT_REQUIRED")
    return user


def require_student(user: User = Depends(require_consent)) -> User:
    if user.role != Role.student or user.student is None:
        raise Forbidden("This page is for students.")
    return user


def require_staff(user: User = Depends(require_consent)) -> User:
    if user.role not in (Role.staff, Role.admin):
        raise Forbidden()
    return user


def require_admin(user: User = Depends(require_consent)) -> User:
    if user.role != Role.admin:
        raise Forbidden()
    return user


class RateLimiter:
    """In-memory sliding window per client IP. Fine for a single instance; use Redis when scaling out."""

    def __init__(self, limit: int, window_seconds: int):
        self.limit, self.window = limit, window_seconds
        self.hits: dict[str, deque] = defaultdict(deque)

    def __call__(self, request: Request) -> None:
        key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            raise AppError("RATE_LIMITED", "Too many attempts. Please wait a few minutes and try again.", 429)
        q.append(now)


login_limiter = RateLimiter(limit=10, window_seconds=300)
reset_limiter = RateLimiter(limit=5, window_seconds=900)
account_request_limiter = RateLimiter(limit=5, window_seconds=3600)
