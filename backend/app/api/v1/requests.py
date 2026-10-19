from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, Request as HttpRequest, Response, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import require_consent, require_student
from app.core.errors import AppError, NotFound
from app.core.security import utcnow
from app.core.storage import get_storage
from app.db.session import get_db
from app.models import (
    AttachmentKind,
    DeliveryMethod,
    DocumentType,
    IssuedDocument,
    IssuedKind,
    Payment,
    PaymentMethod,
    Request,
    RequestAttachment,
    RequestStatus,
    Role,
    User,
)
from app.schemas.common import Page
from app.schemas.requests import (
    HistoryOut,
    IssuedDocumentOut,
    PaymentOut,
    QuoteIn,
    QuoteOut,
    RemarksIn,
    RequestCreate,
    RequestDetail,
    RequestListItem,
    RequestUpdate,
    appointment_out,
)
from app.services.audit import audit
from app.services.business_days import estimate_release_date, manila_date
from app.services.documents import RELEASED, display_code, verify_url
from app.services.fees import compute_fees, make_snapshot
from app.services.forms import clean_form_data
from app.services.notifications import dispatch_outbox
from app.services.payments import can_submit_payment, submit_payment
from app.services.reference_no import next_reference_no
from app.services.uploads import safe_filename, sha256, validate_upload
from app.services.workflow import allowed_transitions, transition

router = APIRouter(tags=["requests"])
S = RequestStatus
EDITABLE = {S.draft, S.needs_correction}
ACTION_NAMES = {S.submitted: "submit", S.resubmitted: "resubmit", S.cancelled: "cancel"}


# ---------- helpers ----------

def _load(db: Session, ref: str, user: User) -> Request:
    """Students can only ever load their own requests; other refs look like they don't exist."""
    q = (
        select(Request)
        .where(Request.reference_no == ref)
        .options(
            selectinload(Request.attachments),
            selectinload(Request.history),
            selectinload(Request.document_type),
            selectinload(Request.payments).selectinload(Payment.proof),
            selectinload(Request.issued_documents).selectinload(IssuedDocument.attachment),
            selectinload(Request.pickup_appointment),
        )
    )
    if user.role == Role.student:
        q = q.where(Request.student_id == user.student.id)
    else:
        q = q.where(Request.status != S.draft)  # drafts are private to the student
    req = db.execute(q).scalar_one_or_none()
    if req is None:
        raise NotFound("Request not found.")
    return req


def _active_doc_type(db: Session, doc_type_id: int) -> DocumentType:
    doc = db.get(DocumentType, doc_type_id)
    if doc is None or not doc.is_active:
        raise AppError("VALIDATION_ERROR", "That document type is not available.", 422,
                       [{"field": "document_type_id", "message": "Choose an available document."}])
    return doc


def _region(req: Request) -> str | None:
    return (req.delivery_address or {}).get("region")


def _refresh_fees(db: Session, req: Request) -> None:
    req.fee_breakdown, req.fee_total = compute_fees(
        db, req.doc_type_snapshot, req.copies, req.delivery_method, _region(req)
    )


def _validate_for_submit(db: Session, req: Request) -> None:
    doc = req.document_type
    errors = []
    if not (req.purpose or "").strip():
        errors.append({"field": "purpose", "message": "Please tell us the purpose of this request."})
    if req.copies > doc.max_copies:
        errors.append({"field": "copies", "message": f"You can request up to {doc.max_copies} copies."})
    if req.delivery_method == DeliveryMethod.courier:
        if not doc.allow_courier:
            errors.append({"field": "delivery_method", "message": "This document is for pick-up only."})
        elif not req.delivery_address:
            errors.append({"field": "delivery_address", "message": "Please enter a delivery address."})
    present = {a.requirement_key for a in req.attachments if a.kind == AttachmentKind.requirement and a.deleted_at is None}
    for att in doc.required_attachments:
        if att.get("required", True) and att["key"] not in present:
            errors.append({"field": f"attachments.{att['key']}", "message": f"Please upload: {att['label']}."})
    try:
        req.form_data = clean_form_data(doc.required_fields, req.form_data or {}, strict=True)
    except AppError as exc:
        errors.extend(exc.details)
    if errors:
        raise AppError("VALIDATION_ERROR", "Your request is missing some information.", 422, errors)


