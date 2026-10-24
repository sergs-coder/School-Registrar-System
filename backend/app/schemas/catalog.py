from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.models import DocCategory
from app.schemas.common import ORM


class FieldDef(BaseModel):
    key: str
    label: str
    type: Literal["text", "textarea", "number", "date", "select", "checkbox"] = "text"
    required: bool = False
    options: list[str] = []
    help: str | None = None
    placeholder: str | None = None
    max_length: int | None = None


class AttachmentDef(BaseModel):
    key: str
    label: str
    required: bool = True
    accept: list[str] = ["pdf", "jpg", "png"]
    max_mb: int = 5
    help: str | None = None


class DocumentTypeOut(ORM):
    id: int
    code: str
    slug: str
    name: str
    description: str
    category: DocCategory
    base_fee: Decimal
    fee_per_copy: bool
    max_copies: int
    processing_days: int
    requires_payment: bool
    allow_courier: bool
    allow_edocument: bool
    purposes: list[str]
    required_fields: list[FieldDef]
    required_attachments: list[AttachmentDef]
    instructions: str
    # When the document would be released if the Registrar approved the request today (starts processing),
    # counting working days and skipping closed days. An example for students, not a promise.
    ready_if_approved_today: date | None = None
