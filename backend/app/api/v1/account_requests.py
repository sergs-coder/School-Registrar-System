"""Request access: a public form for anyone without an account (new or current students, alumni and former
students), reviewed by Registrar staff.

Approving links the request to the student record with the same student number (or creates one when there
is none), and emails a one-time set-password link to the address on the request. That address becomes the
student's verified personal email, so they can sign in and reset their password with it from then on.
"""
from datetime import date, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, Request as HttpRequest, Response, UploadFile
from pydantic import ValidationError
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import account_request_limiter, require_staff
from app.core.errors import AppError, NotFound
from app.core.security import hash_password, hash_token, new_opaque_token, utcnow
from app.core.storage import get_storage
from app.db.session import get_db
from app.models import AccountRequest, AccountRequestStatus, PasswordResetToken, Program, Role, Student, User
from app.schemas.accounts import AccountRequestIn, AccountRequestOut, RecordMatch, RejectIn
from app.schemas.common import Message
from app.services.audit import audit
from app.services.business_days import business_days_between, closed_dates, manila_date
from app.services.email import send_email
from app.services.uploads import safe_filename, validate_upload

router = APIRouter(tags=["access requests"])
SETUP_LINK_HOURS = 72
URGENT_AFTER_DAYS = 2  # the form tells people "usually within two working days"
SIGN_OFF = "\n\n— Office of the University Registrar, Trinity University of Asia"


# ---------- public ----------

@router.post("/account-requests", response_model=Message, status_code=201,
             dependencies=[Depends(account_request_limiter)])
