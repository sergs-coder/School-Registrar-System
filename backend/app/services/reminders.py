"""Reminders for requests that have stalled.

- Waiting on the student (correction, payment, pick-up) for more than REMIND_AFTER_DAYS: an "Action needed"
  reminder, repeated every REPEAT_EVERY_DAYS, at most MAX_REMINDERS times per step.
- More than LATE_AFTER_DAYS past the estimated release date while the Registrar holds it: one "running late" note.

Reminders appear in-app always; they're emailed (university + confirmed personal address) unless the student
turned reminder emails off. Every status change resets the bookkeeping, so a new step starts a new clock.
Safe to run as often as you like: the timestamps make repeated runs no-ops.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from app.core.security import utcnow
from app.models import PaymentStatus, Request, RequestStatus, Student
from app.services.business_days import manila_date
from app.services.notifications import notify_student, send_outbox_now

S = RequestStatus
REMIND_AFTER_DAYS = 2
REPEAT_EVERY_DAYS = 2
MAX_REMINDERS = 3
LATE_AFTER_DAYS = 2

# Statuses where the next move is the student's. Payment counts only until a receipt is uploaded.
WAITING_ON_STUDENT = {
    S.needs_correction: (
        "Your request still needs a correction",
        "Your request is on hold until you fix the items the Registrar's Office noted and resubmit it.",
        "Open your request, make the corrections, and resubmit it.",
    ),
    S.awaiting_payment: (
        "Your payment is still due",
        "Your request was approved, but we haven't received your payment yet.",
        "Pay the fee, then upload a photo of your receipt on your request page.",
    ),
    S.ready_for_pickup: (
        "Your document is waiting for pick-up",
        "Your document is ready and waiting for you at the Registrar's Office.",
        "Book a pick-up time on your request page, then bring a valid ID and your pick-up slip (or reference "
        "number) to the Registrar's Office.",
    ),
}
# The Registrar holds the ball in these (same as the staff "overdue" filter).
REGISTRAR_STATUSES = {S.submitted, S.under_review, S.resubmitted, S.payment_verified, S.processing}


@dataclass
class ReminderRun:
    action_reminders: int = 0
    late_notices: int = 0
    emails_queued: int = 0


def _entered_status_at(req: Request) -> datetime | None:
    """When the request moved into its current status."""
    return next((h.created_at for h in reversed(req.history)
                 if h.to_status == req.status and h.from_status != req.status), None)


def _record(db: Session, req: Request, **values) -> None:
    """Saves reminder bookkeeping without touching the request's version or updated_at, so a staff member
    with the request open doesn't get a "someone else changed it" conflict from a reminder."""
    db.execute(
        update(Request).where(Request.id == req.id).values(**values, updated_at=Request.updated_at)
        .execution_options(synchronize_session=False)
    )


def _waiting_on_student(req: Request) -> bool:
    if req.status == S.awaiting_payment:
        return not any(p.status == PaymentStatus.pending for p in req.payments)
    return req.status in WAITING_ON_STUDENT


def run_reminders(db: Session, now: datetime | None = None) -> ReminderRun:
    now = now or utcnow()
    result = ReminderRun()
    candidates = db.execute(
        select(Request)
        .where(Request.status.in_([*WAITING_ON_STUDENT, *REGISTRAR_STATUSES]))
        .options(
            selectinload(Request.history),
            selectinload(Request.payments),
            selectinload(Request.document_type),
            selectinload(Request.student).selectinload(Student.user),
        )
        # Always read fresh rows: preferences and reminder timestamps may have changed since this
        # session last loaded them (the timestamps are written with a plain UPDATE, see _record).
        .execution_options(populate_existing=True)
    ).scalars().all()

    for req in candidates:
        email = req.student.reminder_emails
        if _waiting_on_student(req) and req.reminder_count < MAX_REMINDERS:
            entered = _entered_status_at(req)
            last = req.last_reminded_at
            due = entered and now - entered >= timedelta(days=REMIND_AFTER_DAYS) and (
                last is None or now - last >= timedelta(days=REPEAT_EVERY_DAYS))
            if due:
                headline, body, next_step = WAITING_ON_STUDENT[req.status]
                days = (now - entered).days
                notify_student(db, req, "reminder", headline, f"{body} (Waiting {days} days.)", email=email,
                               at=now, next_step=f"Next: {next_step}", urgent=True)
                _record(db, req, reminder_count=req.reminder_count + 1, last_reminded_at=now)
                result.action_reminders += 1
        elif req.status in REGISTRAR_STATUSES and req.estimated_release_date and req.delay_notified_at is None:
            days_late = (manila_date(now) - req.estimated_release_date).days
            if days_late > LATE_AFTER_DAYS:
                notify_student(
                    db, req, "delay", "Taking longer than expected",
                    "Your request is taking longer than we estimated. The Registrar's Office is still working on it, "
                    "and you'll get an update as soon as it moves. Sorry for the wait.",
                    email=email, at=now,
                )
                _record(db, req, delay_notified_at=now)
                result.late_notices += 1

    db.commit()
    result.emails_queued = send_outbox_now(db)
    return result


if __name__ == "__main__":
    from app.db.session import SessionLocal

    session = SessionLocal()
    try:
        print(run_reminders(session))
    finally:
        session.close()
