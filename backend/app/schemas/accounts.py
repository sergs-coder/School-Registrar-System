import datetime as dt
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import AccountRequestStatus, Standing

STUDENT_NO = r"^[0-9A-Za-z][0-9A-Za-z-]{3,19}$"


class AccountRequestIn(BaseModel):
    """The public alumni / former student access form (sent as multipart along with the ID file)."""

    student_no: str = Field(pattern=STUDENT_NO)
    first_name: str = Field(min_length=1, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    birthdate: dt.date
    email: EmailStr
    contact_no: str | None = Field(default=None, pattern=r"^(\+63|0)9\d{9}$")
    program: str = Field(min_length=2, max_length=200)
    last_year_attended: int = Field(ge=1950)
    standing: Literal[Standing.graduated, Standing.inactive]

    @field_validator("first_name", "middle_name", "last_name", "program", "student_no", mode="before")
    @classmethod
    def strip(cls, v):
        return v.strip() or None if isinstance(v, str) else v

    @field_validator("birthdate")
    @classmethod
    def plausible_birthdate(cls, v: dt.date) -> dt.date:
        if not dt.date(1900, 1, 1) <= v <= dt.date.today() - dt.timedelta(days=14 * 365):
            raise ValueError("Enter your real date of birth.")
        return v

    @field_validator("last_year_attended")
    @classmethod
    def not_future(cls, v: int) -> int:
        if v > dt.date.today().year:
            raise ValueError("The year can't be in the future.")
        return v


class RecordMatch(BaseModel):
    """How the request compares with the student record on file under the same student number."""

    full_name: str
    birthdate: dt.date | None
    standing: Standing
    login_email: str
    name_matches: bool
    birthdate_matches: bool


class AccountRequestOut(BaseModel):
    id: int
    student_no: str
    first_name: str
    middle_name: str | None
    last_name: str
    birthdate: dt.date
    email: str
    contact_no: str | None
    program: str
    last_year_attended: int
    standing: Standing
    id_filename: str
    id_mime_type: str
    status: AccountRequestStatus
    remarks: str | None
    reviewed_by_name: str | None
    reviewed_at: dt.datetime | None
    created_at: dt.datetime
    record: RecordMatch | None
    email_in_use: bool
    setup_link: str | None = None  # development only


class RejectIn(BaseModel):
    remarks: str = Field(min_length=5, max_length=1000)
