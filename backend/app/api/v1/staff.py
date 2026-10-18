from datetime import date, datetime, time, timedelta
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request as HttpRequest
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.v1.requests import _detail, _load
from app.core.deps import require_staff
from app.core.errors import AppError, NotFound
from app.core.security import utcnow
from app.db.session import get_db
from app.models import (
    TERMINAL_STATUSES,
    DocumentType,
    Payment,
    PaymentStatus,
    Program,
    Request,
    RequestAttachment,
    RequestStatus,
    RequestStatusHistory,
    Staff,
    Student,
    User,
)
from app.schemas.common import Page
from app.schemas.staff import (
    AssignIn,
    AttachmentReviewIn,
    BulkResult,
    BulkTransitionIn,
    Dashboard,
    DayCount,
    NoteIn,
    PaymentRejectIn,
    PeriodCount,
    QueueItem,
    StaffBrief,
    StaffRequestDetail,
    StatusCount,
    StudentBrief,
    TransitionIn,
    TransitionOption,
)
from app.services.audit import audit
from app.services.business_days import MANILA, manila_date
from app.services.documents import EDOC_UPLOAD_STATUSES
from app.services.notifications import dispatch_outbox
from app.services.payments import pending_payment, reject_payment
from app.services.workflow import REMARKS_REQUIRED, allowed_transitions, approval_target, transition

router = APIRouter(prefix="/staff", tags=["staff"])
S = RequestStatus
OPEN = [s for s in RequestStatus if s not in TERMINAL_STATUSES and s != S.draft]
# Overdue only counts while the Registrar holds the ball: not while waiting on the student
# (correction, payment) or after the document has been handed over (pick-up, courier).
OVERDUE_STATUSES = [S.submitted, S.under_review, S.resubmitted, S.payment_verified, S.processing]

SORTS = {
    "submitted_at": Request.submitted_at,
    "estimated_release_date": Request.estimated_release_date,
    "reference_no": Request.reference_no,
    "status": Request.status,
    "student": Student.last_name,
    "document": DocumentType.name,
    "updated_at": Request.updated_at,
}


# ---------- serialisation ----------

def _today():
    return manila_date(utcnow())


def _is_overdue(req: Request) -> bool:
    return bool(req.estimated_release_date and req.status in OVERDUE_STATUSES and req.estimated_release_date < _today())


def _student(st: Student) -> StudentBrief:
    return StudentBrief(
        id=st.id, full_name=st.full_name, student_no=st.student_no, email=st.user.email, program=st.program,
        year_level=st.year_level, contact_no=st.contact_no, standing=st.standing,
    )


def _staff(s: Staff | None) -> StaffBrief | None:
    return StaffBrief.model_validate(s) if s else None


def _item(req: Request) -> QueueItem:
    return QueueItem(
        id=req.id, reference_no=req.reference_no, status=req.status, document_type=req.document_type,
        student=_student(req.student), copies=req.copies, delivery_method=req.delivery_method.value,
        fee_total=str(req.fee_total), submitted_at=req.submitted_at, estimated_release_date=req.estimated_release_date,
        updated_at=req.updated_at, is_overdue=_is_overdue(req), assigned_to=_staff(req.assigned_to),
        payment_pending=req.status == S.awaiting_payment and pending_payment(req) is not None,
    )


def _staff_detail(req: Request, user: User) -> StaffRequestDetail:
    base = _detail(req, user).model_dump()
    return StaffRequestDetail(
        **base,
        student=_student(req.student),
        assigned_to=_staff(req.assigned_to),
        is_overdue=_is_overdue(req),
        version=req.version,
        transitions=[
            TransitionOption(to_status=t, requires_remarks=t in REMARKS_REQUIRED) for t in allowed_transitions(req, user)
        ],
        can_upload_edocument=req.document_type.allow_edocument and req.status in EDOC_UPLOAD_STATUSES,
    )


def _queue_query() -> Select:
    return (
        select(Request)
        .join(Student, Request.student_id == Student.id)
        .join(User, Student.user_id == User.id)
        .join(DocumentType, Request.document_type_id == DocumentType.id)
        .outerjoin(Program, Student.program_id == Program.id)
        .where(Request.status != S.draft)  # drafts are private to the student
        .options(
            selectinload(Request.student).selectinload(Student.program),
            selectinload(Request.student).selectinload(Student.user),
            selectinload(Request.document_type),
            selectinload(Request.assigned_to),
            selectinload(Request.payments),
        )
    )


