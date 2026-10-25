"""Admin back office: catalog, office settings, holidays, announcements and accounts."""
import secrets
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, Request as HttpRequest, Response, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import case, func, or_, select, update
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.deps import require_admin
from app.core.errors import AppError, NotFound
from app.core.security import hash_password, hash_token, new_opaque_token, utcnow
from app.db.session import get_db
from app.models import (
    Announcement,
    DocumentType,
    Holiday,
    PasswordResetToken,
    RefreshToken,
    Request,
    Role,
    Setting,
    Staff,
    Student,
    User,
)
from app.schemas.admin import (
    AdminDocumentTypeOut,
    AnnouncementIn,
    AnnouncementOut,
    DocumentTypeIn,
    HolidayIn,
    HolidayOut,
    SettingsIO,
    ImportRowOut,
    StaffCreate,
    StudentImportOut,
    UserActionOut,
    UserRow,
    UserUpdate,
)
from app.schemas.common import Page
from app.services import student_import
from app.services.app_settings import get_setting
from app.services.audit import audit
from app.services.email import send_email

router = APIRouter(prefix="/admin", tags=["admin"])
SETUP_LINK_HOURS = 72


def _conflict(field: str, message: str) -> AppError:
    return AppError("CONFLICT", message, 409, [{"field": field, "message": message}])


# ---------- document types ----------

def _doc_out(doc: DocumentType, counts: dict[int, int]) -> AdminDocumentTypeOut:
    return AdminDocumentTypeOut.model_validate(doc).model_copy(update={"request_count": counts.get(doc.id, 0)})


def _request_counts(db: Session) -> dict[int, int]:
    return dict(db.execute(select(Request.document_type_id, func.count()).group_by(Request.document_type_id)).all())


def _check_unique(db: Session, body: DocumentTypeIn, doc_id: int | None = None) -> None:
    for field in ("code", "slug"):
        clash = db.execute(
            select(DocumentType.id).where(getattr(DocumentType, field) == getattr(body, field), DocumentType.id != (doc_id or 0))
        ).first()
        if clash:
            raise _conflict(field, f"Another document type already uses this {field}.")


