"""Bulk student accounts from the Registrar's enrollment list (CSV).

Every row is checked first; nothing is saved unless the admin confirms. Rows whose student number or email
already has an account are skipped, never overwritten, so the same term's list can be uploaded again safely.
"""
import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import hash_password, new_opaque_token
from app.models import Program, Role, Standing, Student, User
from app.schemas.accounts import STUDENT_NO

MAX_BYTES = 2 * 1024 * 1024
MAX_ROWS = 5000
REQUIRED = ("student_no", "email", "first_name", "last_name")
OPTIONAL = ("middle_name", "suffix", "program", "year_level", "birthdate", "contact_no")
COLUMNS = REQUIRED + OPTIONAL
# Headers people commonly type instead of ours.
ALIASES = {"student_number": "student_no", "studentno": "student_no", "email_address": "email",
           "firstname": "first_name", "lastname": "last_name", "middlename": "middle_name",
           "program_code": "program", "course": "program", "year": "year_level",
           "date_of_birth": "birthdate", "birth_date": "birthdate", "mobile": "contact_no", "contact": "contact_no"}
MOBILE = re.compile(r"^(\+63|0)9\d{9}$")
LENGTHS = {"first_name": 100, "middle_name": 100, "last_name": 100, "suffix": 10}


@dataclass
class Row:
    line: int
    student_no: str
    email: str
    name: str
    status: str  # "create" | "skip" | "error"
    messages: list[str] = field(default_factory=list)
    values: dict = field(default_factory=dict, repr=False)


def _decode(raw: bytes) -> str:
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1252")  # Excel's "CSV" on Windows; keeps ñ in names


def _header(name: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")
    return ALIASES.get(key, key)


def _date(v: str) -> date:
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(v, fmt).date()
        except ValueError:
            pass
    raise ValueError


def parse(db: Session, raw: bytes) -> list[Row]:
    if len(raw) > MAX_BYTES:
        raise AppError("FILE_TOO_LARGE", "The file is over 2 MB. Split it into smaller files.", 413)
    reader = csv.reader(io.StringIO(_decode(raw)))
    header = next(reader, None)
    if not header:
        raise AppError("EMPTY_FILE", "The file is empty.", 422)
    keys = [_header(h) for h in header]
    missing = [c for c in REQUIRED if c not in keys]
    if missing:
        raise AppError("MISSING_COLUMNS", f"The first row must name the columns. Missing: {', '.join(missing)}.", 422)

    programs = {}
    for p in db.execute(select(Program)).scalars():
        programs[p.code.lower()] = p
        programs[p.name.lower()] = p
    rows: list[Row] = []
    for line, cells in enumerate(reader, start=2):
        if not any(c.strip() for c in cells):
            continue
        if len(rows) >= MAX_ROWS:
            raise AppError("TOO_MANY_ROWS", f"Up to {MAX_ROWS} students per file. Split it into smaller files.", 422)
        v = {k: (cells[i].strip() if i < len(cells) else "") for i, k in enumerate(keys) if k in COLUMNS}
        rows.append(_check(line, v, programs))

    # Duplicates within the file, then against existing accounts.
    seen: dict[tuple[str, str], int] = {}
    for r in rows:
        for kind, value in (("student number", r.student_no.upper()), ("email", r.email.lower())):
            if not value:
                continue
            if (kind, value) in seen:
                r.status = "error"
                r.messages.append(f"Same {kind} as line {seen[kind, value]}.")
            else:
                seen[kind, value] = r.line
    numbers = {r.student_no.upper() for r in rows if r.status == "create"}
    emails = {r.email.lower() for r in rows if r.status == "create"}
    taken_numbers = set(db.execute(select(func.upper(Student.student_no)).where(
        func.upper(Student.student_no).in_(numbers))).scalars()) if numbers else set()
    taken_numbers |= set(db.execute(select(func.upper(User.student_no)).where(
        func.upper(User.student_no).in_(numbers))).scalars()) if numbers else set()
    taken_emails = set(db.execute(select(func.lower(User.email)).where(
        func.lower(User.email).in_(emails))).scalars()) if emails else set()
    for r in rows:
        if r.status != "create":
            continue
        if r.student_no.upper() in taken_numbers:
            r.status = "skip"
            r.messages.append("This student number already has an account.")
        elif r.email.lower() in taken_emails:
            r.status = "skip"
            r.messages.append("This email already belongs to an account.")
    return rows


def _check(line: int, v: dict, programs: dict) -> Row:
    errors = []
    for col in REQUIRED:
        if not v.get(col):
            errors.append(f"{col.replace('_', ' ').capitalize()} is required.")
    student_no = v.get("student_no", "")
    if student_no and not re.match(STUDENT_NO, student_no):
        errors.append("Student number can only have letters, digits and dashes (4–20 characters).")
    email = v.get("email", "")
    if email:
        try:
            email = validate_email(email, check_deliverability=False).normalized.lower()
        except EmailNotValidError:
            errors.append("Email isn't a valid address.")
    for col, limit in LENGTHS.items():
        if len(v.get(col, "")) > limit:
            errors.append(f"{col.replace('_', ' ').capitalize()} is longer than {limit} characters.")

    values = {"student_no": student_no, "email": email, "first_name": v.get("first_name", ""),
              "last_name": v.get("last_name", ""), "middle_name": v.get("middle_name") or None,
              "suffix": v.get("suffix") or None, "program_id": None, "year_level": None, "birthdate": None,
              "contact_no": v.get("contact_no") or None}
    if v.get("program"):
        program = programs.get(v["program"].lower())
        if program is None:
            errors.append(f"Unknown program “{v['program']}”. Use a program code from the catalog.")
        else:
            values["program_id"] = program.id
    if v.get("year_level"):
        if v["year_level"].isdigit() and 1 <= int(v["year_level"]) <= 6:
            values["year_level"] = int(v["year_level"])
        else:
            errors.append("Year level must be a number from 1 to 6.")
    if v.get("birthdate"):
        try:
            values["birthdate"] = _date(v["birthdate"])
            if not date(1900, 1, 1) <= values["birthdate"] <= date.today():
                raise ValueError
        except ValueError:
            errors.append("Birth date must be a real date, written as YYYY-MM-DD.")
    if values["contact_no"] and not MOBILE.match(values["contact_no"]):
        errors.append("Contact no. must be a PH mobile number, e.g. 09171234567.")

    name = " ".join(p for p in (values["first_name"], values["last_name"]) if p)
    return Row(line=line, student_no=student_no, email=email, name=name,
               status="error" if errors else "create", messages=errors, values=values)


def create(db: Session, rows: list[Row]) -> list[User]:
    """Adds an account and student record for every "create" row. The caller commits."""
    # Unusable random password until they set their own through the emailed link. Nobody knows it, so one
    # hash serves the whole file (Argon2 is deliberately slow: thousands of hashes would take minutes).
    unusable = hash_password(new_opaque_token())
    users = []
    for r in rows:
        if r.status != "create":
            continue
        v = r.values
        u = User(email=v["email"], student_no=v["student_no"], role=Role.student, password_hash=unusable)
        u.student = Student(standing=Standing.enrolled, **{k: v[k] for k in (
            "student_no", "first_name", "middle_name", "last_name", "suffix", "program_id", "year_level",
            "birthdate", "contact_no")})
        db.add(u)
        users.append(u)
    db.flush()
    return users
