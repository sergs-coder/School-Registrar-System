"""Pick-up slips, e-documents and public QR verification."""
from fastapi import APIRouter, BackgroundTasks, Depends, File, Request as HttpRequest, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.requests import _load
from app.api.v1.staff import _load_staff, _staff_detail
from app.core.deps import RateLimiter, require_consent, require_staff
from app.core.errors import AppError, NotFound
from app.core.security import utcnow
from app.core.storage import get_storage
from app.db.session import get_db
from app.models import (
    AttachmentKind,
    DeliveryMethod,
    IssuedDocument,
    IssuedKind,
    RequestAttachment,
    RequestStatus,
    ReviewStatus,
    Role,
    User,
)
from app.schemas.requests import VerifyOut
from app.schemas.staff import RevokeIn, StaffRequestDetail
from app.services import documents
from app.services.app_settings import get_setting
from app.services.audit import audit
from app.services.notifications import dispatch_outbox, notify_student
from app.services.uploads import safe_filename, sha256, validate_upload

router = APIRouter(tags=["documents"])
S = RequestStatus
verify_limiter = RateLimiter(limit=30, window_seconds=300)


def _pdf(data: bytes, filename: str) -> Response:
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


# ---------- pick-up slip ----------

@router.get("/requests/{ref}/pickup-slip")
def pickup_slip(ref: str, http: HttpRequest, user: User = Depends(require_consent), db: Session = Depends(get_db)):
    if user.role == Role.student and user.student is None:
        raise NotFound("Request not found.")
    req = _load(db, ref, user)
    if req.status != S.ready_for_pickup or req.delivery_method != DeliveryMethod.pickup:
        raise AppError("SLIP_NOT_AVAILABLE", "A pick-up slip is available once the document is ready for pick-up.", 409)
    slip = documents.active(req, IssuedKind.pickup_slip)
    if slip is None:  # one slip per request; downloading again reprints the same code
        slip = documents.issue(db, req, IssuedKind.pickup_slip, user)
        db.flush()
    ready_at = next((h.created_at for h in reversed(req.history)
                     if h.to_status == S.ready_for_pickup and h.from_status != S.ready_for_pickup), None)
    data = documents.pickup_slip_pdf(req, slip, get_setting(db, "registrar_contact") or {}, ready_at)
    audit(db, "pickup_slip_downloaded", actor=user, entity_type="request", entity_id=ref, http=http)
    db.commit()
    return _pdf(data, f"pickup-slip-{ref}.pdf")


# ---------- e-documents ----------

