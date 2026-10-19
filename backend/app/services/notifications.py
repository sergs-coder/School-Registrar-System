"""In-app notifications + email outbox.

Every student-visible status change adds a Notification row and queues a tracking email (with a
progress tracker) to the student's university email and, once verified, their personal email.
After the endpoint commits, `dispatch_outbox` hands the queued emails to BackgroundTasks so email
never delays (or breaks) the HTTP response.
"""
from dataclasses import dataclass

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.core.security import utcnow
from app.db.session import SessionLocal
from app.models import TERMINAL_STATUSES, DeliveryMethod, Notification, Request, RequestStatus, User
from app.services.email import send_email
from app.services.email_templates import TrackerStep, UpdateEmail, render_html, render_text

S = RequestStatus

MESSAGES = {
    S.submitted: "We received your request. The Registrar's Office will review it shortly.",
    S.under_review: "Your request is now being reviewed by the Registrar's Office.",
    S.needs_correction: "Your request needs a correction before we can continue.",
    S.resubmitted: "Your corrected request was sent back for review.",
    S.awaiting_payment: "Good news: your request was approved. Please pay the fee and upload your proof of payment.",
    S.payment_verified: "Your payment was verified. Your document will be processed next.",
    S.processing: "Your document is now being prepared.",
    S.ready_for_pickup: "Your document is ready for pick-up at the Registrar's Office.",
    S.shipped: "Your document has been shipped by courier.",
    S.completed: "Your document has been released. Thank you for using the Student Request Portal!",
    S.rejected: "Your request was not approved.",
    S.cancelled: "Your request was cancelled.",
}
# Approval without a fee goes straight to processing; say so plainly.
APPROVED_NO_FEE = "Good news: your request was approved. Your document is now being prepared."

NEXT_STEPS = {
    S.submitted: "Next: the Registrar's Office reviews your request, usually within one working day.",
    S.needs_correction: "Next: open your request, fix the items noted, and resubmit it.",
    S.awaiting_payment: "Next: pay the fee, then upload a photo of your receipt on your request page.",
    S.ready_for_pickup: "Next: bring a valid ID and your pick-up slip (or reference number) to the Registrar's Office.",
}

OUTBOX_KEY = "email_outbox"


@dataclass
class QueuedEmail:
    note: Notification
    recipients: list[str]
    email: UpdateEmail


def recipients_for(req: Request) -> list[str]:
    """University email always; personal email only once the student has verified it."""
    student = req.student
    out = [student.user.email]
    if student.personal_email_verified and student.personal_email.lower() != out[0].lower():
        out.append(student.personal_email)
    return out


def tracker(req: Request) -> list[TrackerStep]:
    """The student-facing stages, mirroring the request page's progress stepper."""
    from app.services.workflow import payment_required

    stages = [("Submitted", {S.submitted}), ("Review", {S.under_review, S.needs_correction, S.resubmitted})]
    if payment_required(req):
        stages.append(("Payment", {S.awaiting_payment, S.payment_verified}))
    stages.append(("Processing", {S.processing}))
    stages.append(("Shipped" if req.delivery_method == DeliveryMethod.courier else "Ready", {S.ready_for_pickup, S.shipped}))
    stages.append(("Released", {S.completed}))

    stopped = req.status in (S.rejected, S.cancelled)
    effective = req.status
    if stopped:  # show how far it got before it stopped
        effective = next((h.to_status for h in reversed(req.history)
                          if h.to_status not in TERMINAL_STATUSES and h.to_status != S.draft), S.submitted)
    current = next((i for i, (_, statuses) in enumerate(stages) if effective in statuses), 0)
    steps = []
    for i, (label, _) in enumerate(stages):
        if i < current:
            state = "done"
        elif i == current:
            state = "stopped" if stopped else ("done" if req.status == S.completed else "current")
        else:
            state = "todo"
        steps.append(TrackerStep(label, state))
    return steps


def _headline(to_status: RequestStatus, from_status: RequestStatus | None) -> str:
    from app.services.workflow import STATUS_LABELS

    if to_status == S.awaiting_payment or (to_status == S.processing and from_status == S.under_review):
        return "Approved"
    if to_status == S.completed:
        return "Released"
    return STATUS_LABELS[to_status]


def notify_status_change(db: Session, req: Request, to_status: RequestStatus, actor: User, remarks, at=None,
                         from_status: RequestStatus | None = None) -> None:
    owner = req.student.user
    if actor.id == owner.id and to_status == S.cancelled:
        return
    approved_no_fee = to_status == S.processing and from_status == S.under_review
    body = APPROVED_NO_FEE if approved_no_fee else MESSAGES.get(to_status, "")
    if remarks and to_status in (S.needs_correction, S.rejected, S.shipped, S.ready_for_pickup):
        body = f"{body} Remarks: {remarks}"
    notify_student(db, req, "status_change", _headline(to_status, from_status), body, email=True, at=at,
                   next_step=NEXT_STEPS.get(to_status))


def notify_student(db: Session, req: Request, type_: str, headline: str, body: str, *, email: bool, at=None,
                   next_step: str | None = None, urgent: bool = False) -> None:
    """Adds an in-app notification for the request's owner and, if `email`, queues the tracking email too."""
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
    if not email:
        return
    eta = None
    if req.estimated_release_date and req.status not in TERMINAL_STATUSES:
        eta = req.estimated_release_date.strftime("%b %d, %Y").replace(" 0", " ")
    update = UpdateEmail(headline=headline, body=body, reference_no=req.reference_no,
                         document_name=req.document_type.name, steps=tracker(req), next_step=next_step,
                         estimated_release=eta, urgent=urgent)
    db.info.setdefault(OUTBOX_KEY, []).append(QueuedEmail(note, recipients_for(req), update))


def dispatch_outbox(db: Session, tasks: BackgroundTasks | None) -> None:
    """Call after commit. Without BackgroundTasks (seed, scripts) queued emails are dropped."""
    outbox: list[QueuedEmail] = db.info.pop(OUTBOX_KEY, [])
    if tasks is None:
        return
    for item in outbox:
        tasks.add_task(_send_and_mark, item.note.id, item.recipients, *_render(item))


def send_outbox_now(db: Session) -> int:
    """Call after commit, outside a request (e.g. the reminder job). Returns how many emails were queued."""
    outbox: list[QueuedEmail] = db.info.pop(OUTBOX_KEY, [])
    for item in outbox:
        _send_and_mark(item.note.id, item.recipients, *_render(item))
    return len(outbox)


def _render(item: QueuedEmail) -> tuple[str, str, str]:
    prefix = "[TUA Registrar] Action needed: " if item.email.urgent else "[TUA Registrar] "
    return f"{prefix}{item.note.title}", render_text(item.email), render_html(item.email)


def _send_and_mark(notification_id: int, recipients: list[str], subject: str, text: str, html: str) -> None:
    # One message per address, so neither address is exposed to the other's mailbox provider.
    sent = [send_email(to, subject, text, html) for to in recipients]
    if any(sent):
        db = SessionLocal()
        try:
            note = db.get(Notification, notification_id)
            if note:
                note.emailed_at = utcnow()
                db.commit()
        finally:
            db.close()
