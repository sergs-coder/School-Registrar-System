"""Seed demo data.  Usage:  python -m app.seed.seed [--reset]

--reset drops every table, re-runs migrations and wipes uploaded files first.
"""
import argparse
import random
import shutil
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import BASE_DIR, settings
from app.core.security import hash_password, utcnow
from app.core.storage import get_storage
from app.db.session import SessionLocal
from app.models import (
    AccountRequest,
    Announcement,
    AttachmentKind,
    DeliveryMethod,
    DocumentType,
    Holiday,
    IssuedDocument,
    IssuedKind,
    Payment,
    PaymentMethod,
    PaymentStatus,
    Program,
    Request,
    RequestAttachment,
    RequestStatus,
    ReviewStatus,
    Role,
    Setting,
    Staff,
    Standing,
    Student,
    User,
)
from app.seed import data
from app.services import pickups
from app.services.app_settings import DEFAULTS
from app.services.documents import new_code
from app.services.fees import compute_fees, make_snapshot
from app.services.locations import metro_manila
from app.services.reference_no import next_reference_no
from app.services.uploads import sha256
from app.services.workflow import approval_target, transition

S = RequestStatus
rng = random.Random(2026)
NOW = datetime.now(timezone.utc).replace(microsecond=0)

DEMO_PASSWORDS = {"student": "Student@2026", "staff": "Staff@2026", "admin": "Admin@2026"}


def sample_pdf(title: str) -> bytes:
    """A tiny valid one-page PDF used as a stand-in for uploaded scans."""
    text = title.replace("(", "").replace(")", "")
    stream = f"BT /F1 18 Tf 72 720 Td (SAMPLE UPLOAD - {text}) Tj ET".encode()
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


def reset_database() -> None:
    from alembic import command
    from alembic.config import Config

    from app.db.base import Base
    from app.db.session import engine

    Base.metadata.drop_all(engine)
    with engine.begin() as conn:
        conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
    shutil.rmtree(settings.upload_dir, ignore_errors=True)
    cfg = Config(str(BASE_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BASE_DIR / "alembic"))
    command.upgrade(cfg, "head")


# ---------------- reference data ----------------

def seed_reference(db: Session) -> None:
    for code, name, college in data.PROGRAMS:
        db.add(Program(code=code, name=name, college=college))
    for i, d in enumerate(data.DOCUMENT_TYPES):
        db.add(DocumentType(**{**d, "base_fee": Decimal(d["base_fee"])}, sort_order=i))
    for day, name in data.HOLIDAYS:
        db.add(Holiday(date=day, name=name))
    for key, value in DEFAULTS.items():
        db.add(Setting(key=key, value=value))
    db.flush()


def seed_users(db: Session) -> tuple[list[User], list[User], User]:
    hashes = {k: hash_password(v) for k, v in DEMO_PASSWORDS.items()}
    consented = NOW - timedelta(days=120)

    admin = User(email="admin@tua.edu.ph", password_hash=hashes["admin"], role=Role.admin, privacy_consent_at=consented)
    admin.staff = Staff(employee_no="EMP-0001", first_name="Teresita", last_name="Villareal", position="University Registrar")
    staff_users = [admin]
    for i, (first, last, pos) in enumerate([
        ("Ana", "Reyes", "Registrar Staff"),
        ("Benjamin", "Soriano", "Registrar Staff"),
        ("Liza", "Manalastas", "Records Officer"),
    ], start=2):
        email = "staff@tua.edu.ph" if i == 2 else f"{first.lower()}.{last.lower()}@tua.edu.ph"
        u = User(email=email, password_hash=hashes["staff"], role=Role.staff, privacy_consent_at=consented)
        u.staff = Staff(employee_no=f"EMP-{i:04d}", first_name=first, last_name=last, position=pos)
        staff_users.append(u)

    programs = db.execute(select(Program)).scalars().all()
    students: list[User] = []
    for i, (first, last) in enumerate(zip(data.FIRST_NAMES, data.LAST_NAMES)):
        entry_year = rng.choice([2019, 2020, 2021, 2022, 2023, 2024, 2025])
        student_no = f"{entry_year}-{10001 + i:05d}"
        graduated = entry_year <= 2021
        email = f"{first.lower().replace(' ', '')}.{last.lower().replace(' ', '')}@tua.edu.ph"
        u = User(
            email=email,
            student_no=student_no,
            password_hash=hashes["student"],
            role=Role.student,
            # The main demo student (index 0) has not consented yet, to show the first-login notice.
            privacy_consent_at=None if i == 0 else consented,
        )
        city, province, zipc, _ = rng.choice(data.CITIES)
        u.student = Student(
            student_no=student_no,
            first_name=first,
            middle_name=rng.choice(data.MIDDLE_NAMES),
            last_name=last,
            program_id=rng.choice(programs).id,
            year_level=None if graduated else min(4, 2026 - entry_year),
            contact_no=f"09{rng.randint(100000000, 999999999)}",
            mailing_address=f"{rng.randint(1, 250)} Mabini St., Brgy. San Roque, {city}, {province} {zipc}",
            birthdate=date(entry_year - 18, rng.randint(1, 12), rng.randint(1, 28)),
            standing=Standing.graduated if graduated else Standing.enrolled,
        )
        students.append(u)
    # Demo student: fixed, predictable identity.
    students[0].email = "juan.delacruz@tua.edu.ph"
    students[0].student_no = students[0].student.student_no = "2022-10001"
    students[0].student.standing, students[0].student.year_level = Standing.enrolled, 4
    students[0].student.program_id = next(p.id for p in programs if p.code == "BSIT")

    db.add_all(staff_users + students)
    db.flush()
    return students, staff_users, admin


