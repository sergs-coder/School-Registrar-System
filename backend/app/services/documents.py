"""Pick-up slips, watermarked e-documents and the verification codes printed on both as QR codes.

Codes are 16 random base32 characters (80 bits), so they can't be guessed or enumerated, and are
shown grouped as XXXX-XXXX-XXXX-XXXX. E-documents are stored clean and stamped on every download.
"""
import base64
import io
import re
import secrets
from datetime import datetime

from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.constants import UserAccessPermissions
from pypdf.errors import PdfReadError
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.core.security import utcnow
from app.models import IssuedDocument, IssuedKind, Request, RequestStatus, User
from app.services.business_days import MANILA

BLUE = HexColor("#1c3785")
GOLD = HexColor("#d4a017")
INK = HexColor("#0f172a")
MUTED = HexColor("#475569")
LINE = HexColor("#cbd5e1")

UNIVERSITY = "Trinity University of Asia"
OFFICE = "Office of the University Registrar"
# Statuses in which the student already has (or can claim) the document, so the e-copy is released too.
RELEASED = {RequestStatus.ready_for_pickup, RequestStatus.shipped, RequestStatus.completed}
# Staff may attach the e-copy once the document is being prepared.
EDOC_UPLOAD_STATUSES = {RequestStatus.processing, *RELEASED}


# ---------- codes ----------

def new_code(db: Session) -> str:
    while True:
        code = base64.b32encode(secrets.token_bytes(10)).decode()
        if db.execute(select(IssuedDocument.id).where(IssuedDocument.code == code)).first() is None:
            return code


def normalize_code(raw: str) -> str:
    """Accepts any grouping/case and forgives digits that look like base32 letters."""
    return re.sub(r"[^A-Z2-7]", "", raw.upper().translate(str.maketrans("018", "OIB")))


def display_code(code: str) -> str:
    return "-".join(code[i:i + 4] for i in range(0, len(code), 4))


