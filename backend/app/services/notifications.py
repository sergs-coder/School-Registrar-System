"""In-app notifications + email outbox.

`notify_status_change` adds a Notification row and queues an email in the session's outbox.
After the endpoint commits, `dispatch_outbox` hands the queued emails to BackgroundTasks so
email never delays (or breaks) the HTTP response.
"""
from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import utcnow
from app.db.session import SessionLocal
from app.models import Notification, Request, RequestStatus, User
from app.services.email import send_email

S = RequestStatus

MESSAGES = {
    S.submitted: "We received your request. The Registrar's Office will review it shortly.",
    S.under_review: "Your request is now being reviewed by the Registrar's Office.",
    S.needs_correction: "Your request needs a correction before we can continue.",
    S.resubmitted: "Your corrected request was sent back for review.",
    S.awaiting_payment: "Your request was approved. Please pay the fee and upload your proof of payment.",
    S.payment_verified: "Your payment was verified. Your document will be processed next.",
    S.processing: "Your document is now being prepared.",
    S.ready_for_pickup: "Your document is ready for pick-up at the Registrar's Office.",
    S.shipped: "Your document has been shipped by courier.",
    S.completed: "Your request is complete. Thank you!",
    S.rejected: "Your request was not approved.",
    S.cancelled: "Your request was cancelled.",
}

# Students get email for these (others are in-app only, to avoid inbox noise).
EMAIL_STATUSES = {
    S.submitted, S.needs_correction, S.awaiting_payment, S.processing,
    S.ready_for_pickup, S.shipped, S.completed, S.rejected,
}

OUTBOX_KEY = "email_outbox"


def notify_status_change(db: Session, req: Request, to_status: RequestStatus, actor: User, remarks, at=None) -> None:
    from app.services.workflow import STATUS_LABELS

    owner = req.student.user
    if actor.id == owner.id and to_status == S.cancelled:
        return
    body = MESSAGES.get(to_status, "")
    if remarks and to_status in (S.needs_correction, S.rejected, S.shipped, S.ready_for_pickup):
        body = f"{body} Remarks: {remarks}"
    notify_student(db, req, "status_change", STATUS_LABELS[to_status], body,
                   email=to_status in EMAIL_STATUSES, at=at)


def notify_student(db: Session, req: Request, type_: str, headline: str, body: str, *, email: bool, at=None) -> None:
    """Adds an in-app notification for the request's owner and, if `email`, queues the email too."""
    owner = req.student.user
    note = Notification(
        user_id=owner.id,
        request_id=req.id,
        type=type_,
        title=f"{req.reference_no}: {headline}",
        body=body,
        created_at=at or utcnow(),
    )
    db.add(note)
    if email:
        db.info.setdefault(OUTBOX_KEY, []).append((note, owner.email, req.reference_no, req.document_type.name))


def dispatch_outbox(db: Session, tasks: BackgroundTasks | None) -> None:
    """Call after commit. Without BackgroundTasks (seed, scripts) queued emails are dropped."""
    outbox = db.info.pop(OUTBOX_KEY, [])
    if tasks is None:
        return
    for note, email, ref, doc_name in outbox:
        link = f"{settings.frontend_url}/requests/{ref}"
        text = (
            f"Hello,\n\n{note.body}\n\nRequest: {ref} ({doc_name})\nView details: {link}\n\n"
            "— Office of the University Registrar, Trinity University of Asia\n\n"
            "This is an automated message. Please do not reply."
        )
        tasks.add_task(_send_and_mark, note.id, email, f"[TUA Registrar] {note.title}", text)


def _send_and_mark(notification_id: int, to: str, subject: str, text: str) -> None:
    if send_email(to, subject, text):
        db = SessionLocal()
        try:
            note = db.get(Notification, notification_id)
            if note:
                note.emailed_at = utcnow()
                db.commit()
        finally:
            db.close()
