from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import DeliveryMethod, DocumentType
from app.services.app_settings import get_setting


def make_snapshot(doc_type: DocumentType) -> dict:
    """Frozen copy of the pricing/processing terms a request was submitted under."""
    return {
        "code": doc_type.code,
        "name": doc_type.name,
        "base_fee": str(doc_type.base_fee),
        "fee_per_copy": doc_type.fee_per_copy,
        "processing_days": doc_type.processing_days,
        "requires_payment": doc_type.requires_payment,
    }


def compute_fees(
    db: Session, snapshot: dict, copies: int, delivery_method: DeliveryMethod, region: str | None
) -> tuple[list[dict], Decimal]:
    lines: list[dict] = []
    base = Decimal(snapshot["base_fee"] or 0)
    if base > 0 and snapshot.get("requires_payment", True):
        if snapshot["fee_per_copy"]:
            lines.append({"label": f"{snapshot['name']} × {copies}", "amount": str(base * copies)})
        else:
            lines.append({"label": snapshot["name"], "amount": str(base)})
    if delivery_method == DeliveryMethod.courier:
        key = "courier_fee_provincial" if region == "provincial" else "courier_fee_metro"
        label = "Courier (Provincial)" if region == "provincial" else "Courier (Metro Manila)"
        lines.append({"label": label, "amount": str(Decimal(str(get_setting(db, key))))})
    total = sum((Decimal(line["amount"]) for line in lines), Decimal("0"))
    return lines, total.quantize(Decimal("0.01"))
