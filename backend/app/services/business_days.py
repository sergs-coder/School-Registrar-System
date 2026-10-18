from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Holiday

MANILA = ZoneInfo("Asia/Manila")


def manila_date(dt: datetime) -> date:
    return dt.astimezone(MANILA).date()


def add_business_days(start: date, days: int, closed: set[date]) -> date:
    """Counts forward `days` working days from `start`, skipping weekends and closed dates."""
    current = start
    remaining = days
    while remaining > 0:
        current += timedelta(days=1)
        if current.weekday() < 5 and current not in closed:
            remaining -= 1
    return current


def closed_dates(db: Session, start: date) -> set[date]:
    return set(db.execute(select(Holiday.date).where(Holiday.date >= start)).scalars())


def estimate_release_date(db: Session, start: date, processing_days: int, review_days: int = 1) -> date:
    return add_business_days(start, processing_days + review_days, closed_dates(db, start))
