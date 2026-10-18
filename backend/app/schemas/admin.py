import datetime as dt
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, EmailStr, Field, field_validator, model_validator

from app.models import AnnouncementLevel, DocCategory, Role
from app.schemas.catalog import AttachmentDef, DocumentTypeOut, FieldDef
from app.schemas.common import ORM

KEY_PATTERN = r"^[a-z][a-z0-9_]{0,39}$"
# Pesos always carry two decimals, so "400" and "400.00" mean (and print as) the same amount.
Money = Annotated[Decimal, AfterValidator(lambda v: v.quantize(Decimal("0.01")))]


# ---------- document types ----------

class FieldDefIn(FieldDef):
    key: str = Field(pattern=KEY_PATTERN)
    label: str = Field(min_length=1, max_length=120)
    options: list[str] = Field(default_factory=list, max_length=30)
    help: str | None = Field(default=None, max_length=300)
    placeholder: str | None = Field(default=None, max_length=120)
    max_length: int | None = Field(default=None, ge=1, le=2000)

    @model_validator(mode="after")
    def _select_needs_options(self):
        self.options = [o.strip() for o in self.options if o.strip()]
        if self.type == "select" and not self.options:
            raise ValueError(f"“{self.label}” is a dropdown, so it needs at least one option.")
        return self


class AttachmentDefIn(AttachmentDef):
    key: str = Field(pattern=KEY_PATTERN)
    label: str = Field(min_length=1, max_length=150)
    accept: list[Literal["pdf", "jpg", "png"]] = Field(default_factory=lambda: ["pdf", "jpg", "png"], min_length=1)
    max_mb: int = Field(default=5, ge=1, le=5)
    help: str | None = Field(default=None, max_length=300)


class DocumentTypeIn(BaseModel):
    code: str = Field(pattern=r"^[A-Z0-9-]{2,20}$", description="Short code, e.g. TOR")
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)
    name: str = Field(min_length=3, max_length=150)
    description: str = Field(default="", max_length=2000)
    category: DocCategory
    base_fee: Money = Field(ge=0, le=100000, max_digits=8, decimal_places=2)
    fee_per_copy: bool = True
    max_copies: int = Field(default=5, ge=1, le=20)
    processing_days: int = Field(default=3, ge=0, le=60)
    requires_payment: bool = True
    allow_courier: bool = True
    allow_edocument: bool = False
    purposes: list[str] = Field(default_factory=list, max_length=20)
    required_fields: list[FieldDefIn] = Field(default_factory=list, max_length=20)
    required_attachments: list[AttachmentDefIn] = Field(default_factory=list, max_length=10)
    instructions: str = Field(default="", max_length=2000)
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0, le=999)

    @field_validator("purposes")
    @classmethod
    def _clean_purposes(cls, v: list[str]) -> list[str]:
        cleaned = list(dict.fromkeys(p.strip() for p in v if p.strip()))
        if any(len(p) > 100 for p in cleaned):
            raise ValueError("Each purpose must be 100 characters or fewer.")
        return cleaned

    @model_validator(mode="after")
    def _unique_keys(self):
        for name, items in (("field", self.required_fields), ("attachment", self.required_attachments)):
            keys = [i.key for i in items]
            dupes = sorted({k for k in keys if keys.count(k) > 1})
            if dupes:
                raise ValueError(f"Each {name} needs its own key; repeated: {', '.join(dupes)}.")
        return self


class AdminDocumentTypeOut(DocumentTypeOut):
    is_active: bool
    sort_order: int
    request_count: int = 0


# ---------- settings ----------

class RegistrarContact(BaseModel):
    office: str = Field(min_length=3, max_length=150)
    address: str = Field(min_length=3, max_length=300)
    email: EmailStr
    phone: str = Field(min_length=3, max_length=60)
    hours: str = Field(min_length=3, max_length=200)


class SettingsIO(BaseModel):
    courier_fee_metro: Money = Field(ge=0, le=10000, max_digits=7, decimal_places=2)
    courier_fee_provincial: Money = Field(ge=0, le=10000, max_digits=7, decimal_places=2)
    registrar_contact: RegistrarContact
    payment_instructions: str = Field(min_length=10, max_length=1000)


# ---------- holidays & announcements ----------

class HolidayIn(BaseModel):
    date: dt.date
    name: str = Field(min_length=2, max_length=150)


class HolidayOut(ORM):
    id: int
    date: dt.date
    name: str


class AnnouncementIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    body: str = Field(min_length=1, max_length=2000)
    level: AnnouncementLevel = AnnouncementLevel.info
    starts_at: dt.datetime | None = None
    ends_at: dt.datetime | None = None
    is_active: bool = True

    @model_validator(mode="after")
    def _window(self):
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("The end time must be after the start time.")
        return self


class AnnouncementOut(ORM):
    id: int
    title: str
    body: str
    level: AnnouncementLevel
    starts_at: dt.datetime | None
    ends_at: dt.datetime | None
    is_active: bool
    created_at: dt.datetime
    state: Literal["live", "scheduled", "expired", "hidden"] = "live"


# ---------- users ----------

class UserRow(BaseModel):
    id: int
    email: str
    role: Role
    display_name: str
    first_name: str | None
    last_name: str | None
    student_no: str | None
    employee_no: str | None
    position: str | None
    program: str | None
    is_active: bool
    is_locked: bool
    last_login_at: dt.datetime | None
    created_at: dt.datetime


class StaffCreate(BaseModel):
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    employee_no: str = Field(pattern=r"^[A-Za-z0-9-]{2,20}$")
    position: str | None = Field(default=None, max_length=100)
    role: Literal["staff", "admin"] = "staff"


class UserUpdate(BaseModel):
    role: Literal["staff", "admin"] | None = None
    is_active: bool | None = None
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    position: str | None = Field(default=None, max_length=100)


class UserActionOut(BaseModel):
    user: UserRow
    # Only in development, where emails go to the log instead of an inbox.
    setup_link: str | None = None


# ---------- reports ----------

class Totals(BaseModel):
    submitted: int
    completed: int
    rejected: int
    cancelled: int
    open: int
    revenue: Decimal
    avg_turnaround_days: float | None
    on_time_rate: float | None


class DocumentRow(BaseModel):
    code: str
    name: str
    submitted: int
    completed: int
    revenue: Decimal
    avg_turnaround_days: float | None


class MethodRow(BaseModel):
    method: str
    count: int
    amount: Decimal


class DayRow(BaseModel):
    date: dt.date
    submitted: int
    completed: int


class ReportSummary(BaseModel):
    date_from: dt.date
    date_to: dt.date
    totals: Totals
    by_document: list[DocumentRow]
    by_method: list[MethodRow]
    daily: list[DayRow]


# ---------- audit logs ----------

class AuditRow(BaseModel):
    id: int
    created_at: dt.datetime
    action: str
    actor_id: int | None
    actor_name: str | None
    actor_email: str | None
    actor_role: Role | None
    entity_type: str | None
    entity_id: str | None
    ip: str | None
    user_agent: str | None
    meta: dict
