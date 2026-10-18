from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import utcnow
from app.models import ReferenceCounter


def next_reference_no(db: Session, year: int | None = None) -> str:
    """Returns SRM-<year>-<6 digits>. The counter row is locked (FOR UPDATE on PostgreSQL;
    SQLite serialises writers) so concurrent submissions never share a number."""
    year = year or utcnow().year
    counter = db.execute(
        select(ReferenceCounter).where(ReferenceCounter.year == year).with_for_update()
    ).scalar_one_or_none()
    if counter is None:
        counter = ReferenceCounter(year=year, last_value=0)
        db.add(counter)
    counter.last_value += 1
    db.flush()
    return f"SRM-{year}-{counter.last_value:06d}"