# Awaiting payment with an uploaded proof that nobody has checked yet.
PAYMENT_TO_VERIFY = (Request.status == S.awaiting_payment) & Request.payments.any(Payment.status == PaymentStatus.pending)


def _manila_start(d) -> datetime:
    return datetime.combine(d, time.min, tzinfo=MANILA)


# ---------- dashboard ----------

@router.get("/dashboard", response_model=Dashboard)
def dashboard(user: User = Depends(require_staff), db: Session = Depends(get_db)):
    today = _today()
    rows = db.execute(
        select(Request.status, func.count()).where(Request.status != S.draft).group_by(Request.status)
    ).all()
    by_status = dict(rows)
    counts = [StatusCount(status=s, count=by_status.get(s, 0)) for s in RequestStatus if s != S.draft]

    overdue_q = _queue_query().where(Request.status.in_(OVERDUE_STATUSES), Request.estimated_release_date < today)
    overdue_total = db.scalar(select(func.count()).select_from(overdue_q.subquery()))
    overdue = db.execute(overdue_q.order_by(Request.estimated_release_date, Request.id).limit(6)).scalars().all()
    pickups = db.execute(
        _queue_query().where(Request.status == S.ready_for_pickup).order_by(Request.updated_at.desc()).limit(8)
    ).scalars().all()

    start = today - timedelta(days=13)
    submitted = db.execute(
        select(Request.submitted_at).where(Request.submitted_at >= _manila_start(start))
    ).scalars().all()
    buckets = {start + timedelta(days=i): 0 for i in range(14)}
    for ts in submitted:
        d = manila_date(ts)
        if d in buckets:
            buckets[d] += 1

    assigned_to_me = 0
    if user.staff:
        assigned_to_me = db.scalar(
            select(func.count()).select_from(Request).where(Request.assigned_to_id == user.staff.id, Request.status.in_(OPEN))
        )
    completed_week = db.scalar(
        select(func.count()).select_from(Request).where(
            Request.status == S.completed, Request.completed_at >= _manila_start(today - timedelta(days=6))
        )
    )
    payments_to_verify = db.scalar(select(func.count()).select_from(Request).where(PAYMENT_TO_VERIFY))
    return Dashboard(
        counts=counts,
        payments_to_verify=payments_to_verify,
        active_total=sum(by_status.get(s, 0) for s in OPEN),
        overdue_total=overdue_total,
        assigned_to_me=assigned_to_me,
        submitted_today=buckets[today],
        completed_this_week=completed_week,
        daily_submissions=[DayCount(date=d, count=c) for d, c in buckets.items()],
        overdue=[_item(r) for r in overdue],
        pickups=[_item(r) for r in pickups],
    )


# ---------- queue ----------

