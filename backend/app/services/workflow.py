"""Request status state machine. Every status change in the system goes through
`transition()`, which enforces who may move a request where and logs the change."""
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import utcnow
from app.models import Request, RequestStatus, RequestStatusHistory, Role, User
from app.services.business_days import estimate_release_date, manila_date

S = RequestStatus
STUDENT = "student"
STAFF = "staff"

# (from, to) -> the actor kind allowed to make that move
TRANSITIONS: dict[tuple[RequestStatus, RequestStatus], str] = {
    (S.draft, S.submitted): STUDENT,
    (S.draft, S.cancelled): STUDENT,
    (S.submitted, S.cancelled): STUDENT,
    (S.submitted, S.under_review): STAFF,
    (S.submitted, S.rejected): STAFF,
    (S.under_review, S.needs_correction): STAFF,
    (S.under_review, S.awaiting_payment): STAFF,
    (S.under_review, S.processing): STAFF,  # only when no payment is due
    (S.under_review, S.rejected): STAFF,
    (S.needs_correction, S.resubmitted): STUDENT,
    (S.needs_correction, S.rejected): STAFF,
    (S.resubmitted, S.under_review): STAFF,
    (S.resubmitted, S.rejected): STAFF,
    (S.awaiting_payment, S.payment_verified): STAFF,
    (S.awaiting_payment, S.rejected): STAFF,
    (S.payment_verified, S.processing): STAFF,
    (S.processing, S.ready_for_pickup): STAFF,
    (S.processing, S.shipped): STAFF,
    (S.ready_for_pickup, S.completed): STAFF,
    (S.shipped, S.completed): STAFF,
}

REMARKS_REQUIRED = {S.needs_correction, S.rejected}

STATUS_LABELS = {
    S.draft: "Draft",
    S.submitted: "Submitted",
    S.under_review: "Under Review",
    S.needs_correction: "Needs Correction",
    S.resubmitted: "Resubmitted",
    S.awaiting_payment: "Awaiting Payment",
    S.payment_verified: "Payment Verified",
    S.processing: "Processing",
    S.ready_for_pickup: "Ready for Pick-up",
    S.shipped: "Shipped",
    S.completed: "Completed",
    S.rejected: "Rejected",
    S.cancelled: "Cancelled",
}


def actor_kind(user: User) -> str:
    return STUDENT if user.role == Role.student else STAFF


def payment_required(req: Request) -> bool:
    return bool(req.doc_type_snapshot.get("requires_payment", True)) and req.fee_total > 0


def approval_target(req: Request) -> RequestStatus:
    """Where "Approve" sends a request under review."""
    return S.awaiting_payment if payment_required(req) else S.processing


def allowed_transitions(req: Request, user: User) -> list[RequestStatus]:
    kind = actor_kind(user)
    if kind == STUDENT and req.student.user_id != user.id:
        return []
    targets = [to for (frm, to), who in TRANSITIONS.items() if frm == req.status and who == kind]
    if req.status == S.under_review:
        # Approval goes to exactly one place depending on whether a fee is due.
        wrong = S.processing if payment_required(req) else S.awaiting_payment
        targets = [t for t in targets if t != wrong]
    return targets


def transition(
    db: Session,
    req: Request,
    to_status: RequestStatus,
    actor: User,
    remarks: str | None = None,
    *,
    is_internal: bool = False,
    at=None,
) -> RequestStatusHistory:
    from_status = req.status
    if to_status not in allowed_transitions(req, actor):
        raise AppError(
            "INVALID_TRANSITION",
            f"A request that is {STATUS_LABELS[from_status]} cannot be moved to {STATUS_LABELS[to_status]}.",
            409,
        )
    remarks = (remarks or "").strip() or None
    if to_status in REMARKS_REQUIRED and not remarks:
        raise AppError("REMARKS_REQUIRED", "Please give a reason so the student knows what to do.", 422)

    now = at or utcnow()
    req.status = to_status
    # A new step starts the reminder clock over.
    req.reminder_count = 0
    req.last_reminded_at = None
    req.delay_notified_at = None
    if to_status == S.submitted:
        req.submitted_at = now
    if to_status in (S.submitted, S.processing):
        start = manila_date(now)
        days = int(req.doc_type_snapshot.get("processing_days", 3))
        req.estimated_release_date = estimate_release_date(
            db, start, days, review_days=1 if to_status == S.submitted else 0
        )
    if to_status in (S.completed, S.rejected, S.cancelled):
        req.completed_at = now
    if to_status == S.payment_verified:
        from app.services.payments import record_verification

        record_verification(db, req, actor, now)

    entry = RequestStatusHistory(
        request_id=req.id,
        from_status=from_status,
        to_status=to_status,
        actor_id=actor.id,
        remarks=remarks,
        is_internal=is_internal,
        created_at=now,
    )
    db.add(entry)
    req.history.append(entry)

    from app.services.notifications import notify_status_change

    if not is_internal:
        notify_status_change(db, req, to_status, actor, remarks, at=now, from_status=from_status)
    return entry
