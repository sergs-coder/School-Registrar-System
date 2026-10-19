from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, Request, Response
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, login_limiter, reset_limiter
from app.core.errors import AppError, Unauthorized
from app.core.security import (
    create_access_token,
    hash_password,
    hash_token,
    new_opaque_token,
    utcnow,
    verify_password,
)
from app.db.session import get_db
from app.models import PasswordResetToken, RefreshToken, Student, User
from app.schemas.auth import (
    ChangePasswordIn,
    ForgotPasswordIn,
    LoginIn,
    MeOut,
    ResetPasswordIn,
    TokenOut,
    VerifyEmailIn,
)
from app.schemas.common import Message
from app.services.audit import audit
from app.services.email import send_email

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_PATH = f"{settings.api_prefix}/auth"
INVALID_LOGIN = "Incorrect email/student number or password."
_DUMMY_HASH = hash_password("timing-equaliser-not-a-password")


def me_out(user: User) -> MeOut:
    return MeOut(
        id=user.id,
        email=user.email,
        role=user.role,
        display_name=user.display_name,
        privacy_consent_at=user.privacy_consent_at,
        consent_required=user.privacy_consent_at is None,
        student=user.student,
        staff=user.staff,
    )


def _issue_tokens(db: Session, user: User, response: Response, http: Request) -> tuple[TokenOut, RefreshToken]:
    raw = new_opaque_token()
    token = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(raw),
        expires_at=utcnow() + timedelta(days=settings.refresh_token_expire_days),
        user_agent=(http.headers.get("user-agent") or "")[:300],
        created_at=utcnow(),
    )
    db.add(token)
    db.flush()
    response.set_cookie(
        settings.refresh_cookie_name,
        raw,
        max_age=settings.refresh_token_expire_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=COOKIE_PATH,
    )
    return TokenOut(
        access_token=create_access_token(user.id, user.role.value),
        expires_in=settings.access_token_expire_minutes * 60,
        user=me_out(user),
    ), token


@router.post("/login", response_model=TokenOut, dependencies=[Depends(login_limiter)])
def login(body: LoginIn, response: Response, http: Request, db: Session = Depends(get_db)):
    ident = body.identifier.strip()
    user = db.execute(
        select(User).where(or_(func.lower(User.email) == ident.lower(), User.student_no == ident))
    ).scalar_one_or_none()
    now = utcnow()
    if user is None:
        verify_password(body.password, _DUMMY_HASH)  # equalise timing
        raise Unauthorized(INVALID_LOGIN, code="INVALID_CREDENTIALS")
    if user.locked_until and user.locked_until > now:
        minutes = max(1, int((user.locked_until - now).total_seconds() // 60) + 1)
        raise AppError("ACCOUNT_LOCKED", f"Too many failed attempts. Try again in {minutes} minute(s).", 423)
    if not verify_password(body.password, user.password_hash):
        user.failed_login_count += 1
        if user.failed_login_count >= settings.max_failed_logins:
            user.locked_until = now + timedelta(minutes=settings.lockout_minutes)
            user.failed_login_count = 0
        audit(db, "login_failed", actor=user, entity_type="user", entity_id=user.id, http=http)
        db.commit()
        raise Unauthorized(INVALID_LOGIN, code="INVALID_CREDENTIALS")
    if not user.is_active:
        raise Unauthorized("This account is disabled. Please contact the Registrar.", code="ACCOUNT_DISABLED")

    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now
    out, _ = _issue_tokens(db, user, response, http)
    audit(db, "login", actor=user, entity_type="user", entity_id=user.id, http=http)
    db.commit()
    return out


@router.post("/refresh", response_model=TokenOut)
def refresh(
    response: Response,
    http: Request,
    db: Session = Depends(get_db),
    srm_refresh: str | None = Cookie(default=None, alias=settings.refresh_cookie_name),
):
    if not srm_refresh:
        raise Unauthorized("No active session.", code="NO_SESSION")
    token = db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(srm_refresh))
    ).scalar_one_or_none()
    now = utcnow()
    if token is None or token.expires_at < now:
        response.delete_cookie(settings.refresh_cookie_name, path=COOKIE_PATH)
        raise Unauthorized("Your session has ended. Please sign in again.", code="NO_SESSION")
    if token.revoked_at is not None:
        # A rotated token was replayed: assume theft and end every session for this user.
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == token.user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        audit(db, "refresh_token_reuse", entity_type="user", entity_id=token.user_id, http=http)
        db.commit()
        response.delete_cookie(settings.refresh_cookie_name, path=COOKIE_PATH)
        raise Unauthorized("Your session has ended. Please sign in again.", code="NO_SESSION")
    user = db.get(User, token.user_id)
    if user is None or not user.is_active:
        raise Unauthorized("Account is not active.", code="NO_SESSION")
    out, new_token = _issue_tokens(db, user, response, http)
    token.revoked_at = now
    token.replaced_by_id = new_token.id
    db.commit()
    return out