def verify_url(code: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/verify/{display_code(code)}"


def _manila(dt: datetime) -> str:
    return dt.astimezone(MANILA).strftime("%b %d, %Y %I:%M %p").replace(" 0", " ")


def issue(db: Session, req: Request, kind: IssuedKind, actor: User | None, attachment_id: int | None = None) -> IssuedDocument:
    doc = IssuedDocument(code=new_code(db), request_id=req.id, kind=kind, attachment_id=attachment_id,
                         issued_by_id=actor.id if actor else None, issued_at=utcnow())
    db.add(doc)
    req.issued_documents.append(doc)
    return doc


def active(req: Request, kind: IssuedKind) -> IssuedDocument | None:
    return next((d for d in reversed(req.issued_documents) if d.kind == kind and d.revoked_at is None), None)


def revoke(doc: IssuedDocument, reason: str) -> None:
    doc.revoked_at = utcnow()
    doc.revoke_reason = reason[:300]


# ---------- drawing helpers ----------

def _qr(c: canvas.Canvas, value: str, x: float, y: float, size: float) -> None:
    widget = QrCodeWidget(value, barLevel="M", barBorder=0)
    x1, y1, x2, y2 = widget.getBounds()
    drawing = Drawing(size, size, transform=[size / (x2 - x1), 0, 0, size / (y2 - y1), 0, 0])
    drawing.add(widget)
    renderPDF.draw(drawing, c, x, y)


def _fit(c: canvas.Canvas, text: str, font: str, size: float, width: float) -> str:
    """Truncates text with an ellipsis so it never runs past `width`."""
    if c.stringWidth(text, font, size) <= width:
        return text
    while text and c.stringWidth(text + "…", font, size) > width:
        text = text[:-1]
    return text + "…"


# ---------- pick-up slip ----------

def pickup_slip_pdf(req: Request, slip: IssuedDocument, contact: dict, ready_at: datetime | None) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    c.setTitle(f"Pick-up slip {req.reference_no}")
    c.setAuthor(f"{UNIVERSITY} – {OFFICE}")

    left, right = 18 * mm, width - 18 * mm
    top = height - 18 * mm
    box_h = 138 * mm
    bottom = top - box_h

    # Card outline + header band
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.roundRect(left, bottom, right - left, box_h, 4 * mm, stroke=1, fill=0)
    band_h = 20 * mm
    c.setFillColor(BLUE)
    c.roundRect(left, top - band_h, right - left, band_h, 4 * mm, stroke=0, fill=1)
    c.rect(left, top - band_h, right - left, 5 * mm, stroke=0, fill=1)  # square off the bottom corners
    c.setFillColor(GOLD)
    c.rect(left, top - band_h - 1.2 * mm, right - left, 1.2 * mm, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(left + 7 * mm, top - 9 * mm, UNIVERSITY.upper())
    c.setFont("Helvetica", 9.5)
    c.drawString(left + 7 * mm, top - 14.5 * mm, OFFICE)
    c.setFont("Helvetica-Bold", 15)
    c.drawRightString(right - 7 * mm, top - 12 * mm, "PICK-UP SLIP")

    # Reference number
    x = left + 7 * mm
    y = top - band_h - 12 * mm
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8.5)
    c.drawString(x, y, "REFERENCE NUMBER")
    c.setFillColor(INK)
    c.setFont("Courier-Bold", 22)
    c.drawString(x, y - 9 * mm, req.reference_no)

    # QR (right column)
    qr_size = 40 * mm
    qr_x = right - 7 * mm - qr_size
    qr_y = y - qr_size + 3 * mm
    _qr(c, verify_url(slip.code), qr_x, qr_y, qr_size)
    c.setFont("Helvetica", 7.5)
    c.setFillColor(MUTED)
    c.drawCentredString(qr_x + qr_size / 2, qr_y - 4 * mm, "Scan to verify")
    c.setFont("Courier-Bold", 8.5)
    c.setFillColor(INK)
    c.drawCentredString(qr_x + qr_size / 2, qr_y - 8 * mm, display_code(slip.code))

    # Details
    student = req.student
    rows = [
        ("Student", student.full_name),
        ("Student no.", student.student_no),
        ("Program", student.program.code if student.program else "—"),
        ("Document", req.document_type.name),
        ("Copies", str(req.copies)),
        ("Ready since", _manila(ready_at) if ready_at else "—"),
    ]
    if req.pickup_appointment:
        from app.services.pickups import label

        rows.append(("Pick-up time", label(req.pickup_appointment)))
    label_w = 28 * mm
    value_w = qr_x - 6 * mm - (x + label_w)
    row_y = y - 20 * mm
    for label, value in rows:
        c.setFont("Helvetica", 9)
        c.setFillColor(MUTED)
        c.drawString(x, row_y, label)
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(INK)
        c.drawString(x + label_w, row_y, _fit(c, value, "Helvetica-Bold", 10, value_w))
        row_y -= 6.5 * mm

    # Claim instructions
    row_y -= 2 * mm
    c.setStrokeColor(LINE)
    c.line(x, row_y + 3 * mm, right - 7 * mm, row_y + 3 * mm)
    c.setFont("Helvetica-Bold", 9.5)
    c.setFillColor(INK)
    c.drawString(x, row_y - 2 * mm, "Where to claim")
    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED)
    lines = [
        f"{contact.get('office', OFFICE)}, {contact.get('address', '')}".rstrip(", "),
        f"Hours: {contact.get('hours', '')}  ·  {contact.get('phone', '')}".rstrip(" ·"),
    ]
    ly = row_y - 7 * mm
    for line in lines:
        c.drawString(x, ly, _fit(c, line, "Helvetica", 9, right - 7 * mm - x))
        ly -= 4.8 * mm
    ly -= 1.5 * mm
    c.setFont("Helvetica-Bold", 9.5)
    c.setFillColor(INK)
    c.drawString(x, ly, "What to bring")
    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED)
    ly -= 5 * mm
    for line in (
        "•  This slip (printed or on your phone) and a valid school or government-issued ID.",
        "•  Claiming for someone else? Bring their signed authorization letter, a copy of their ID, and your own ID.",
    ):
        c.drawString(x, ly, _fit(c, line, "Helvetica", 9, right - 7 * mm - x))
        ly -= 4.8 * mm

    # Footer
    c.setFont("Helvetica", 7.5)
    c.setFillColor(MUTED)
    c.drawString(x, bottom + 5 * mm, f"Issued {_manila(slip.issued_at)}  ·  Verify at {verify_url(slip.code)}")

    # Cut line
    c.setDash(3, 3)
    c.setStrokeColor(LINE)
    c.line(left, bottom - 8 * mm, right, bottom - 8 * mm)
    c.setDash()
    c.setFont("Helvetica", 7)
    c.drawCentredString(width / 2, bottom - 12 * mm, "Cut along the dotted line. Present this slip at the Registrar’s window.")

    c.showPage()
    c.save()
    return buf.getvalue()