# ---------------- requests ----------------

def path_to(target: RequestStatus, req: Request, courier: bool) -> list[tuple[RequestStatus, str, str | None]]:
    """Ordered (status, actor_kind, remarks) moves that take a fresh draft to `target`."""
    if target == S.draft:
        return []
    steps = [(S.submitted, "student", None)]
    if target == S.submitted:
        return steps
    if target == S.cancelled:
        return steps + [(S.cancelled, "student", rng.choice(data.CANCEL_REMARKS))]
    steps.append((S.under_review, "staff", None))
    if target == S.under_review:
        return steps
    if target == S.rejected:
        return steps + [(S.rejected, "staff", rng.choice(data.REJECTED_REMARKS))]
    if target in (S.needs_correction, S.resubmitted) or rng.random() < 0.2:
        steps.append((S.needs_correction, "staff", rng.choice(data.NEEDS_CORRECTION_REMARKS)))
        if target == S.needs_correction:
            return steps
        steps.append((S.resubmitted, "student", "Uploaded a clearer copy as requested."))
        if target == S.resubmitted:
            return steps
        steps.append((S.under_review, "staff", None))
    approve = approval_target(req)
    steps.append((approve, "staff", None))
    if target == S.awaiting_payment:
        return steps
    if approve == S.awaiting_payment:
        steps.append((S.payment_verified, "staff", None))
        if target == S.payment_verified:
            return steps
        steps.append((S.processing, "staff", None))
    if target == S.processing:
        return steps
    final = S.shipped if courier else S.ready_for_pickup
    steps.append((final, "staff", "Please bring your valid ID and reference number." if not courier else "Tracking no. LBC-7781-2345"))
    if target in (S.ready_for_pickup, S.shipped):
        return steps
    steps.append((S.completed, "staff", None))
    return steps


def fill_form(doc: DocumentType) -> dict:
    values = {}
    for f in doc.required_fields:
        if f["type"] == "select":
            values[f["key"]] = rng.choice(f["options"])
        elif f["type"] == "number":
            values[f["key"]] = rng.choice([2022, 2023, 2024, 2025])
        elif f["type"] == "checkbox":
            values[f["key"]] = False
        elif f["required"] or rng.random() < 0.4:
            samples = {
                "last_term_attended": "2nd Semester, AY 2025–2026",
                "receiving_school": "University of Santo Tomas",
                "reason": "Closer to home and better fit for my career goals.",
                "subjects": "ALL",
                "new_program": "Bachelor of Science in Computer Science",
                "details": "Medical leave as advised by my physician.",
                "current_value": "Dela Cruz, Jaun",
                "new_value": "Dela Cruz, Juan",
                "subjects_to_add": "IT 412 – Section A – MWF 1:00–2:00 PM",
            }
            values[f["key"]] = samples.get(f["key"], "Sample answer")
    return values


def _stored_pdf(db: Session, req: Request, kind: AttachmentKind, title: str, filename: str, user: User,
                at: datetime) -> RequestAttachment:
    blob = sample_pdf(title)
    att = RequestAttachment(
        request_id=req.id, kind=kind, original_filename=filename, storage_key=get_storage().put(blob),
        mime_type="application/pdf", size_bytes=len(blob), sha256=sha256(blob), uploaded_by_id=user.id, created_at=at,
        review_status=ReviewStatus.accepted if kind == AttachmentKind.release_document else ReviewStatus.pending,
    )
    db.add(att)
    db.flush()
    return att


