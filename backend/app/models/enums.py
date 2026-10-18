from enum import Enum


class Role(str, Enum):
    student = "student"
    staff = "staff"
    admin = "admin"


class Standing(str, Enum):
    enrolled = "enrolled"
    graduated = "graduated"
    inactive = "inactive"


class DocCategory(str, Enum):
    record = "record"
    certificate = "certificate"
    form = "form"


class DeliveryMethod(str, Enum):
    pickup = "pickup"
    courier = "courier"


class RequestStatus(str, Enum):
    draft = "draft"
    submitted = "submitted"
    under_review = "under_review"
    needs_correction = "needs_correction"
    resubmitted = "resubmitted"
    awaiting_payment = "awaiting_payment"
    payment_verified = "payment_verified"
    processing = "processing"
    ready_for_pickup = "ready_for_pickup"
    shipped = "shipped"
    completed = "completed"
    rejected = "rejected"
    cancelled = "cancelled"


TERMINAL_STATUSES = {RequestStatus.completed, RequestStatus.rejected, RequestStatus.cancelled}


class AttachmentKind(str, Enum):
    requirement = "requirement"
    payment_proof = "payment_proof"
    release_document = "release_document"


class ReviewStatus(str, Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"


class PaymentMethod(str, Enum):
    cashier = "cashier"
    bank_deposit = "bank_deposit"
    gcash = "gcash"
    maya = "maya"


class PaymentStatus(str, Enum):
    pending = "pending"
    verified = "verified"
    rejected = "rejected"


class AnnouncementLevel(str, Enum):
    info = "info"
    warning = "warning"
