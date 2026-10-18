from fastapi import Request as HttpRequest
from sqlalchemy.orm import Session

from app.core.security import utcnow
from app.models import AuditLog, User


def audit(
    db: Session,
    action: str,
    *,
    actor: User | None = None,
    entity_type: str | None = None,
    entity_id: str | int | None = None,
    http: HttpRequest | None = None,
    meta: dict | None = None,
) -> None:
    """Adds an audit row to the session; the caller's commit persists it."""
    db.add(
        AuditLog(
            actor_id=actor.id if actor else None,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            ip=http.client.host if http and http.client else None,
            user_agent=(http.headers.get("user-agent") or "")[:300] if http else None,
            meta=meta or {},
            created_at=utcnow(),
        )
    )
