"""Payments: students upload proof while a request awaits payment; staff verify or reject it.

Verification itself is a status change (awaiting_payment -> payment_verified), so `workflow.transition`
calls `record_verification` and every verified request ends up with exactly one verified Payment,
whether it came from an uploaded proof, a bulk action or a walk-in payment at the cashier.
"""
from datetime import date, datetime, time

from sqlalchemy.orm import Session

from app.core.errors import AppError, NotFound
from app.core.security import utcnow
from app.core.storage import get_storage
from app.models import (
    AttachmentKind,
    Payment,
    PaymentMethod,
    PaymentStatus,
    Request,
    RequestAttachment,
    RequestStatus,
    RequestStatusHistory,
    ReviewStatus,
    User,
)
from app.services.business_days import MANILA, manila_date
from app.services.uploads import safe_filename, sha256, validate_upload

METHOD_LABELS = {
    PaymentMethod.cashier: "University Cashier",
    PaymentMethod.bank_deposit: "Bank deposit",
    PaymentMethod.gcash: "GCash",
    PaymentMethod.maya: "Maya",
}


def pending_payment(req: Request) -> Payment | None:
    return next((p for p in req.payments if p.status == PaymentStatus.pending), None)


def can_submit_payment(req: Request) -> bool:
    return req.status == RequestStatus.awaiting_payment and pending_payment(req) is None


def _log(db: Session, req: Request, actor: User, remarks: str, at: datetime) -> None:
    """A same-status history entry, so the payment step shows on the student's timeline. Touching
    updated_at bumps the request version, so a colleague's stale "verify" click gets STALE_REQUEST."""
    req.updated_at = at
    entry = RequestStatusHistory(request_id=req.id, from_status=req.status, to_status=req.status,
                                 actor_id=actor.id, remarks=remarks, is_internal=False, created_at=at)
    db.add(entry)
    req.history.append(entry)


def submit_payment(
    db: Session,
    req: Request,
    user: User,
    *,
    method: PaymentMethod,
    payer_reference: str,
    paid_on: date,
    filename: str,
    data: bytes,
) -> Payment:
    if req.status != RequestStatus.awaiting_payment:
        raise AppError("PAYMENT_NOT_DUE", "This request is not waiting for a payment.", 409)
    if pending_payment(req):
        raise AppError("PAYMENT_PENDING", "Your proof of payment is already being checked.", 409)
    today = manila_date(utcnow())
    if paid_on > today:
        raise AppError("VALIDATION_ERROR", "Some fields are invalid.", 422,
                       [{"field": "paid_on", "message": "The payment date can’t be in the future."}])
    payer_reference = payer_reference.strip()
    if not payer_reference:
        raise AppError("VALIDATION_ERROR", "Some fields are invalid.", 422,
                       [{"field": "payer_reference", "message": "Enter the receipt or transaction number."}])
    _, mime = validate_upload(filename, data, ["pdf", "jpg", "png"], None)

    now = utcnow()
    proof = RequestAttachment(
        request_id=req.id,
        kind=AttachmentKind.payment_proof,
        original_filename=safe_filename(filename or "receipt"),
        storage_key=get_storage().put(data),
        mime_type=mime,
        size_bytes=len(data),
        sha256=sha256(data),
        uploaded_by_id=user.id,
        created_at=now,
    )
    db.add(proof)
    req.attachments.append(proof)
    db.flush()
    payment = Payment(
        request_id=req.id,
        amount=req.fee_total,
        method=method,
        payer_reference=payer_reference,
        paid_at=datetime.combine(paid_on, time(12), tzinfo=MANILA),
        proof_attachment_id=proof.id,
        status=PaymentStatus.pending,
    )
    payment.proof = proof
    db.add(payment)
    req.payments.append(payment)
    _log(db, req, user, f"Proof of payment uploaded ({METHOD_LABELS[method]}, ref. {payer_reference}).", now)
    return payment


def record_verification(db: Session, req: Request, actor: User, at: datetime) -> Payment:
    """Marks the pending payment verified. With no uploaded proof, the student paid at the counter,
    so a cashier payment is recorded for the full fee."""
    payment = pending_payment(req)
    if payment is None:
        payment = Payment(request_id=req.id, amount=req.fee_total, method=PaymentMethod.cashier,
                          status=PaymentStatus.pending, paid_at=at, remarks="Recorded by the Registrar's Office.")
        db.add(payment)
        req.payments.append(payment)
    payment.status = PaymentStatus.verified
    payment.verified_by_id = actor.id
    payment.verified_at = at
    if payment.proof is not None:
        payment.proof.review_status = ReviewStatus.accepted
    return payment


def reject_payment(db: Session, req: Request, payment_id: int, actor: User, remarks: str) -> Payment:
    payment = next((p for p in req.payments if p.id == payment_id), None)
    if payment is None:
        raise NotFound("Payment not found.")
    if payment.status != PaymentStatus.pending or req.status != RequestStatus.awaiting_payment:
        raise AppError("PAYMENT_NOT_PENDING", "Only a payment that is still being checked can be rejected.", 409)
    remarks = remarks.strip()
    if not remarks:
        raise AppError("REMARKS_REQUIRED", "Please give a reason so the student knows what to do.", 422)

    now = utcnow()
    payment.status = PaymentStatus.rejected
    payment.remarks = remarks[:500]
    payment.verified_by_id = actor.id
    payment.verified_at = now
    if payment.proof is not None:
        payment.proof.review_status = ReviewStatus.rejected
    _log(db, req, actor, f"Proof of payment not accepted: {remarks}", now)

    from app.services.notifications import notify_student

    notify_student(db, req, "payment_rejected", "Payment not accepted",
                   f"We couldn’t verify your proof of payment. Reason: {remarks} Please upload a new one.",
                   email=True, at=now)
    return payment
