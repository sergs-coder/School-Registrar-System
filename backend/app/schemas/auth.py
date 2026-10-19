from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import Role, Standing
from app.schemas.common import ORM, check_password_strength


class LoginIn(BaseModel):
    identifier: str = Field(min_length=3, max_length=255, description="University email or student number")
    password: str = Field(min_length=1, max_length=200)


class ProgramOut(ORM):
    code: str
    name: str
    college: str


class StudentProfileOut(ORM):
    student_no: str
    first_name: str
    middle_name: str | None
    last_name: str
    suffix: str | None
    full_name: str
    program: ProgramOut | None
    year_level: int | None
    contact_no: str | None
    mailing_address: str | None
    standing: Standing
    personal_email: str | None = None
    personal_email_verified: bool = False


class PersonalEmailIn(BaseModel):
    email: EmailStr | None = Field(description="New personal email, or null to remove it")


class PersonalEmailOut(BaseModel):
    profile: StudentProfileOut
    # Only in development, where the confirmation email goes to the log instead of an inbox.
    verify_link: str | None = None


class VerifyEmailIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class StaffOut(ORM):
    employee_no: str
    first_name: str
    last_name: str
    full_name: str
    position: str | None


class MeOut(ORM):
    id: int
    email: str
    role: Role
    display_name: str
    privacy_consent_at: datetime | None
    consent_required: bool
    student: StudentProfileOut | None
    staff: StaffOut | None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: MeOut


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    new_password: str = Field(max_length=200)

    _strength = field_validator("new_password")(check_password_strength)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(max_length=200)
    new_password: str = Field(max_length=200)

    _strength = field_validator("new_password")(check_password_strength)


class ProfileUpdate(BaseModel):
    contact_no: str | None = Field(default=None, pattern=r"^(\+63|0)9\d{9}$", description="PH mobile, e.g. 09171234567")
    mailing_address: str | None = Field(default=None, max_length=500)
