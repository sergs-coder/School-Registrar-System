from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.catalog import DocumentType
from app.models.enums import (
    AttachmentKind,
    DeliveryMethod,
    IssuedKind,
    PaymentMethod,
    PaymentStatus,
    RequestStatus,
    ReviewStatus,
)
from app.models.user import Staff, Student, User, enum_col


class ReferenceCounter(Base):
    __tablename__ = "reference_counters"

    year: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    last_value: Mapped[int] = mapped_column(default=0)


class Request(TimestampMixin, Base):
    __tablename__ = "requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    reference_no: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    document_type_id: Mapped[int] = mapped_column(ForeignKey("document_types.id"), index=True)
    doc_type_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    purpose: Mapped[str] = mapped_column(String(300))
    copies: Mapped[int] = mapped_column(default=1)
    delivery_method: Mapped[DeliveryMethod] = enum_col(DeliveryMethod, default=DeliveryMethod.pickup)
    # {"recipient","contact_no","line1","city","province","zip","region":"metro|provincial"}
    delivery_address: Mapped[dict | None] = mapped_column(JSON)
    form_data: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[RequestStatus] = enum_col(RequestStatus, default=RequestStatus.draft, index=True)
    fee_breakdown: Mapped[list] = mapped_column(JSON, default=list)
    fee_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"))
    estimated_release_date: Mapped[date | None]
    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id"))
    submitted_at: Mapped[datetime | None] = mapped_column(index=True)
    completed_at: Mapped[datetime | None]
    # Reminder bookkeeping; reset on every status change (see workflow.transition).
    reminder_count: Mapped[int] = mapped_column(default=0, server_default="0")
    last_reminded_at: Mapped[datetime | None]
    delay_notified_at: Mapped[datetime | None]
    version: Mapped[int] = mapped_column(default=1)

    student: Mapped[Student] = relationship()
    document_type: Mapped[DocumentType] = relationship()
    assigned_to: Mapped[Staff | None] = relationship()
    attachments: Mapped[list["RequestAttachment"]] = relationship(
        back_populates="request", order_by="RequestAttachment.id"
    )
    history: Mapped[list["RequestStatusHistory"]] = relationship(
        back_populates="request", order_by="RequestStatusHistory.id"
    )
    payments: Mapped[list["Payment"]] = relationship(back_populates="request", order_by="Payment.id")
    issued_documents: Mapped[list["IssuedDocument"]] = relationship(
        back_populates="request", order_by="IssuedDocument.id"
    )

    __mapper_args__ = {"version_id_col": version}


class RequestAttachment(Base):
    __tablename__ = "request_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("requests.id", ondelete="CASCADE"), index=True)
    kind: Mapped[AttachmentKind] = enum_col(AttachmentKind, default=AttachmentKind.requirement)
    requirement_key: Mapped[str | None] = mapped_column(String(60))
    original_filename: Mapped[str] = mapped_column(String(255))
    storage_key: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int]
    sha256: Mapped[str] = mapped_column(String(64))
    review_status: Mapped[ReviewStatus] = enum_col(ReviewStatus, default=ReviewStatus.pending)
    uploaded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime]
    deleted_at: Mapped[datetime | None]

    request: Mapped[Request] = relationship(back_populates="attachments")


class RequestStatusHistory(Base):
    __tablename__ = "request_status_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("requests.id", ondelete="CASCADE"), index=True)
    from_status: Mapped[RequestStatus | None] = enum_col(RequestStatus, nullable=True)
    to_status: Mapped[RequestStatus] = enum_col(RequestStatus)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    remarks: Mapped[str | None] = mapped_column(Text)
    is_internal: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime]

    request: Mapped[Request] = relationship(back_populates="history")
    actor: Mapped[User | None] = relationship()


class Payment(TimestampMixin, Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("requests.id", ondelete="CASCADE"), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    method: Mapped[PaymentMethod] = enum_col(PaymentMethod)
    payer_reference: Mapped[str | None] = mapped_column(String(100))
    paid_at: Mapped[datetime | None]
    proof_attachment_id: Mapped[int | None] = mapped_column(ForeignKey("request_attachments.id"))
    status: Mapped[PaymentStatus] = enum_col(PaymentStatus, default=PaymentStatus.pending)
    verified_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    verified_at: Mapped[datetime | None]
    remarks: Mapped[str | None] = mapped_column(String(500))

    request: Mapped[Request] = relationship(back_populates="payments")
    proof: Mapped[RequestAttachment | None] = relationship()
    verified_by: Mapped[User | None] = relationship()


class IssuedDocument(Base):
    """A slip or e-document the Registrar handed out, identified by the code in its QR."""

    __tablename__ = "issued_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("requests.id", ondelete="CASCADE"), index=True)
    kind: Mapped[IssuedKind] = enum_col(IssuedKind)
    attachment_id: Mapped[int | None] = mapped_column(ForeignKey("request_attachments.id"))
    issued_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    issued_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]
    revoke_reason: Mapped[str | None] = mapped_column(String(300))

    request: Mapped[Request] = relationship(back_populates="issued_documents")
    attachment: Mapped[RequestAttachment | None] = relationship()
