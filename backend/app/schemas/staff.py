from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models import RequestStatus, ReviewStatus, Standing
from app.schemas.auth import ProgramOut
from app.schemas.common import ORM
from app.schemas.requests import DocTypeBrief, RequestDetail


class StudentBrief(BaseModel):
    id: int
    full_name: str
    student_no: str
    email: str
    program: ProgramOut | None
    year_level: int | None
    contact_no: str | None
    standing: Standing


class StaffBrief(ORM):
    id: int
    full_name: str
    position: str | None


class QueueItem(BaseModel):
    id: int
    reference_no: str
    status: RequestStatus
    document_type: DocTypeBrief
    student: StudentBrief
    copies: int
    delivery_method: str
    fee_total: str
    submitted_at: datetime | None
    estimated_release_date: date | None
    updated_at: datetime
    is_overdue: bool
    assigned_to: StaffBrief | None
    payment_pending: bool = False


class TransitionOption(BaseModel):
    to_status: RequestStatus
    requires_remarks: bool


class StaffRequestDetail(RequestDetail):
    student: StudentBrief
    assigned_to: StaffBrief | None
    is_overdue: bool
    version: int
    transitions: list[TransitionOption]
    can_upload_edocument: bool


class TransitionIn(BaseModel):
    to_status: RequestStatus | Literal["approve"]
    remarks: str | None = Field(default=None, max_length=1000)
    version: int | None = Field(default=None, description="Expected version; 409 if someone else changed it first")


class BulkTransitionIn(BaseModel):
    refs: list[str] = Field(min_length=1, max_length=100)
    to_status: RequestStatus | Literal["approve"]
    remarks: str | None = Field(default=None, max_length=1000)


class BulkResult(BaseModel):
    reference_no: str
    ok: bool
    status: RequestStatus | None = None
    error: str | None = None


class NoteIn(BaseModel):
    remarks: str = Field(min_length=1, max_length=1000)


class AssignIn(BaseModel):
    staff_id: int | None


class PaymentRejectIn(BaseModel):
    remarks: str = Field(min_length=1, max_length=500)
    version: int | None = Field(default=None, description="Expected version; 409 if someone else changed it first")


class RevokeIn(BaseModel):
    reason: str = Field(min_length=1, max_length=300)


class AttachmentReviewIn(BaseModel):
    review_status: ReviewStatus


class StatusCount(BaseModel):
    status: RequestStatus
    count: int


class DayCount(BaseModel):
    date: date
    count: int


class Dashboard(BaseModel):
    counts: list[StatusCount]
    active_total: int
    overdue_total: int
    assigned_to_me: int
    submitted_today: int
    completed_this_week: int
    payments_to_verify: int
    daily_submissions: list[DayCount]
    overdue: list[QueueItem]
    pickups: list[QueueItem]