def add_payment_proof(db: Session, req: Request, student: User, at: datetime) -> None:
    """An uploaded receipt waiting for staff; verifying the request later marks it verified."""
    method = rng.choice([PaymentMethod.gcash, PaymentMethod.gcash, PaymentMethod.maya, PaymentMethod.bank_deposit])
    proof = _stored_pdf(db, req, AttachmentKind.payment_proof, f"Receipt {req.reference_no}", "receipt.pdf", student, at)
    payment = Payment(request_id=req.id, amount=req.fee_total, method=method, status=PaymentStatus.pending,
                      payer_reference=f"{method.value[:2].upper()}-{rng.randint(10**9, 10**10 - 1)}",
                      paid_at=at - timedelta(hours=2), proof_attachment_id=proof.id, created_at=at, updated_at=at)
    payment.proof = proof
    db.add(payment)
    req.payments.append(payment)


def add_e_document(db: Session, req: Request, staff_user: User, at: datetime) -> None:
    att = _stored_pdf(db, req, AttachmentKind.release_document, req.document_type.name,
                      f"{req.document_type.code}-{req.reference_no}.pdf", staff_user, at)
    db.add(IssuedDocument(code=new_code(db), request_id=req.id, kind=IssuedKind.e_document, attachment_id=att.id,
                          issued_by_id=staff_user.id, issued_at=at))


def make_request(db: Session, student: User, doc: DocumentType, target: RequestStatus, staff: list[User],
                 created: datetime, demo: bool = False) -> Request:
    courier = doc.allow_courier and (target == S.shipped or (target != S.ready_for_pickup and rng.random() < 0.3))
    req = Request(
        reference_no=next_reference_no(db, created.year),
        student_id=student.student.id,
        document_type_id=doc.id,
        doc_type_snapshot=make_snapshot(doc),
        purpose=rng.choice(doc.purposes) if doc.purposes else "Personal copy",
        copies=1 if doc.max_copies == 1 else rng.choice([1, 1, 2, 3]),
        delivery_method=DeliveryMethod.courier if courier else DeliveryMethod.pickup,
        form_data=fill_form(doc),
        status=S.draft,
        created_at=created,
        updated_at=created,
    )
    if courier:
        city, province, zipc, region = rng.choice(data.CITIES)
        req.delivery_address = {"recipient": student.student.full_name, "contact_no": student.student.contact_no,
                                "line1": "123 Mabini St., Brgy. San Roque", "city": city, "province": province,
                                "zip": zipc, "region": region, "landmark": "Beside the barangay hall, green gate"}
        if region == "metro":
            barangays = next(c["barangays"] for c in metro_manila() if c["name"] == city)
            req.delivery_address |= {"line1": "123 Mabini St.", "barangay": rng.choice(barangays)}
    req.document_type = doc
    req.student = student.student
    req.fee_breakdown, req.fee_total = compute_fees(db, req.doc_type_snapshot, req.copies, req.delivery_method,
                                                    (req.delivery_address or {}).get("region"))
    db.add(req)
    db.flush()

    storage = get_storage()
    for spec in doc.required_attachments:
        if spec.get("required", True) or rng.random() < 0.3:
            blob = sample_pdf(spec["label"])
            db.add(RequestAttachment(
                request_id=req.id, kind=AttachmentKind.requirement, requirement_key=spec["key"],
                original_filename=f"{spec['key']}.pdf", storage_key=storage.put(blob), mime_type="application/pdf",
                size_bytes=len(blob), sha256=sha256(blob), uploaded_by_id=student.id, created_at=created,
                review_status=ReviewStatus.accepted if target not in (S.draft, S.submitted, S.under_review) else ReviewStatus.pending,
            ))

    at = created
    for status, who, remarks in path_to(target, req, courier):
        at = at + timedelta(hours=rng.randint(3, 40))
        if at > NOW:
            at = NOW - timedelta(minutes=rng.randint(5, 600))
        actor = student if who == "student" else (req.assigned_to.user if req.assigned_to else rng.choice(staff))
        if status == S.payment_verified and rng.random() < 0.7:  # the rest paid at the cashier window
            add_payment_proof(db, req, student, at - timedelta(hours=rng.randint(1, 3)))
        if status in (S.ready_for_pickup, S.shipped) and doc.allow_edocument and (demo or rng.random() < 0.6):
            add_e_document(db, req, actor, at - timedelta(minutes=30))
        transition(db, req, status, actor, remarks, at=at)
        if status == S.under_review and req.assigned_to is None:
            req.assigned_to = actor.staff  # the reviewer owns the request, as in the real flow
    if target == S.awaiting_payment and not demo and rng.random() < 0.6:
        at = min(at + timedelta(hours=rng.randint(2, 20)), NOW - timedelta(minutes=5))
        add_payment_proof(db, req, student, at)  # the demo student's is left for you to upload
    req.updated_at = at
    return req


