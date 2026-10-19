import datetime as dt
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator
from pydantic_core import PydanticCustomError

from app.models import (
    AttachmentKind,
    DeliveryMethod,
    IssuedKind,
    PaymentMethod,
    PaymentStatus,
    RequestStatus,
    ReviewStatus,
)
from app.schemas.catalog import DocumentTypeOut
from app.schemas.common import ORM
from app.services.locations import METRO_PROVINCE, is_metro_barangay, is_metro_city


class DeliveryAddress(BaseModel):
    recipient: str = Field(min_length=2, max_length=150)
    contact_no: str = Field(pattern=r"^(\+63|0)9\d{9}$")
    line1: str = Field(min_length=3, max_length=250,
                       description="Metro Manila: house no., building, street. Elsewhere: also the barangay.")
    # Metro Manila only, chosen from the city's barangay list.
    barangay: str | None = Field(default=None, max_length=100)
    city: str = Field(min_length=2, max_length=100)
    province: str = Field(default="", max_length=100, description="Filled in for Metro Manila")
    zip: str = Field(pattern=r"^\d{4}$")
    region: Literal["metro", "provincial"] = "metro"
    landmark: str | None = Field(default=None, max_length=200, description="Helps the courier find the place")

    @model_validator(mode="after")
    def check_metro_location(self):
        self.landmark = (self.landmark or "").strip() or None
        if self.region == "provincial":
            self.barangay = None
            self.province = self.province.strip()
            if len(self.province) < 2:
                raise PydanticCustomError("province", "Enter the province.")
            return self
        if not is_metro_city(self.city):
            raise PydanticCustomError("metro_city", "Choose a city or municipality in Metro Manila.")
        if not self.barangay or not is_metro_barangay(self.city, self.barangay):
            raise PydanticCustomError("metro_barangay", "Choose a barangay in {city}.", {"city": self.city})
        self.province = METRO_PROVINCE
        return self


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


class PaymentOut(BaseModel):
    id: int
    amount: Decimal
    method: PaymentMethod
    payer_reference: str | None
    paid_at: datetime | None
    status: PaymentStatus
    remarks: str | None
    verified_at: datetime | None
    verified_by_name: str | None = None
    proof: AttachmentOut | None
    created_at: datetime


class IssuedDocumentOut(BaseModel):
    id: int
    kind: IssuedKind
    code: str
    verify_url: str
    issued_at: datetime
    revoked_at: datetime | None
    revoke_reason: str | None
    filename: str | None = None


class VerifyOut(BaseModel):
    """What anyone holding a code may see. Kept to what is printed on the document itself."""

    state: Literal["valid", "revoked", "claimed", "not_claimable"]
    message: str
    kind: IssuedKind
    code: str
    reference_no: str
    document_name: str
    holder_name: str
    student_no_masked: str
    copies: int
    issued_at: datetime
    revoked_at: datetime | None = None


class AppointmentOut(BaseModel):
    date: dt.date
    time: str
    label: str


def appointment_out(appt) -> AppointmentOut | None:
    from app.services.pickups import label

    return AppointmentOut(date=appt.date, time=appt.time, label=label(appt)) if appt else None


class AppointmentIn(BaseModel):
    date: dt.date
    time: str = Field(pattern=r"^\d{2}:\d{2}$")


class PickupSlot(BaseModel):
    time: str
    left: int


class PickupDay(BaseModel):
    date: dt.date
    slots: list[PickupSlot]


class PickupOptions(BaseModel):
    appointment: AppointmentOut | None
    days: list[PickupDay]


class PickupRow(BaseModel):
    time: str
    reference_no: str
    student_name: str
    student_no: str
    document_name: str
    copies: int
    status: RequestStatus


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
    payments: list[PaymentOut]
    e_documents: list[IssuedDocumentOut]
    pickup_appointment: AppointmentOut | None = None
    history: list[HistoryOut]
    allowed_actions: list[str]
    latest_remarks: str | None
    document_type_full: DocumentTypeOut