async def create_account_request(
    http: HttpRequest,
    student_no: str = Form(max_length=20),
    first_name: str = Form(max_length=100),
    middle_name: str | None = Form(default=None, max_length=100),
    last_name: str = Form(max_length=100),
    birthdate: str = Form(max_length=10),
    email: str = Form(max_length=255),
    contact_no: str | None = Form(default=None, max_length=20),
    program: str = Form(max_length=200),
    last_year_attended: str = Form(max_length=4),
    standing: str = Form(max_length=20),
    id_file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    try:
        body = AccountRequestIn(
            student_no=student_no, first_name=first_name, middle_name=middle_name or None, last_name=last_name,
            birthdate=birthdate, email=email, contact_no=contact_no or None, program=program,
            last_year_attended=last_year_attended, standing=standing,
        )
    except ValidationError as exc:
        details = [{"field": ".".join(str(p) for p in e["loc"]),
                    "message": "Choose one of the options." if e["loc"] == ("standing",)
                    else e["msg"].removeprefix("Value error, ")}
                   for e in exc.errors()]
        raise AppError("VALIDATION_ERROR", "Some fields are invalid.", 422, details) from None
    data = await id_file.read()
    _, mime = validate_upload(id_file.filename or "", data, ["jpg", "png", "pdf"], None)
    req = AccountRequest(
        **body.model_dump(), id_filename=safe_filename(id_file.filename or "id"),
        id_storage_key=get_storage().put(data), id_mime_type=mime,
    )
    req.email = req.email.lower()
    db.add(req)
    db.flush()
    audit(db, "account_request_submitted", actor=None, entity_type="account_request", entity_id=req.id, http=http,
          meta={"student_no": req.student_no})
    db.commit()
    return Message(message=f"Thank you! The Registrar's Office will check your details, usually within two working "
                           f"days, and email {req.email} when your access is ready.")


# ---------- staff review ----------

def _record(db: Session, req: AccountRequest) -> Student | None:
    return db.execute(select(Student).where(Student.student_no == req.student_no)).scalar_one_or_none()


def _email_owner(db: Session, email: str) -> User | None:
    """The account already using this address to sign in (login email or verified personal email)."""
    return db.execute(
        select(User).outerjoin(Student, Student.user_id == User.id).where(or_(
            func.lower(User.email) == email.lower(),
            (func.lower(Student.personal_email) == email.lower()) & Student.personal_email_verified_at.is_not(None),
        ))
    ).scalars().first()


def waiting(req: AccountRequest, today: date, closed: set[date]) -> tuple[int, bool]:
    """Working days the request has waited, and whether it's urgent: still pending past the two working days
    the form promises."""
    days = business_days_between(manila_date(req.created_at), today, closed)
    return days, req.status == AccountRequestStatus.pending and days >= URGENT_AFTER_DAYS


def _out(db: Session, req: AccountRequest, setup_link: str | None = None,
         closed: set[date] | None = None) -> AccountRequestOut:
    st = _record(db, req)
    if closed is None:
        closed = closed_dates(db, manila_date(req.created_at))
    waiting_days, urgent = waiting(req, manila_date(utcnow()), closed)
    record = None
    if st:
        same = lambda a, b: (a or "").strip().lower() == (b or "").strip().lower()  # noqa: E731
        record = RecordMatch(
            full_name=st.full_name, birthdate=st.birthdate, standing=st.standing, login_email=st.user.email,
            name_matches=same(st.first_name, req.first_name) and same(st.last_name, req.last_name),
            birthdate_matches=st.birthdate == req.birthdate,
        )
    owner = _email_owner(db, req.email)
    return AccountRequestOut(
        **{k: getattr(req, k) for k in AccountRequestOut.model_fields
           if k not in ("record", "email_in_use", "reviewed_by_name", "setup_link", "waiting_days", "urgent")},
        waiting_days=waiting_days,
        urgent=urgent,
        reviewed_by_name=req.reviewed_by.display_name if req.reviewed_by else None,
        record=record,
        email_in_use=owner is not None and (st is None or owner.id != st.user_id),
        setup_link=setup_link if settings.environment == "development" else None,
    )


def _pending(db: Session, request_id: int) -> AccountRequest:
    req = db.get(AccountRequest, request_id)
    if req is None:
        raise NotFound("Request not found.")
    if req.status != AccountRequestStatus.pending:
        raise AppError("ALREADY_REVIEWED", "This request was already reviewed.", 409)
    return req


@router.get("/staff/account-requests", response_model=list[AccountRequestOut])
def list_account_requests(
    status: AccountRequestStatus = Query(default=AccountRequestStatus.pending),
    _: User = Depends(require_staff), db: Session = Depends(get_db),
):
    # Pending: oldest first, so the longest wait is reviewed first.
    order = AccountRequest.created_at.asc() if status == AccountRequestStatus.pending else AccountRequest.reviewed_at.desc()
    rows = db.execute(select(AccountRequest).where(AccountRequest.status == status).order_by(order).limit(200)).scalars().all()
    closed = closed_dates(db, min((manila_date(r.created_at) for r in rows), default=manila_date(utcnow())))
    return [_out(db, r, closed=closed) for r in rows]


@router.get("/staff/account-requests/{request_id}/id-file")
def account_request_id_file(request_id: int, http: HttpRequest, user: User = Depends(require_staff),
                            db: Session = Depends(get_db)):
    req = db.get(AccountRequest, request_id)
    if req is None:
        raise NotFound("Request not found.")
    data = get_storage().get(req.id_storage_key)
    audit(db, "account_request_id_viewed", actor=user, entity_type="account_request", entity_id=req.id, http=http)
    db.commit()
    return Response(content=data, media_type=req.id_mime_type, headers={
        "Content-Disposition": f'inline; filename="{req.id_filename}"',
        "Cache-Control": "private, no-store",
    })


@router.post("/staff/account-requests/{request_id}/approve", response_model=AccountRequestOut)
def approve_account_request(request_id: int, http: HttpRequest, tasks: BackgroundTasks,
                            user: User = Depends(require_staff), db: Session = Depends(get_db)):
    req = _pending(db, request_id)
    student = _record(db, req)
    owner = _email_owner(db, req.email)
    if owner is not None and (student is None or owner.id != student.user_id):
        raise AppError("EMAIL_IN_USE", f"{req.email} already belongs to another account. Reject this request and "
                                       "ask them to sign in with that account, or to use a different email.", 409)
    if student is not None and not student.user.is_active:
        raise AppError("ACCOUNT_DISABLED", "This student's account is deactivated. Ask an admin to reactivate it "
                                           "on the Users page first.", 409)
    now = utcnow()
    if student is None:
        program = db.execute(select(Program).where(or_(
            func.lower(Program.code) == req.program.lower(), func.lower(Program.name) == req.program.lower(),
        ))).scalars().first()
        account = User(email=req.email, student_no=req.student_no, role=Role.student,
                       password_hash=hash_password(new_opaque_token()))
        account.student = Student(
            student_no=req.student_no, first_name=req.first_name, middle_name=req.middle_name,
            last_name=req.last_name, birthdate=req.birthdate, contact_no=req.contact_no,
            program_id=program.id if program else None, standing=req.standing,
        )
        db.add(account)
        db.flush()
        created = True
    else:
        account = student.user
        if req.email != account.email.lower():
            student.personal_email = req.email
            student.personal_email_verified_at = now  # proven by the set-password link below
            student.personal_email_token_hash = None
            student.personal_email_token_expires_at = None
        created = False

    raw = new_opaque_token()
    db.add(PasswordResetToken(user_id=account.id, token_hash=hash_token(raw),
                              expires_at=now + timedelta(hours=SETUP_LINK_HOURS), created_at=now))
    link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={raw}"
    req.status, req.reviewed_by_id, req.reviewed_at, req.user_id = AccountRequestStatus.approved, user.id, now, account.id
    audit(db, "account_request_approved", actor=user, entity_type="account_request", entity_id=req.id, http=http,
          meta={"student_no": req.student_no, "created_account": created})
    db.commit()
    tasks.add_task(
        send_email, req.email, "Your TUA Student Request Portal access is ready",
        f"Hello {req.first_name},\n\nThe Registrar's Office confirmed your details. Use this link to choose your "
        f"password. It expires in {SETUP_LINK_HOURS} hours:\n\n{link}\n\nAfterwards, sign in with your student "
        f"number ({req.student_no}) or this email address, and request your documents online.{SIGN_OFF}",
    )
    return _out(db, req, setup_link=link)


@router.post("/staff/account-requests/{request_id}/reject", response_model=AccountRequestOut)
def reject_account_request(request_id: int, body: RejectIn, http: HttpRequest, tasks: BackgroundTasks,
                           user: User = Depends(require_staff), db: Session = Depends(get_db)):
    req = _pending(db, request_id)
    req.status, req.remarks = AccountRequestStatus.rejected, body.remarks.strip()
    req.reviewed_by_id, req.reviewed_at = user.id, utcnow()
    audit(db, "account_request_rejected", actor=user, entity_type="account_request", entity_id=req.id, http=http)
    db.commit()
    tasks.add_task(
        send_email, req.email, "About your TUA Student Request Portal access request",
        f"Hello {req.first_name},\n\nWe couldn't confirm your access request yet. {req.remarks}\n\nYou can send a "
        f"new request with the corrected details, or contact the Registrar's Office.{SIGN_OFF}",
    )
    return _out(db, req)