@router.get("/requests", response_model=Page[QueueItem])
def queue(
    q: str | None = Query(default=None, max_length=100),
    status_: list[RequestStatus] = Query(default=[], alias="status"),
    document_type: list[int] = Query(default=[]),
    program: list[str] = Query(default=[]),
    date_from: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    overdue: bool = False,
    assigned: str | None = Query(default=None, pattern="^(me|unassigned)$"),
    payment: str | None = Query(default=None, pattern="^pending$"),
    sort: str = Query(default="-submitted_at"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    from datetime import date as _date

    stmt = _queue_query()
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(
            Request.reference_no.ilike(like),
            Student.student_no.ilike(like),
            Student.first_name.ilike(like),
            Student.last_name.ilike(like),
            (Student.first_name + " " + Student.last_name).ilike(like),
            User.email.ilike(like),
        ))
    if status_:
        stmt = stmt.where(Request.status.in_(status_))
    if document_type:
        stmt = stmt.where(Request.document_type_id.in_(document_type))
    if program:
        stmt = stmt.where(Program.code.in_(program))
    if date_from:
        stmt = stmt.where(Request.submitted_at >= _manila_start(_date.fromisoformat(date_from)))
    if date_to:
        stmt = stmt.where(Request.submitted_at < _manila_start(_date.fromisoformat(date_to) + timedelta(days=1)))
    if overdue:
        stmt = stmt.where(Request.status.in_(OVERDUE_STATUSES), Request.estimated_release_date < _today())
    if assigned == "me":
        stmt = stmt.where(Request.assigned_to_id == (user.staff.id if user.staff else -1))
    elif assigned == "unassigned":
        stmt = stmt.where(Request.assigned_to_id.is_(None))
    if payment == "pending":
        stmt = stmt.where(PAYMENT_TO_VERIFY)

    key = sort.lstrip("-")
    if key not in SORTS:
        raise AppError("VALIDATION_ERROR", "Unknown sort field.", 422, [{"field": "sort", "message": f"Use one of {sorted(SORTS)}."}])
    col = SORTS[key]
    order = [col.desc().nulls_last() if sort.startswith("-") else col.asc().nulls_last(), Request.id.desc()]

    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    rows = db.execute(stmt.order_by(*order).offset((page - 1) * page_size).limit(page_size)).scalars().all()
    return Page(items=[_item(r) for r in rows], total=total, page=page, page_size=page_size)


# ---------- submissions trend ----------

# How many periods each chart granularity shows, ending with the current one.
TREND_PERIODS = {"day": 14, "week": 12, "month": 12, "year": 5}


def _period_start(d: date, granularity: str) -> date:
    if granularity == "week":
        return d - timedelta(days=d.weekday())  # weeks start on Monday
    if granularity == "month":
        return d.replace(day=1)
    if granularity == "year":
        return d.replace(month=1, day=1)
    return d


def _step_back(d: date, granularity: str) -> date:
    """Start of the period just before the one starting on `d`."""
    if granularity == "week":
        return d - timedelta(weeks=1)
    if granularity == "month":
        return (d - timedelta(days=1)).replace(day=1)
    if granularity == "year":
        return d.replace(year=d.year - 1)
    return d - timedelta(days=1)


@router.get("/submissions", response_model=list[PeriodCount])
def submission_trend(
    granularity: Literal["day", "week", "month", "year"] = "day",
    _: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Requests submitted per day, week, month or year (Manila time), oldest first, empty periods included."""
    starts = [_period_start(_today(), granularity)]
    for _i in range(TREND_PERIODS[granularity] - 1):
        starts.append(_step_back(starts[-1], granularity))
    starts.reverse()
    counts = dict.fromkeys(starts, 0)
    submitted = db.execute(
        select(Request.submitted_at).where(Request.submitted_at >= _manila_start(starts[0]))
    ).scalars()
    for ts in submitted:
        key = _period_start(manila_date(ts), granularity)
        if key in counts:
            counts[key] += 1
    return [PeriodCount(start=d, count=c) for d, c in counts.items()]


@router.get("/members", response_model=list[StaffBrief])
def staff_members(_: User = Depends(require_staff), db: Session = Depends(get_db)):
    return db.execute(
        select(Staff).join(User).where(User.is_active.is_(True)).order_by(Staff.first_name)
    ).scalars().all()


# ---------- single request ----------

def _load_staff(db: Session, ref: str, user: User) -> Request:
    req = _load(db, ref, user)
    if req.status == S.draft:
        raise NotFound("Request not found.")
    return req


@router.get("/requests/{ref}", response_model=StaffRequestDetail)
def staff_request_detail(ref: str, http: HttpRequest, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    req = _load_staff(db, ref, user)
    audit(db, "request_viewed", actor=user, entity_type="request", entity_id=ref, http=http)
    db.commit()
    return _staff_detail(req, user)


def _apply_transition(db: Session, req: Request, user: User, target, remarks) -> None:
    to = approval_target(req) if target == "approve" else RequestStatus(target)
    if req.status == to:
        raise AppError("INVALID_TRANSITION", "The request is already in that status.", 409)
    frm = req.status
    transition(db, req, to, user, remarks)
    if to == S.under_review and req.assigned_to_id is None and user.staff:
        req.assigned_to_id = user.staff.id  # whoever starts the review owns it
    audit(db, "request_status_changed", actor=user, entity_type="request", entity_id=req.reference_no,
          meta={"from": frm.value, "to": to.value})


@router.post("/requests/{ref}/transition", response_model=StaffRequestDetail)
def staff_transition(
    ref: str, body: TransitionIn, tasks: BackgroundTasks, user: User = Depends(require_staff), db: Session = Depends(get_db)
):
    req = _load_staff(db, ref, user)
    if body.version is not None and body.version != req.version:
        raise AppError("STALE_REQUEST", "Someone else updated this request a moment ago. Review the latest details and try again.", 409)
    _apply_transition(db, req, user, body.to_status, body.remarks)
    db.commit()
    dispatch_outbox(db, tasks)
    return _staff_detail(req, user)


@router.post("/requests/bulk-transition", response_model=list[BulkResult])
def bulk_transition(
    body: BulkTransitionIn, tasks: BackgroundTasks, user: User = Depends(require_staff), db: Session = Depends(get_db)
):
    results = []
    for ref in dict.fromkeys(body.refs):  # de-duplicate, keep order
        try:
            req = _load_staff(db, ref, user)
            # transition() validates before mutating, so a failure leaves the request untouched.
            _apply_transition(db, req, user, body.to_status, body.remarks)
            results.append(BulkResult(reference_no=ref, ok=True, status=req.status))
        except AppError as exc:
            results.append(BulkResult(reference_no=ref, ok=False, error=exc.message))
    db.commit()
    dispatch_outbox(db, tasks)
    return results


@router.post("/requests/{ref}/payments/{payment_id}/reject", response_model=StaffRequestDetail)
def staff_reject_payment(
    ref: str, payment_id: int, body: PaymentRejectIn, tasks: BackgroundTasks,
    user: User = Depends(require_staff), db: Session = Depends(get_db),
):
    """The request stays Awaiting Payment; the student is told why and can upload a new proof."""
    req = _load_staff(db, ref, user)
    if body.version is not None and body.version != req.version:
        raise AppError("STALE_REQUEST", "Someone else updated this request a moment ago. Review the latest details and try again.", 409)
    reject_payment(db, req, payment_id, user, body.remarks)
    audit(db, "payment_rejected", actor=user, entity_type="request", entity_id=ref, meta={"payment_id": payment_id})
    db.commit()
    dispatch_outbox(db, tasks)
    return _staff_detail(req, user)


@router.post("/requests/{ref}/notes", response_model=StaffRequestDetail)
def add_internal_note(ref: str, body: NoteIn, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    """Staff-only note. Stored in the history with is_internal=True; students never see it."""
    req = _load_staff(db, ref, user)
    entry = RequestStatusHistory(
        request_id=req.id, from_status=req.status, to_status=req.status, actor_id=user.id,
        remarks=body.remarks.strip(), is_internal=True, created_at=utcnow(),
    )
    db.add(entry)
    req.history.append(entry)
    db.commit()
    return _staff_detail(req, user)


@router.post("/requests/{ref}/assign", response_model=StaffRequestDetail)
def assign(ref: str, body: AssignIn, user: User = Depends(require_staff), db: Session = Depends(get_db)):
    req = _load_staff(db, ref, user)
    if body.staff_id is not None:
        member = db.get(Staff, body.staff_id)
        if member is None or not member.user.is_active:
            raise AppError("VALIDATION_ERROR", "Choose an active staff member.", 422,
                           [{"field": "staff_id", "message": "Unknown staff member."}])
    req.assigned_to_id = body.staff_id
    audit(db, "request_assigned", actor=user, entity_type="request", entity_id=ref, meta={"staff_id": body.staff_id})
    db.commit()
    db.refresh(req, ["assigned_to"])
    return _staff_detail(req, user)


@router.patch("/attachments/{attachment_id}", response_model=StaffRequestDetail)
def review_attachment(
    attachment_id: int, body: AttachmentReviewIn, user: User = Depends(require_staff), db: Session = Depends(get_db)
):
    att = db.get(RequestAttachment, attachment_id)
    if att is None or att.deleted_at is not None or att.request.status == S.draft:
        raise NotFound("File not found.")
    att.review_status = body.review_status
    audit(db, "attachment_reviewed", actor=user, entity_type="attachment", entity_id=att.id,
          meta={"review_status": body.review_status.value})
    db.commit()
    return _staff_detail(_load_staff(db, att.request.reference_no, user), user)
