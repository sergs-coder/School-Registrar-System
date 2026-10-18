"""Admin-editable key/value settings with defaults."""
from sqlalchemy.orm import Session

from app.models import Setting

DEFAULTS = {
    "courier_fee_metro": 150,
    "courier_fee_provincial": 250,
    "registrar_contact": {
        "office": "Office of the University Registrar",
        "address": "275 E. Rodriguez Sr. Blvd., Quezon City, Metro Manila",
        "email": "registrar@tua.edu.ph",
        "phone": "(02) 8702-2882",
        "hours": "Mon–Fri 8:00 AM – 5:00 PM, Sat 8:00 AM – 12:00 NN",
    },
    "payment_instructions": (
        "Pay at the University Cashier, or via bank deposit / GCash / Maya using your reference number "
        "as the payment note. Upload a clear photo of your receipt."
    ),
}


def get_setting(db: Session, key: str):
    row = db.get(Setting, key)
    return row.value if row is not None else DEFAULTS.get(key)
