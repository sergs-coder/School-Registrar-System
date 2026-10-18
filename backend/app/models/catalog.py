from decimal import Decimal

from sqlalchemy import JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.models.enums import DocCategory
from app.models.user import enum_col


class DocumentType(TimestampMixin, Base):
    __tablename__ = "document_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(150))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[DocCategory] = enum_col(DocCategory)
    base_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"))
    fee_per_copy: Mapped[bool] = mapped_column(default=True)
    max_copies: Mapped[int] = mapped_column(default=5)
    processing_days: Mapped[int] = mapped_column(default=3)
    requires_payment: Mapped[bool] = mapped_column(default=True)
    allow_courier: Mapped[bool] = mapped_column(default=True)
    allow_edocument: Mapped[bool] = mapped_column(default=False)
    # ["Employment", "Further studies", ...]; "Other" is always allowed with free text.
    purposes: Mapped[list] = mapped_column(JSON, default=list)
    # [{"key","label","type","required","options","help","placeholder"}]
    required_fields: Mapped[list] = mapped_column(JSON, default=list)
    # [{"key","label","required","accept":["pdf","jpg","png"],"max_mb","help"}]
    required_attachments: Mapped[list] = mapped_column(JSON, default=list)
    instructions: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(default=True, index=True)
    sort_order: Mapped[int] = mapped_column(default=0)