def seed_requests(db: Session, students: list[User], staff: list[User]) -> int:
    docs = {d.code: d for d in db.execute(select(DocumentType)).scalars()}
    workers = staff[1:]  # staff do the day-to-day processing
    count = 0

    # Demo student: one request in every status.
    demo = students[0]
    demo_plan = [
        (S.draft, "COG"), (S.submitted, "COE"), (S.under_review, "GMC"), (S.needs_correction, "TOR"),
        (S.resubmitted, "CDC"), (S.awaiting_payment, "COE"), (S.payment_verified, "COG"),
        (S.processing, "TOR"), (S.ready_for_pickup, "GMC"), (S.shipped, "COG"), (S.completed, "COE"),
        (S.rejected, "TOR"), (S.cancelled, "ADD"),
    ]
    for i, (status, code) in enumerate(demo_plan):
        doc = docs[code]
        created = NOW - timedelta(days=30 - i * 2, hours=rng.randint(0, 8))
        make_request(db, demo, doc, status, workers, created, demo=True)
        count += 1

    # Everyone else: a realistic spread weighted toward active and completed work.
    weights = {
        S.submitted: 8, S.under_review: 7, S.needs_correction: 3, S.resubmitted: 2, S.awaiting_payment: 5,
        S.payment_verified: 3, S.processing: 6, S.ready_for_pickup: 5, S.completed: 12, S.rejected: 2,
        S.cancelled: 2, S.draft: 2,
    }
    statuses, w = zip(*weights.items())
    codes = list(docs)
    for student in students[1:]:
        for _ in range(rng.randint(1, 4)):
            status = rng.choices(statuses, w)[0]
            doc = docs[rng.choice(codes)]
            age = rng.randint(1, 60) if status in (S.completed, S.rejected, S.cancelled) else rng.randint(0, 20)
            make_request(db, student, doc, status, workers, NOW - timedelta(days=age, hours=rng.randint(0, 10)))
            count += 1
    return count


def seed_pickups_and_access(db: Session, students: list[User]) -> None:
    """Pick-up times for some ready requests (not the demo student's, so the demo can book one) and a
    couple of alumni access requests waiting for review."""
    db.flush()
    ready = db.execute(
        select(Request).where(Request.status == S.ready_for_pickup, Request.delivery_method == DeliveryMethod.pickup,
                              Request.student_id != students[0].student.id).order_by(Request.id)
    ).scalars().all()
    slots = [(d.date, s.time) for d in pickups.open_days(db, utcnow()) for s in d.slots][:12]
    for req, (day, time) in zip(ready[: len(ready) * 2 // 3], (slots[i % len(slots)] for i in range(len(ready)))):
        pickups.book(db, req, day, time, utcnow())

    graduate = next(u.student for u in students[1:] if u.student.standing == Standing.graduated)
    storage = get_storage()
    for st_no, first, middle, last, birthdate, email, program, year in (
        (graduate.student_no, graduate.first_name, graduate.middle_name, graduate.last_name, graduate.birthdate,
         f"{graduate.first_name.lower()}.{graduate.last_name.lower()}@gmail.com".replace(" ", ""),
         graduate.program.code if graduate.program else "BSIT", 2021),
        ("2009-04512", "Ramon", "Cruz", "Villanueva", date(1990, 3, 8), "ramon.villanueva@yahoo.com",
         "BS Accountancy", 2013),
    ):
        db.add(AccountRequest(
            student_no=st_no, first_name=first, middle_name=middle, last_name=last,
            birthdate=birthdate or date(1999, 1, 1), email=email, contact_no="09171234567", program=program,
            last_year_attended=year, standing=Standing.graduated, id_filename="valid-id.pdf",
            id_storage_key=storage.put(sample_pdf("Valid ID")), id_mime_type="application/pdf",
            created_at=NOW - timedelta(hours=rng.randint(2, 30)),
        ))


def run(reset: bool) -> None:
    if reset:
        reset_database()
    db = SessionLocal()
    try:
        if db.execute(select(User).limit(1)).first():
            print("Database already has data. Run with --reset to start over.")
            return
        seed_reference(db)
        students, staff, admin = seed_users(db)
        db.add(Announcement(
            title="Extended hours for TOR releases",
            body="The Registrar's Office is open until 7:00 PM every Wednesday in October for document pick-ups.",
            created_by_id=admin.id,
        ))
        n = seed_requests(db, students, staff)
        seed_pickups_and_access(db, students)
        db.commit()
        print(f"Seeded {len(students)} students, {len(staff)} staff/admin, {n} requests.")
        print("Demo logins:")
        print(f"  Student : juan.delacruz@tua.edu.ph (or 2022-10001) / {DEMO_PASSWORDS['student']}")
        print(f"  Staff   : staff@tua.edu.ph / {DEMO_PASSWORDS['staff']}")
        print(f"  Admin   : admin@tua.edu.ph / {DEMO_PASSWORDS['admin']}")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true")
    run(parser.parse_args().reset)
