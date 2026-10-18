from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from app.models import AttachmentKind, DeliveryMethod, RequestStatus, ReviewStatus
from app.schemas.catalog import DocumentTypeOut
from app.schemas.common import ORM


class DeliveryAddress(BaseModel):
    recipient: str = Field(min_length=2, max_length=150)
    contact_no: str = Field(pattern=r"^(\+63|0)9\d{9}$")
    line1: str = Field(min_length=3, max_length=250, description="House no., street, barangay")
    city: str = Field(min_length=2, max_length=100)
    province: str = Field(min_length=2, max_length=100)
    zip: str = Field(pattern=r"^\d{4}$")
    region: Literal["metro", "provincial"] = "metro"


class RequestCreate(BaseModel):
    document_type_id: int
    purpose: str = Field(default="", max_length=300)
    copies: int = Field(default=1, ge=1, le=20)
    delivery_method: DeliveryMethod = DeliveryMethod.pickup
    delivery_address: DeliveryAddress | None = None
    form_data: dict = Field(default_factory=dict)


class RequestUpdate(BaseModel):
    purpose: str | None = Field(default=None, max_length=300)
    copies: int | None = Field(default=None, ge=1, le=20)
    delivery_method: DeliveryMethod | None = None
    delivery_address: DeliveryAddress | None = None
    form_data: dict | None = None


class QuoteIn(BaseModel):
    document_type_id: int
    copies: int = Field(default=1, ge=1, le=20)
    delivery_method: DeliveryMethod = DeliveryMethod.pickup
    region: Literal["metro", "provincial"] | None = None


class FeeLine(BaseModel):
    label: str
    amount: Decimal


class QuoteOut(BaseModel):
    fee_breakdown: list[FeeLine]
    fee_total: Decimal
    requires_payment: bool
    estimated_release_date: date


class RemarksIn(BaseModel):
    remarks: str | None = Field(default=None, max_length=1000)


class DocTypeBrief(ORM):
    id: int
    code: str
    slug: str
    name: str
    category: str


class AttachmentOut(ORM):
    id: int
    kind: AttachmentKind
    requirement_key: str | None
    original_filename: str
    mime_type: str
    size_bytes: int
    review_status: ReviewStatus
    created_at: datetime


class HistoryOut(BaseModel):
    id: int
    from_status: RequestStatus | None
    to_status: RequestStatus
    actor_name: str
    remarks: str | None
    is_internal: bool = False
    created_at: datetime


class RequestListItem(ORM):
    id: int
    reference_no: str
    document_type: DocTypeBrief
    purpose: str
    copies: int
    delivery_method: DeliveryMethod
    status: RequestStatus
    fee_total: Decimal
    estimated_release_date: date | None
    created_at: datetime
    submitted_at: datetime | None
    updated_at: datetime


class RequestDetail(RequestListItem):
    form_data: dict
    delivery_address: dict | None
    fee_breakdown: list[FeeLine]
    completed_at: datetime | None
    attachments: list[AttachmentOut]
    history: list[HistoryOut]
    allowed_actions: list[str]
    latest_remarks: str | None
    document_type_full: DocumentTypeOut