@router.post("/logout", response_model=Message)
def logout(
    response: Response,
    db: Session = Depends(get_db),
    srm_refresh: str | None = Cookie(default=None, alias=settings.refresh_cookie_name),
):
    if srm_refresh:
        token = db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == hash_token(srm_refresh))
        ).scalar_one_or_none()
        if token and token.revoked_at is None:
            token.revoked_at = utcnow()
            db.commit()
    response.delete_cookie(settings.refresh_cookie_name, path=COOKIE_PATH)
    return Message(message="Signed out.")


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user)):
    return me_out(user)


@router.post("/consent", response_model=MeOut)
def consent(http: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.privacy_consent_at is None:
        user.privacy_consent_at = utcnow()
        audit(db, "privacy_consent", actor=user, entity_type="user", entity_id=user.id, http=http,
              meta={"notice_version": "2026-10"})
        db.commit()
    return me_out(user)


@router.post("/change-password", response_model=Message)
def change_password(
    body: ChangePasswordIn, http: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if not verify_password(body.current_password, user.password_hash):
        raise AppError("INVALID_PASSWORD", "Your current password is incorrect.", 422,
                       [{"field": "current_password", "message": "Incorrect password."}])
    user.password_hash = hash_password(body.new_password)
    audit(db, "password_changed", actor=user, entity_type="user", entity_id=user.id, http=http)
    db.commit()
    return Message(message="Password updated.")


@router.post("/forgot-password", response_model=Message, dependencies=[Depends(reset_limiter)])
def forgot_password(body: ForgotPasswordIn, tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.execute(select(User).where(func.lower(User.email) == body.email.lower())).scalar_one_or_none()
    if user and user.is_active:
        raw = new_opaque_token()
        db.add(PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(raw),
            expires_at=utcnow() + timedelta(minutes=settings.password_reset_expire_minutes),
            created_at=utcnow(),
        ))
        db.commit()
        link = f"{settings.frontend_url}/reset-password?token={raw}"
        tasks.add_task(
            send_email, user.email, "Reset your TUA Student Request Portal password",
            f"Hello,\n\nUse this link to set a new password. It expires in "
            f"{settings.password_reset_expire_minutes} minutes:\n\n{link}\n\n"
            "If you did not ask for this, you can ignore this email.\n\n— Office of the University Registrar",
        )
    # Same answer whether or not the account exists, so emails can't be probed.
    return Message(message="If that email is registered, a reset link is on its way.")


@router.post("/reset-password", response_model=Message)
def reset_password(body: ResetPasswordIn, http: Request, db: Session = Depends(get_db)):
    token = db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(body.token))
    ).scalar_one_or_none()
    now = utcnow()
    if token is None or token.used_at is not None or token.expires_at < now:
        raise AppError("INVALID_RESET_TOKEN", "This reset link is invalid or has expired. Please request a new one.", 400)
    user = db.get(User, token.user_id)
    user.password_hash = hash_password(body.new_password)
    user.failed_login_count = 0
    user.locked_until = None
    token.used_at = now
    db.execute(
        update(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)).values(revoked_at=now)
    )
    audit(db, "password_reset", actor=user, entity_type="user", entity_id=user.id, http=http)
    db.commit()
    return Message(message="Password updated. You can now sign in.")


@router.post("/verify-personal-email", response_model=Message, dependencies=[Depends(reset_limiter)])
def verify_personal_email(body: VerifyEmailIn, http: Request, db: Session = Depends(get_db)):
    """Public on purpose: students often open the link on a phone where they aren't signed in.
    The token alone proves they control the inbox."""
    student = db.execute(
        select(Student).where(Student.personal_email_token_hash == hash_token(body.token))
    ).scalar_one_or_none()
    now = utcnow()
    if student is None or student.personal_email is None or student.personal_email_token_expires_at < now:
        raise AppError("INVALID_VERIFY_TOKEN", "This link is invalid or has expired. Request a new one from your profile.", 400)
    student.personal_email_verified_at = now
    student.personal_email_token_hash = None
    student.personal_email_token_expires_at = None
    audit(db, "personal_email_verified", actor=student.user, entity_type="student", entity_id=student.id, http=http)
    db.commit()
    return Message(message=f"Request updates will also go to {student.personal_email}.")
