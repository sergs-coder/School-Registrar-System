"""Pick-up appointments: open slots from the admin's schedule, booking and rescheduling.

A slot is an hour starting at one of the schedule's times on an open day (not a closed day). It takes up to
`capacity` students; each booking holds one numbered seat, and the unique (date, time, seat) constraint makes
the last seat go to only one student even when two book at the same moment.
"""
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import DeliveryMethod, Holiday, PickupAppointment, Request, RequestStatus
from app.services.app_settings import get_setting
from app.services.business_days import MANILA

# Same-day slots stay bookable until this long before they start.
LEAD_TIME = timedelta(hours=1)


@dataclass
class Slot:
    time: str
    left: int


@dataclass
class Day:
    date: date
    slots: list[Slot]


def schedule(db: Session) -> dict:
    return get_setting(db, "pickup_schedule")


def can_book(req: Request) -> bool:
    return req.status == RequestStatus.ready_for_pickup and req.delivery_method == DeliveryMethod.pickup


def label(appt: PickupAppointment) -> str:
    """e.g. "Tue, Oct 21, 2026 · 9:00 AM"."""
    start = datetime.combine(appt.date, datetime.strptime(appt.time, "%H:%M").time())
    return f"{start:%a, %b} {start.day}, {start.year} · {start:%I:%M %p}".replace(" 0", " ")


def _booked(db: Session, start: date, end: date, exclude_request_id: int | None) -> dict[tuple[date, str], int]:
    q = (
        select(PickupAppointment.date, PickupAppointment.time, func.count())
        .where(PickupAppointment.date >= start, PickupAppointment.date <= end)
        .group_by(PickupAppointment.date, PickupAppointment.time)
    )
    if exclude_request_id is not None:
        q = q.where(PickupAppointment.request_id != exclude_request_id)
    return {(d, t): n for d, t, n in db.execute(q)}


def open_days(db: Session, now: datetime, exclude_request_id: int | None = None) -> list[Day]:
    """Bookable days from today (Manila) through `days_ahead`, with seats left per slot. Full slots are kept
    (left=0) so students can see the day's shape; days with no slots at all are left out."""
    sched = schedule(db)
    local_now = now.astimezone(MANILA)
    today = local_now.date()
    end = today + timedelta(days=int(sched["days_ahead"]))
    closed = set(db.execute(select(Holiday.date).where(Holiday.date >= today, Holiday.date <= end)).scalars())
    booked = _booked(db, today, end, exclude_request_id)
    capacity = int(sched["capacity"])
    days = []
    for offset in range((end - today).days + 1):
        d = today + timedelta(days=offset)
        if d in closed:
            continue
        slots = []
        for t in sorted(sched["slots"].get(str(d.weekday()), [])):
            start = datetime.combine(d, datetime.strptime(t, "%H:%M").time(), tzinfo=MANILA)
            if start - LEAD_TIME < local_now:
                continue
            slots.append(Slot(t, max(0, capacity - booked.get((d, t), 0))))
        if slots:
            days.append(Day(d, slots))
    return days


def book(db: Session, req: Request, day: date, time: str, now: datetime) -> PickupAppointment:
    """Books (or moves) the request's appointment. Raises SLOT_UNAVAILABLE / SLOT_FULL."""
    if not can_book(req):
        raise AppError("PICKUP_NOT_BOOKABLE", "You can book a pick-up time once your document is ready for pick-up.", 409)
    current = req.pickup_appointment
    if current and current.date == day and current.time == time:
        return current
    days = {d.date: d for d in open_days(db, now, exclude_request_id=req.id)}
    slot = next((s for s in days[day].slots if s.time == time), None) if day in days else None
    if slot is None:
        raise AppError("SLOT_UNAVAILABLE", "That pick-up time isn't available. Please choose another.", 422,
                       [{"field": "time", "message": "Choose one of the open times."}])
    if slot.left == 0:
        raise _full()

    capacity = int(schedule(db)["capacity"])
    taken = set(db.execute(
        select(PickupAppointment.seat).where(PickupAppointment.date == day, PickupAppointment.time == time)
    ).scalars())
    seat = next(s for s in range(1, capacity + 1) if s not in taken)
    try:
        with db.begin_nested():
            if current:
                current.date, current.time, current.seat = day, time, seat
            else:
                current = PickupAppointment(request_id=req.id, date=day, time=time, seat=seat)
                db.add(current)
            db.flush()
    except IntegrityError:
        raise _full() from None
    req.pickup_appointment = current
    return current


def cancel(db: Session, req: Request) -> None:
    if req.pickup_appointment is None:
        raise AppError("NO_APPOINTMENT", "There's no pick-up time to cancel.", 409)
    if not can_book(req):
        raise AppError("PICKUP_NOT_BOOKABLE", "This pick-up time can no longer be changed.", 409)
    db.delete(req.pickup_appointment)
    req.pickup_appointment = None


def _full() -> AppError:
    return AppError("SLOT_FULL", "Someone just took the last spot at that time. Please choose another.", 409)