# ---------- e-documents ----------

def check_release_pdf(data: bytes) -> int:
    """Raises unless `data` is a readable, unprotected PDF. Returns its page count."""
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise AppError("PDF_PROTECTED", "This PDF is password-protected. Upload an unprotected copy.", 422)
        pages = len(reader.pages)
    except (PdfReadError, ValueError, KeyError, TypeError):
        raise AppError("PDF_UNREADABLE", "This PDF couldn’t be read. Export it again and retry.", 422)
    if pages == 0:
        raise AppError("PDF_UNREADABLE", "This PDF has no pages.", 422)
    return pages


def _overlay(width: float, height: float, req: Request, doc: IssuedDocument) -> PdfReader:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(width, height))

    # Diagonal mark across the page
    c.saveState()
    c.setFillColor(BLUE)
    c.setFillAlpha(0.07)
    c.translate(width / 2, height / 2)
    c.rotate(35)
    size = min(width, height) / 11
    c.setFont("Helvetica-Bold", size)
    c.drawCentredString(0, size * 0.6, "TUA E-DOCUMENT")
    c.setFont("Helvetica-Bold", size * 0.45)
    c.drawCentredString(0, -size * 0.5, req.reference_no)
    c.restoreState()

    # Issuance strip along the bottom edge
    # Tall enough for a ~14 mm QR (the smallest phones scan reliably), kept clear of the edge printers can't reach.
    strip = 54
    qr = 40
    c.saveState()
    c.setFillColor(white)
    c.setFillAlpha(0.88)
    c.rect(0, 0, width, strip, stroke=0, fill=1)
    c.restoreState()
    c.setStrokeColor(GOLD)
    c.setLineWidth(1)
    c.line(0, strip, width, strip)
    _qr(c, verify_url(doc.code), width - qr - 16, 8, qr)
    text_w = width - qr - 44
    student = req.student
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(18, 32, _fit(c, f"Electronically issued by the {OFFICE}, {UNIVERSITY}, to {student.full_name} "
                                 f"({student.student_no}) on {_manila(doc.issued_at)}.", "Helvetica-Bold", 7, text_w))
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 6.5)
    c.drawString(18, 20, _fit(c, f"Ref. {req.reference_no}  ·  Code {display_code(doc.code)}  ·  "
                                f"Verify at {verify_url(doc.code)}", "Helvetica", 6.5, text_w))
    c.showPage()
    c.save()
    buf.seek(0)
    return PdfReader(buf)


def watermark_pdf(original: bytes, req: Request, doc: IssuedDocument) -> bytes:
    """Stamps every page and locks the copy against editing (printing and copying text stay allowed)."""
    reader = PdfReader(io.BytesIO(original))
    writer = PdfWriter()
    for page in reader.pages:
        page.transfer_rotation_to_content()
        box = page.mediabox
        overlay = _overlay(float(box.width), float(box.height), req, doc).pages[0]
        if box.left or box.bottom:
            overlay.add_transformation(Transformation().translate(float(box.left), float(box.bottom)))
        page.merge_page(overlay)
        writer.add_page(page)
    writer.add_metadata({
        "/Title": f"{req.document_type.name} – {req.reference_no}",
        "/Author": f"{UNIVERSITY} – {OFFICE}",
        "/Subject": f"Verification code {display_code(doc.code)}",
    })
    allowed = (
        UserAccessPermissions.PRINT
        | UserAccessPermissions.PRINT_TO_REPRESENTATION
        | UserAccessPermissions.EXTRACT_TEXT_AND_GRAPHICS
    )
    writer.encrypt(user_password="", owner_password=secrets.token_urlsafe(24), permissions_flag=allowed,
                   algorithm="AES-256")
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