@router.get("/document-types", response_model=list[AdminDocumentTypeOut])
def list_document_types(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Every document type, including ones hidden from students."""
    counts = _request_counts(db)
    docs = db.execute(select(DocumentType).order_by(DocumentType.sort_order, DocumentType.name)).scalars().all()
    return [_doc_out(d, counts) for d in docs]


@router.post("/document-types", response_model=AdminDocumentTypeOut, status_code=status.HTTP_201_CREATED)
def create_document_type(body: DocumentTypeIn, http: HttpRequest, user: User = Depends(require_admin),
                         db: Session = Depends(get_db)):
    _check_unique(db, body)
    doc = DocumentType(**body.model_dump(mode="json", exclude={"base_fee"}), base_fee=body.base_fee)
    db.add(doc)
    db.flush()
    audit(db, "document_type_created", actor=user, entity_type="document_type", entity_id=doc.code, http=http)
    db.commit()
    return _doc_out(doc, {})


@router.put("/document-types/{doc_id}", response_model=AdminDocumentTypeOut)
def update_document_type(doc_id: int, body: DocumentTypeIn, http: HttpRequest, user: User = Depends(require_admin),
                         db: Session = Depends(get_db)):
    """Submitted requests keep the fee and processing time they were submitted under (their snapshot);
    drafts pick up the new terms."""
    doc = db.get(DocumentType, doc_id)
    if doc is None:
        raise NotFound("Document type not found.")
    _check_unique(db, body, doc_id)
    new = body.model_dump(mode="json", exclude={"base_fee"})
    changed = sorted(k for k, v in new.items() if getattr(doc, k) != v)
    if doc.base_fee != body.base_fee:
        changed.append("base_fee")
    if not changed:  # nothing to save, and nothing worth an audit entry
        return _doc_out(doc, _request_counts(db))
    for key, value in new.items():
        setattr(doc, key, value)
    doc.base_fee = body.base_fee
    audit(db, "document_type_updated", actor=user, entity_type="document_type", entity_id=doc.code, http=http,
          meta={"fields": changed})
    db.commit()
    return _doc_out(doc, _request_counts(db))


# ---------- settings ----------

SETTING_KEYS = (
    "courier_fee_metro", "courier_fee_provincial", "registrar_contact", "payment_instructions", "pickup_schedule",
)


def _settings_out(db: Session) -> SettingsIO:
    return SettingsIO(**{k: get_setting(db, k) for k in SETTING_KEYS})


@router.get("/settings", response_model=SettingsIO)
def read_settings(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _settings_out(db)


@router.put("/settings", response_model=SettingsIO)
def write_settings(body: SettingsIO, http: HttpRequest, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    values = body.model_dump(mode="json")  # Decimals become strings, so fees round-trip exactly
    before = _settings_out(db).model_dump(mode="json")
    for key in SETTING_KEYS:
        row = db.get(Setting, key)
        if row is None:
            db.add(Setting(key=key, value=values[key]))
        else:
            row.value = values[key]
    audit(db, "settings_updated", actor=user, entity_type="settings", http=http,
          meta={"fields": [k for k in SETTING_KEYS if before[k] != values[k]]})
    db.commit()
    return _settings_out(db)


# ---------- holidays ----------

@router.get("/holidays", response_model=list[HolidayOut])
def list_holidays(year: int | None = Query(default=None, ge=2000, le=2100), _: User = Depends(require_admin),
                  db: Session = Depends(get_db)):
    q = select(Holiday).order_by(Holiday.date)
    if year:
        q = q.where(func.extract("year", Holiday.date) == year)
    return db.execute(q).scalars().all()


@router.post("/holidays", response_model=HolidayOut, status_code=status.HTTP_201_CREATED)
def add_holiday(body: HolidayIn, http: HttpRequest, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Closed days push back estimated release dates computed from now on."""
    if db.execute(select(Holiday.id).where(Holiday.date == body.date)).first():
        raise _conflict("date", "That date is already marked as closed.")
    row = Holiday(date=body.date, name=body.name.strip())
    db.add(row)
    db.flush()
    audit(db, "holiday_added", actor=user, entity_type="holiday", entity_id=row.date.isoformat(), http=http,
          meta={"name": row.name})
    db.commit()
    return row


@router.delete("/holidays/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_holiday(holiday_id: int, http: HttpRequest, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    row = db.get(Holiday, holiday_id)
    if row is None:
        raise NotFound("Holiday not found.")
    audit(db, "holiday_removed", actor=user, entity_type="holiday", entity_id=row.date.isoformat(), http=http,
          meta={"name": row.name})
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- announcements ----------

def _announcement_out(a: Announcement) -> AnnouncementOut:
    now = utcnow()
    if not a.is_active:
        state = "hidden"
    elif a.starts_at and a.starts_at > now:
        state = "scheduled"
    elif a.ends_at and a.ends_at < now:
        state = "expired"
    else:
        state = "live"
    return AnnouncementOut.model_validate(a).model_copy(update={"state": state})


@router.get("/announcements", response_model=list[AnnouncementOut])
def list_announcements(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.execute(select(Announcement).order_by(Announcement.created_at.desc(), Announcement.id.desc())).scalars()
    return [_announcement_out(a) for a in rows]


@router.post("/announcements", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED)
def create_announcement(body: AnnouncementIn, http: HttpRequest, user: User = Depends(require_admin),
                        db: Session = Depends(get_db)):
    a = Announcement(**body.model_dump(), created_by_id=user.id)
    db.add(a)
    db.flush()
    audit(db, "announcement_created", actor=user, entity_type="announcement", entity_id=a.id, http=http)
    db.commit()
    return _announcement_out(a)


@router.put("/announcements/{announcement_id}", response_model=AnnouncementOut)
def update_announcement(announcement_id: int, body: AnnouncementIn, http: HttpRequest,
                        user: User = Depends(require_admin), db: Session = Depends(get_db)):
    a = db.get(Announcement, announcement_id)
    if a is None:
        raise NotFound("Announcement not found.")
    for key, value in body.model_dump().items():
        setattr(a, key, value)
    audit(db, "announcement_updated", actor=user, entity_type="announcement", entity_id=a.id, http=http)
    db.commit()
    return _announcement_out(a)


@router.delete("/announcements/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_announcement(announcement_id: int, http: HttpRequest, user: User = Depends(require_admin),
                        db: Session = Depends(get_db)):
    a = db.get(Announcement, announcement_id)
    if a is None:
        raise NotFound("Announcement not found.")
    audit(db, "announcement_deleted", actor=user, entity_type="announcement", entity_id=a.id, http=http,
          meta={"title": a.title})
    db.delete(a)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- reminders ----------

@router.post("/reminders/run")
def run_reminders_now(http: HttpRequest, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Sends any reminders that are due right now (they also go out automatically every hour)."""
    from app.services.reminders import run_reminders

    result = run_reminders(db)
    audit(db, "reminders_run", actor=user, entity_type="reminders", http=http,
          meta={"action_reminders": result.action_reminders, "late_notices": result.late_notices})
    db.commit()
    return {"action_reminders": result.action_reminders, "late_notices": result.late_notices}


# ---------- users ----------

def _row(u: User) -> UserRow:
    st, sf = u.student, u.staff
    person = sf or st
    return UserRow(
        id=u.id, email=u.email, role=u.role, display_name=u.display_name,
        first_name=person.first_name if person else None, last_name=person.last_name if person else None,
        student_no=st.student_no if st else None,
        employee_no=sf.employee_no if sf else None, position=sf.position if sf else None,
        program=st.program.code if st and st.program else None, is_active=u.is_active,
        is_locked=bool(u.locked_until and u.locked_until > utcnow()), last_login_at=u.last_login_at,
        created_at=u.created_at,
    )


def _load_user(db: Session, user_id: int) -> User:
    u = db.execute(
        select(User).where(User.id == user_id)
        .options(selectinload(User.student).selectinload(Student.program), selectinload(User.staff))
    ).scalar_one_or_none()
    if u is None:
        raise NotFound("User not found.")
    return u


def _send_setup_link(db: Session, u: User, tasks: BackgroundTasks, *, welcome: bool) -> str:
    """Emails a one-time link to set a password (reuses the reset-password flow, with a longer expiry)."""
    raw = new_opaque_token()
    db.add(PasswordResetToken(user_id=u.id, token_hash=hash_token(raw),
                              expires_at=utcnow() + timedelta(hours=SETUP_LINK_HOURS), created_at=utcnow()))
    link = f"{settings.frontend_url}/reset-password?token={raw}"
    sign_in = ""
    if welcome and u.role == Role.student:
        subject = "Your TUA Student Request Portal account"
        intro = ("The Registrar's Office created your account on the TUA Student Request Portal, where you can "
                 "request your academic records and forms online.")
        sign_in = f"\n\nAfterwards, sign in with your student number ({u.student_no}) or this email address."
    elif welcome:
        subject = "Your TUA Registrar back-office account"
        intro = f"An account was created for you on the TUA Student Request Portal ({u.email})."
    else:
        subject = "Set a new password for the TUA Student Request Portal"
        intro = "An administrator asked us to send you a link to set a new password."
    tasks.add_task(
        send_email, u.email, subject,
        f"Hello,\n\n{intro} Use this link to choose your password. It expires in {SETUP_LINK_HOURS} hours:\n\n"
        f"{link}{sign_in}\n\n— Office of the University Registrar",
    )
    return link


def _dev_link(link: str) -> str | None:
    return link if settings.environment == "development" else None


def _active_admins(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(User).where(User.role == Role.admin, User.is_active.is_(True)))


@router.get("/users", response_model=Page[UserRow])
def list_users(
    q: str | None = Query(default=None, max_length=100),
    role: Role | None = None,
    state: str | None = Query(default=None, pattern="^(active|inactive|locked)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = select(User).outerjoin(Student, Student.user_id == User.id).outerjoin(Staff, Staff.user_id == User.id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(
            User.email.ilike(like), User.student_no.ilike(like), Staff.employee_no.ilike(like),
            Student.first_name.ilike(like), Student.last_name.ilike(like),
            Staff.first_name.ilike(like), Staff.last_name.ilike(like),
        ))
    if role:
        stmt = stmt.where(User.role == role)
    if state == "active":
        stmt = stmt.where(User.is_active.is_(True))
    elif state == "inactive":
        stmt = stmt.where(User.is_active.is_(False))
    elif state == "locked":
        stmt = stmt.where(User.locked_until > utcnow())
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.execute(
        stmt.options(selectinload(User.student).selectinload(Student.program), selectinload(User.staff))
        .order_by(case((User.role == Role.student, 1), else_=0),  # staff and admins first
                  func.coalesce(Staff.last_name, Student.last_name, User.email), User.id)
        .offset((page - 1) * page_size).limit(page_size)
    ).scalars().all()
    return Page(items=[_row(u) for u in rows], total=total, page=page, page_size=page_size)


@router.post("/users", response_model=UserActionOut, status_code=status.HTTP_201_CREATED)
def create_staff(body: StaffCreate, http: HttpRequest, tasks: BackgroundTasks, user: User = Depends(require_admin),
                 db: Session = Depends(get_db)):
    """Creates a staff or admin account. Students come in through the CSV import or a request-access form."""
    email = body.email.lower()
    if db.execute(select(User.id).where(func.lower(User.email) == email)).first():
        raise _conflict("email", "An account with this email already exists.")
    if db.execute(select(Staff.id).where(Staff.employee_no == body.employee_no)).first():
        raise _conflict("employee_no", "Another staff member has this employee number.")
    # Unusable random password until they set their own through the emailed link.
    u = User(email=email, password_hash=hash_password(secrets.token_urlsafe(32)), role=Role(body.role))
    u.staff = Staff(employee_no=body.employee_no, first_name=body.first_name.strip(), last_name=body.last_name.strip(),
                    position=(body.position or "").strip() or None)
    db.add(u)
    db.flush()
    link = _send_setup_link(db, u, tasks, welcome=True)
    audit(db, "user_created", actor=user, entity_type="user", entity_id=u.id, http=http,
          meta={"email": email, "role": body.role})
    db.commit()
    return UserActionOut(user=_row(u), setup_link=_dev_link(link))


@router.post("/students/import", response_model=StudentImportOut)
async def import_students(http: HttpRequest, tasks: BackgroundTasks, file: UploadFile = File(...),
                          confirm: bool = Form(False), user: User = Depends(require_admin),
                          db: Session = Depends(get_db)):
    """Creates student accounts from an enrollment list (CSV). Without `confirm` it only previews the rows.
    New students get an email with a link to set their password; existing accounts are left as they are."""
    rows = student_import.parse(db, await file.read(student_import.MAX_BYTES + 1))
    counts = {s: sum(r.status == s for r in rows) for s in ("create", "skip", "error")}
    if confirm and counts["create"]:
        try:
            for u in student_import.create(db, rows):
                _send_setup_link(db, u, tasks, welcome=True)
            audit(db, "students_imported", actor=user, entity_type="user", http=http,
                  meta={"file": (file.filename or "")[:200], "created": counts["create"],
                        "skipped": counts["skip"], "errors": counts["error"]})
            db.commit()
        except IntegrityError:
            db.rollback()
            raise AppError("IMPORT_CONFLICT", "Some of these students were added while you were importing. "
                                              "Upload the file again to see the latest preview.", 409) from None
    return StudentImportOut(
        confirmed=confirm, to_create=counts["create"], skipped=counts["skip"], errors=counts["error"],
        rows=[ImportRowOut(line=r.line, student_no=r.student_no, email=r.email, name=r.name, status=r.status,
                           messages=r.messages) for r in rows],
    )


@router.patch("/users/{user_id}", response_model=UserActionOut)
def update_user(user_id: int, body: UserUpdate, http: HttpRequest, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    u = _load_user(db, user_id)
    changes = body.model_dump(exclude_unset=True)
    if u.id == admin.id and (changes.get("is_active") is False or changes.get("role") not in (None, "admin")):
        raise AppError("SELF_LOCKOUT", "You can’t deactivate your own account or remove your own admin access.", 409)
    if u.role == Role.student and ({"role", "first_name", "last_name", "position"} & changes.keys()):
        raise AppError("STUDENT_RECORD", "Student names and roles come from the Registrar’s records.", 409)
    losing_admin = u.role == Role.admin and u.is_active and (
        changes.get("role") == "staff" or changes.get("is_active") is False)
    if losing_admin and _active_admins(db) <= 1:
        raise AppError("LAST_ADMIN", "This is the only active admin. Make someone else an admin first.", 409)

    if "role" in changes and changes["role"] is not None:
        u.role = Role(changes["role"])
    if u.staff is not None:
        for key in ("first_name", "last_name"):
            if changes.get(key):
                setattr(u.staff, key, changes[key].strip())
        if "position" in changes:
            u.staff.position = (changes["position"] or "").strip() or None
    if "is_active" in changes and changes["is_active"] is not None:
        u.is_active = changes["is_active"]
        if not u.is_active:  # end their sessions now; access tokens are rejected on the next request
            db.execute(update(RefreshToken).where(RefreshToken.user_id == u.id, RefreshToken.revoked_at.is_(None))
                       .values(revoked_at=utcnow()))
    audit(db, "user_updated", actor=admin, entity_type="user", entity_id=u.id, http=http, meta={"fields": sorted(changes)})
    db.commit()
    return UserActionOut(user=_row(u))


@router.post("/users/{user_id}/unlock", response_model=UserActionOut)
def unlock_user(user_id: int, http: HttpRequest, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = _load_user(db, user_id)
    u.failed_login_count = 0
    u.locked_until = None
    audit(db, "user_unlocked", actor=admin, entity_type="user", entity_id=u.id, http=http)
    db.commit()
    return UserActionOut(user=_row(u))


@router.post("/users/{user_id}/send-password-link", response_model=UserActionOut)
def send_password_link(user_id: int, http: HttpRequest, tasks: BackgroundTasks, admin: User = Depends(require_admin),
                       db: Session = Depends(get_db)):
    u = _load_user(db, user_id)
    if not u.is_active:
        raise AppError("USER_INACTIVE", "Reactivate this account before sending a password link.", 409)
    link = _send_setup_link(db, u, tasks, welcome=False)
    audit(db, "password_link_sent", actor=admin, entity_type="user", entity_id=u.id, http=http)
    db.commit()
    return UserActionOut(user=_row(u), setup_link=_dev_link(link))