def _payment_out(p: Payment, is_student: bool) -> PaymentOut:
    return PaymentOut(
        id=p.id, amount=p.amount, method=p.method, payer_reference=p.payer_reference, paid_at=p.paid_at,
        status=p.status, remarks=p.remarks, verified_at=p.verified_at,
        verified_by_name=None if is_student or p.verified_by is None else p.verified_by.display_name,
        proof=p.proof, created_at=p.created_at,
    )


def _e_documents(req: Request, is_student: bool) -> list[IssuedDocumentOut]:
    """Students see the current e-copy once the document is released; staff see every copy ever issued."""
    docs = [d for d in req.issued_documents if d.kind == IssuedKind.e_document]
    if is_student:
        docs = [d for d in docs if d.revoked_at is None] if req.status in RELEASED else []
    return [
        IssuedDocumentOut(
            id=d.id, kind=d.kind, code=display_code(d.code), verify_url=verify_url(d.code), issued_at=d.issued_at,
            revoked_at=d.revoked_at, revoke_reason=d.revoke_reason,
            filename=None if is_student or d.attachment is None else d.attachment.original_filename,
        )
        for d in docs
    ]


def _detail(req: Request, user: User) -> RequestDetail:
    is_student = user.role == Role.student
    history = []
    for h in req.history:
        if is_student and h.is_internal:
            continue
        if h.actor_id == user.id:
            actor = "You"
        elif h.actor and h.actor.role == Role.student:
            actor = h.actor.display_name
        else:
            actor = "Registrar's Office" if is_student else (h.actor.display_name if h.actor else "System")
        history.append(HistoryOut(id=h.id, from_status=h.from_status, to_status=h.to_status, actor_name=actor,
                                  remarks=h.remarks, is_internal=h.is_internal, created_at=h.created_at))
    actions = [ACTION_NAMES[t] for t in allowed_transitions(req, user) if t in ACTION_NAMES]
    if req.status in EDITABLE and is_student:
        actions.append("edit")
    if req.status == S.draft and is_student:
        actions.append("delete")
    if is_student and can_submit_payment(req):
        actions.append("pay")
    if req.status == S.ready_for_pickup and req.delivery_method == DeliveryMethod.pickup:
        actions.append("pickup_slip")
        if is_student:
            actions.append("book_pickup")
    latest = next((h.remarks for h in reversed(req.history) if h.remarks and not h.is_internal), None)
    base = RequestListItem.model_validate(req).model_dump()
    return RequestDetail(
        **base,
        form_data=req.form_data or {},
        delivery_address=req.delivery_address,
        fee_breakdown=req.fee_breakdown or [],
        completed_at=req.completed_at,
        # The clean release file never reaches students; they get the stamped copy via /issued/{id}.
        attachments=[a for a in req.attachments if a.deleted_at is None
                     and not (is_student and a.kind == AttachmentKind.release_document)],
        payments=[_payment_out(p, is_student) for p in req.payments],
        e_documents=_e_documents(req, is_student),
        pickup_appointment=appointment_out(req.pickup_appointment),
        history=history,
        allowed_actions=actions,
        latest_remarks=latest,
        document_type_full=req.document_type,
    )


def _apply_changes(db: Session, req: Request, changes: dict) -> None:
    doc = req.document_type
    if "form_data" in changes and changes["form_data"] is not None:
        req.form_data = clean_form_data(doc.required_fields, changes["form_data"], strict=False)
    if changes.get("purpose") is not None:
        req.purpose = changes["purpose"].strip()
    if changes.get("copies") is not None:
        req.copies = changes["copies"]
    if changes.get("delivery_method") is not None:
        req.delivery_method = DeliveryMethod(changes["delivery_method"])
    if "delivery_address" in changes:
        req.delivery_address = changes["delivery_address"]
    if req.delivery_method == DeliveryMethod.pickup:
        req.delivery_address = None
    _refresh_fees(db, req)


# ---------- endpoints ----------

@router.post("/requests/quote", response_model=QuoteOut, dependencies=[Depends(require_consent)])
def quote(body: QuoteIn, db: Session = Depends(get_db)):
    doc = _active_doc_type(db, body.document_type_id)
    snap = make_snapshot(doc)
    lines, total = compute_fees(db, snap, body.copies, body.delivery_method, body.region)
    return QuoteOut(
        fee_breakdown=lines,
        fee_total=total,
        requires_payment=doc.requires_payment and total > 0,
        estimated_release_date=estimate_release_date(db, manila_date(utcnow()), doc.processing_days),
    )


