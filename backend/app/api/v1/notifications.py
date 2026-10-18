from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.deps import require_consent
from app.core.errors import NotFound
from app.core.security import utcnow
from app.db.session import get_db
from app.models import Notification, Request, User
from app.schemas.common import ORM, Page

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationOut(ORM):
    id: int
    type: str
    title: str
    body: str
    reference_no: str | None = None
    read_at: datetime | None
    created_at: datetime


class UnreadCount(BaseModel):
    unread: int


def _out(n: Notification, ref: str | None) -> NotificationOut:
    return NotificationOut(id=n.id, type=n.type, title=n.title, body=n.body, reference_no=ref,
                           read_at=n.read_at, created_at=n.created_at)


@router.get("", response_model=Page[NotificationOut])
def list_notifications(
    unread_only: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: User = Depends(require_consent),
    db: Session = Depends(get_db),
):
    base = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        base = base.where(Notification.read_at.is_(None))
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.execute(
        base.add_columns(Request.reference_no)
        .outerjoin(Request, Request.id == Notification.request_id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return Page(items=[_out(n, ref) for n, ref in rows], total=total, page=page, page_size=page_size)


@router.get("/unread-count", response_model=UnreadCount)
def unread_count(user: User = Depends(require_consent), db: Session = Depends(get_db)):
    n = db.scalar(
        select(func.count()).select_from(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    )
    return UnreadCount(unread=n)


@router.post("/{notification_id}/read", response_model=UnreadCount)
def mark_read(notification_id: int, user: User = Depends(require_consent), db: Session = Depends(get_db)):
    note = db.get(Notification, notification_id)
    if note is None or note.user_id != user.id:
        raise NotFound("Notification not found.")
    if note.read_at is None:
        note.read_at = utcnow()
        db.commit()
    return unread_count(user, db)


@router.post("/read-all", response_model=UnreadCount)
def mark_all_read(user: User = Depends(require_consent), db: Session = Depends(get_db)):
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=utcnow())
    )
    db.commit()
    return UnreadCount(unread=0)