@router.post("/staff/requests/{ref}/e-document", response_model=StaffRequestDetail, status_code=status.HTTP_201_CREATED)
async def upload_e_document(
    ref: str,
    http: HttpRequest,
    tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    req = _load_staff(db, ref, user)
    if not req.document_type.allow_edocument:
        raise AppError("EDOC_NOT_ALLOWED", "This document type isn’t issued as an e-document.", 409)
    if req.status not in documents.EDOC_UPLOAD_STATUSES:
        raise AppError("EDOC_NOT_ALLOWED", "Attach the e-document once the request is being processed.", 409)
    data = await file.read()
    validate_upload(file.filename or "", data, ["pdf"], None)
    documents.check_release_pdf(data)

    now = utcnow()
    previous = documents.active(req, IssuedKind.e_document)
    if previous:
        documents.revoke(previous, "Replaced by a newer copy.")
    att = RequestAttachment(
        request_id=req.id, kind=AttachmentKind.release_document, original_filename=safe_filename(file.filename or "document.pdf"),
        storage_key=get_storage().put(data), mime_type="application/pdf", size_bytes=len(data), sha256=sha256(data),
        review_status=ReviewStatus.accepted, uploaded_by_id=user.id, created_at=now,
    )
    db.add(att)
    req.attachments.append(att)
    db.flush()
    doc = documents.issue(db, req, IssuedKind.e_document, user, attachment_id=att.id)
    doc.attachment = att
    if req.status in documents.RELEASED:
        notify_student(db, req, "e_document", "E-document available",
                       "An electronic copy of your document is ready. Download it from your request page.",
                       email=True, at=now)
    audit(db, "e_document_issued", actor=user, entity_type="request", entity_id=ref, http=http,
          meta={"replaced": previous.id if previous else None})
    db.commit()
    dispatch_outbox(db, tasks)
    return _staff_detail(req, user)


@router.post("/staff/requests/{ref}/e-documents/{doc_id}/revoke", response_model=StaffRequestDetail)
def revoke_e_document(
    ref: str, doc_id: int, body: RevokeIn, http: HttpRequest, user: User = Depends(require_staff), db: Session = Depends(get_db)
):
    req = _load_staff(db, ref, user)
    doc = next((d for d in req.issued_documents if d.id == doc_id and d.kind == IssuedKind.e_document), None)
    if doc is None:
        raise NotFound("E-document not found.")
    if doc.revoked_at is not None:
        raise AppError("ALREADY_REVOKED", "This e-document was already revoked.", 409)
    documents.revoke(doc, body.reason.strip())
    audit(db, "e_document_revoked", actor=user, entity_type="request", entity_id=ref, http=http,
          meta={"issued_id": doc.id, "reason": doc.revoke_reason})
    db.commit()
    return _staff_detail(req, user)


@router.get("/issued/{doc_id}/download")
def download_e_document(doc_id: int, http: HttpRequest, user: User = Depends(require_consent), db: Session = Depends(get_db)):
    doc = db.get(IssuedDocument, doc_id)
    if doc is None or doc.kind != IssuedKind.e_document or doc.attachment is None:
        raise NotFound("File not found.")
    req = doc.request
    if user.role == Role.student:
        # Same 404 for "not yours", "not released yet" and "revoked": nothing to learn by probing ids.
        if user.student is None or req.student_id != user.student.id or req.status not in documents.RELEASED \
                or doc.revoked_at is not None:
            raise NotFound("File not found.")
    elif req.status == S.draft:
        raise NotFound("File not found.")
    data = documents.watermark_pdf(get_storage().get(doc.attachment.storage_key), req, doc)
    audit(db, "e_document_downloaded", actor=user, entity_type="issued_document", entity_id=doc.id, http=http,
          meta={"request": req.reference_no})
    db.commit()
    return _pdf(data, f"{req.document_type.code}-{req.reference_no}.pdf")


# ---------- public verification ----------

def _mask_student_no(no: str) -> str:
    keep = no[:6] if "-" in no[:5] else no[:4]
    return keep + "•" * max(len(no) - len(keep), 0)


@router.get("/verify/{code}", response_model=VerifyOut, dependencies=[Depends(verify_limiter)])
def verify(code: str, http: HttpRequest, db: Session = Depends(get_db)):
    """No login: employers and schools scan the QR. Answers only what the document already shows."""
    normalized = documents.normalize_code(code)
    doc = db.execute(select(IssuedDocument).where(IssuedDocument.code == normalized)).scalar_one_or_none() \
        if len(normalized) == 16 else None
    if doc is None:
        raise NotFound("No document matches this code. Check that it was typed exactly as printed.")
    req = doc.request

    if doc.revoked_at is not None:
        state, message = "revoked", "This copy was withdrawn by the Registrar’s Office and is no longer valid."
    elif doc.kind == IssuedKind.e_document:
        if req.status in documents.RELEASED:
            state, message = "valid", "This is an authentic e-document issued by the Registrar’s Office."
        else:
            state, message = "not_claimable", "This e-document hasn’t been released."
    elif req.status == S.ready_for_pickup:
        state, message = "valid", "Valid pick-up slip. The document is ready to be claimed."
    elif req.status == S.completed:
        state, message = "claimed", "This document was already released. The slip can’t be used again."
    else:
        state, message = "not_claimable", "This pick-up slip is no longer valid."

    audit(db, "document_verified", entity_type="issued_document", entity_id=doc.id, http=http,
          meta={"state": state})
    db.commit()
    student = req.student
    return VerifyOut(
        state=state, message=message, kind=doc.kind, code=documents.display_code(doc.code),
        reference_no=req.reference_no, document_name=req.document_type.name, holder_name=student.full_name,
        student_no_masked=_mask_student_no(student.student_no), copies=req.copies, issued_at=doc.issued_at,
        revoked_at=doc.revoked_at,
    )