@router.get("/requests", response_model=Page[RequestListItem])
def list_my_requests(
    status_: list[RequestStatus] = Query(default=[], alias="status"),
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    base = select(Request).join(DocumentType).where(Request.student_id == user.student.id)
    if status_:
        base = base.where(Request.status.in_(status_))
    if q:
        like = f"%{q.strip()}%"
        base = base.where(or_(Request.reference_no.ilike(like), DocumentType.name.ilike(like)))
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.execute(
        base.options(selectinload(Request.document_type))
        .order_by(Request.updated_at.desc(), Request.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars().all()
    return Page(items=rows, total=total, page=page, page_size=page_size)


@router.post("/requests", response_model=RequestDetail, status_code=status.HTTP_201_CREATED)
def create_draft(body: RequestCreate, http: HttpRequest, user: User = Depends(require_student), db: Session = Depends(get_db)):
    doc = _active_doc_type(db, body.document_type_id)
    req = Request(
        reference_no=next_reference_no(db),
        student_id=user.student.id,
        document_type_id=doc.id,
        doc_type_snapshot=make_snapshot(doc),
        purpose=body.purpose.strip(),
        copies=body.copies,
        delivery_method=body.delivery_method,
        status=S.draft,
    )
    req.document_type = doc
    req.attachments, req.history, req.payments, req.issued_documents = [], [], [], []
    _apply_changes(db, req, body.model_dump(mode="json", exclude={"document_type_id"}))
    db.add(req)
    db.flush()
    audit(db, "request_created", actor=user, entity_type="request", entity_id=req.reference_no, http=http)
    db.commit()
    return _detail(req, user)


@router.get("/requests/{ref}", response_model=RequestDetail)
def get_request(ref: str, http: HttpRequest, user: User = Depends(require_consent), db: Session = Depends(get_db)):
    if user.role == Role.student and user.student is None:
        raise NotFound("Request not found.")
    req = _load(db, ref, user)
    if user.role != Role.student:
        audit(db, "request_viewed", actor=user, entity_type="request", entity_id=ref, http=http)
        db.commit()
    return _detail(req, user)


@router.patch("/requests/{ref}", response_model=RequestDetail)
def update_request(ref: str, body: RequestUpdate, user: User = Depends(require_student), db: Session = Depends(get_db)):
    req = _load(db, ref, user)
    if req.status not in EDITABLE:
        raise AppError("REQUEST_NOT_EDITABLE", "This request can no longer be edited.", 409)
    if req.status == S.draft:
        # Drafts follow the catalog's current fees; submitted requests keep their snapshot.
        req.doc_type_snapshot = make_snapshot(req.document_type)
    _apply_changes(db, req, body.model_dump(mode="json", exclude_unset=True))
    db.commit()
    return _detail(req, user)


@router.delete("/requests/{ref}", status_code=status.HTTP_204_NO_CONTENT)
def delete_draft(ref: str, user: User = Depends(require_student), db: Session = Depends(get_db)):
    req = _load(db, ref, user)
    if req.status != S.draft:
        raise AppError("REQUEST_NOT_EDITABLE", "Only drafts can be deleted. Cancel the request instead.", 409)
    storage = get_storage()
    for att in req.attachments:
        storage.delete(att.storage_key)
    db.delete(req)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/requests/{ref}/submit", response_model=RequestDetail)
def submit(ref: str, http: HttpRequest, tasks: BackgroundTasks, user: User = Depends(require_student), db: Session = Depends(get_db)):
    req = _load(db, ref, user)
    if req.status == S.draft:
        if not req.document_type.is_active:
            raise AppError("DOCUMENT_UNAVAILABLE", "This document type is no longer offered.", 409)
        req.doc_type_snapshot = make_snapshot(req.document_type)
    _validate_for_submit(db, req)
    _refresh_fees(db, req)
    transition(db, req, S.submitted, user)
    audit(db, "request_submitted", actor=user, entity_type="request", entity_id=ref, http=http)
    db.commit()
    dispatch_outbox(db, tasks)
    return _detail(req, user)


@router.post("/requests/{ref}/resubmit", response_model=RequestDetail)
def resubmit(ref: str, body: RemarksIn, http: HttpRequest, tasks: BackgroundTasks, user: User = Depends(require_student), db: Session = Depends(get_db)):
    req = _load(db, ref, user)
    _validate_for_submit(db, req)
    _refresh_fees(db, req)
    transition(db, req, S.resubmitted, user, body.remarks)
    audit(db, "request_resubmitted", actor=user, entity_type="request", entity_id=ref, http=http)
    db.commit()
    dispatch_outbox(db, tasks)
    return _detail(req, user)


@router.post("/requests/{ref}/cancel", response_model=RequestDetail)
def cancel(ref: str, body: RemarksIn, http: HttpRequest, user: User = Depends(require_student), db: Session = Depends(get_db)):
    req = _load(db, ref, user)
    transition(db, req, S.cancelled, user, body.remarks)
    audit(db, "request_cancelled", actor=user, entity_type="request", entity_id=ref, http=http)
    db.commit()
    return _detail(req, user)


@router.post("/requests/{ref}/attachments", response_model=RequestDetail, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    ref: str,
    http: HttpRequest,
    requirement_key: str = Form(max_length=60),
    file: UploadFile = File(...),
    user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    req = _load(db, ref, user)
    if req.status not in EDITABLE:
        raise AppError("REQUEST_NOT_EDITABLE", "Files can only be changed while the request is a draft or needs correction.", 409)
    spec = next((a for a in req.document_type.required_attachments if a["key"] == requirement_key), None)
    if spec is None:
        raise AppError("VALIDATION_ERROR", "Unknown requirement.", 422, [{"field": "requirement_key", "message": "Unknown requirement."}])
    data = await file.read()
    _, mime = validate_upload(file.filename or "", data, spec.get("accept"), spec.get("max_mb"))
    now = utcnow()
    for old in req.attachments:  # one active file per requirement: newest replaces older
        if old.requirement_key == requirement_key and old.kind == AttachmentKind.requirement and old.deleted_at is None:
            old.deleted_at = now
    att = RequestAttachment(
        request_id=req.id,
        kind=AttachmentKind.requirement,
        requirement_key=requirement_key,
        original_filename=safe_filename(file.filename or "file"),
        storage_key=get_storage().put(data),
        mime_type=mime,
        size_bytes=len(data),
        sha256=sha256(data),
        uploaded_by_id=user.id,
        created_at=now,
    )
    db.add(att)
    req.attachments.append(att)
    audit(db, "attachment_uploaded", actor=user, entity_type="request", entity_id=ref, http=http,
          meta={"requirement_key": requirement_key, "size": len(data)})
    db.commit()
    return _detail(req, user)


@router.delete("/requests/{ref}/attachments/{attachment_id}", response_model=RequestDetail)
def delete_attachment(ref: str, attachment_id: int, user: User = Depends(require_student), db: Session = Depends(get_db)):
    req = _load(db, ref, user)
    if req.status not in EDITABLE:
        raise AppError("REQUEST_NOT_EDITABLE", "Files can only be changed while the request is a draft or needs correction.", 409)
    att = next((a for a in req.attachments if a.id == attachment_id and a.deleted_at is None), None)
    if att is None or att.kind != AttachmentKind.requirement:
        raise NotFound("File not found.")
    att.deleted_at = utcnow()
    db.commit()
    return _detail(req, user)


@router.post("/requests/{ref}/payments", response_model=RequestDetail, status_code=status.HTTP_201_CREATED)
async def upload_payment(
    ref: str,
    http: HttpRequest,
    method: PaymentMethod = Form(),
    payer_reference: str = Form(max_length=100),
    paid_on: date = Form(),
    file: UploadFile = File(...),
    user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    req = _load(db, ref, user)
    data = await file.read()
    payment = submit_payment(db, req, user, method=method, payer_reference=payer_reference, paid_on=paid_on,
                             filename=file.filename or "", data=data)
    audit(db, "payment_submitted", actor=user, entity_type="request", entity_id=ref, http=http,
          meta={"method": method.value, "amount": str(payment.amount)})
    db.commit()
    return _detail(req, user)


@router.get("/attachments/{attachment_id}/download")
def download_attachment(attachment_id: int, http: HttpRequest, user: User = Depends(require_consent), db: Session = Depends(get_db)):
    att = db.get(RequestAttachment, attachment_id)
    if att is None or att.deleted_at is not None:
        raise NotFound("File not found.")
    req = att.request
    if user.role == Role.student and (
        user.student is None or req.student_id != user.student.id or att.kind == AttachmentKind.release_document
    ):
        raise NotFound("File not found.")
    data = get_storage().get(att.storage_key)
    audit(db, "attachment_downloaded", actor=user, entity_type="attachment", entity_id=att.id, http=http,
          meta={"request": req.reference_no})
    db.commit()
    return Response(
        content=data,
        media_type=att.mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{att.original_filename}"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
