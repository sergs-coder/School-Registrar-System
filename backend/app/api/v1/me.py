from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import RateLimiter, require_student
from app.core.errors import AppError
from app.core.security import hash_token, new_opaque_token, utcnow
from app.db.session import get_db
from app.models import Student, User
from app.schemas.auth import PersonalEmailIn, PersonalEmailOut, ProfileUpdate, StudentProfileOut
from app.services.audit import audit
from app.services.email import send_email

router = APIRouter(prefix="/me", tags=["profile"])

VERIFY_HOURS = 24
# Each change sends an email to an address we don't control yet; keep that from being abused.
personal_email_limiter = RateLimiter(limit=5, window_seconds=900)


@router.get("/profile", response_model=StudentProfileOut)
def get_profile(user: User = Depends(require_student)):
    return user.student


@router.patch("/profile", response_model=StudentProfileOut)
def update_profile(
    body: ProfileUpdate, http: Request, user: User = Depends(require_student), db: Session = Depends(get_db)
):
    # Name, student number and program come from the Registrar's records and are read-only here.
    changes = body.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(user.student, key, value)
    audit(db, "profile_updated", actor=user, entity_type="student", entity_id=user.student.id, http=http,
          meta={"fields": sorted(changes)})
    db.commit()
    return user.student


# ---------- personal email ----------

def _send_verification(student: Student, tasks: BackgroundTasks) -> str:
    """Issues a fresh one-time link (replacing any earlier one) and emails it to the personal address."""
    raw = new_opaque_token()
    student.personal_email_token_hash = hash_token(raw)
    student.personal_email_token_expires_at = utcnow() + timedelta(hours=VERIFY_HOURS)
    link = f"{settings.frontend_url.rstrip('/')}/verify-email?token={raw}"
    tasks.add_task(
        send_email, student.personal_email, "Confirm your personal email for TUA request updates",
        f"Hello {student.first_name},\n\n"
        "You asked the TUA Student Request Portal to also send your request updates to this address.\n"
        f"Confirm it within {VERIFY_HOURS} hours:\n\n{link}\n\n"
        "If this wasn't you, ignore this email and nothing will be sent here.\n\n"
        "— Office of the University Registrar, Trinity University of Asia",
    )
    return link


def _out(student: Student, link: str | None = None) -> PersonalEmailOut:
    return PersonalEmailOut(
        profile=StudentProfileOut.model_validate(student),
        verify_link=link if settings.environment == "development" else None,
    )


@router.put("/personal-email", response_model=PersonalEmailOut)
def set_personal_email(body: PersonalEmailIn, http: Request, tasks: BackgroundTasks,
                       user: User = Depends(require_student), db: Session = Depends(get_db)):
    """Set, replace or (with null) remove the personal email. A new address only receives updates
    after it's confirmed through the emailed link."""
    student = user.student
    if body.email is None:
        had = student.personal_email
        student.personal_email = None
        student.personal_email_verified_at = None
        student.personal_email_token_hash = None
        student.personal_email_token_expires_at = None
        if had:
            audit(db, "personal_email_removed", actor=user, entity_type="student", entity_id=student.id, http=http)
        db.commit()
        return _out(student)

    personal_email_limiter(http)  # only changes that send an email count; removing never does
    email = body.email.strip().lower()
    if email == user.email.lower():
        raise AppError("VALIDATION_ERROR", "Some fields are invalid.", 422,
                       [{"field": "email", "message": "That’s your university email. Enter a different, personal address."}])
    if email == (student.personal_email or "").lower() and student.personal_email_verified_at:
        return _out(student)  # already confirmed; nothing to do
    student.personal_email = email
    student.personal_email_verified_at = None
    link = _send_verification(student, tasks)
    audit(db, "personal_email_set", actor=user, entity_type="student", entity_id=student.id, http=http)
    db.commit()
    return _out(student, link)


@router.post("/personal-email/resend", response_model=PersonalEmailOut, dependencies=[Depends(personal_email_limiter)])
def resend_personal_email(tasks: BackgroundTasks, user: User = Depends(require_student), db: Session = Depends(get_db)):
    student = user.student
    if not student.personal_email or student.personal_email_verified_at:
        raise AppError("NOTHING_TO_CONFIRM", "There’s no personal email waiting to be confirmed.", 409)
    link = _send_verification(student, tasks)
    db.commit()
    return _out(student, link)
