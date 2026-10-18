"""Report figures and CSV exports. All date ranges are Manila calendar days, inclusive."""
import csv
import io
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from fastapi import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError
from app.core.security import utcnow
from app.models import (
    TERMINAL_STATUSES,
    Payment,
    PaymentStatus,
    Request,
    RequestStatus,
    Student,
)
from app.schemas.admin import DayRow, DocumentRow, MethodRow, ReportSummary, Totals
from app.services.business_days import MANILA, manila_date
from app.services.payments import METHOD_LABELS

S = RequestStatus
MAX_RANGE_DAYS = 366


def resolve_range(date_from: date | None, date_to: date | None) -> tuple[date, date]:
    today = manila_date(utcnow())
    date_to = date_to or today
    date_from = date_from or date_to - timedelta(days=29)
    if date_from > date_to:
        raise AppError("VALIDATION_ERROR", "Some fields are invalid.", 422,
                       [{"field": "date_from", "message": "The start date must be on or before the end date."}])
    if (date_to - date_from).days >= MAX_RANGE_DAYS:
        raise AppError("VALIDATION_ERROR", "Some fields are invalid.", 422,
                       [{"field": "date_from", "message": "Choose a range of one year or less."}])
    return date_from, date_to


def bounds(date_from: date, date_to: date) -> tuple[datetime, datetime]:
    """[start, end) instants covering the Manila days from date_from through date_to."""
    return (datetime.combine(date_from, time.min, tzinfo=MANILA),
            datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=MANILA))


def _days_between(start: datetime, end: datetime) -> float:
    return (end - start).total_seconds() / 86400


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 1) if values else None


def summary(db: Session, date_from: date, date_to: date) -> ReportSummary:
    start, end = bounds(date_from, date_to)
    opts = selectinload(Request.document_type)
    submitted = db.execute(
        select(Request).where(Request.submitted_at >= start, Request.submitted_at < end).options(opts)
    ).scalars().all()
    closed = db.execute(
        select(Request).where(Request.status.in_(TERMINAL_STATUSES), Request.completed_at >= start,
                              Request.completed_at < end).options(opts)
    ).scalars().all()
    payments = db.execute(
        select(Payment).where(Payment.status == PaymentStatus.verified, Payment.verified_at >= start,
                              Payment.verified_at < end).options(selectinload(Payment.request).selectinload(Request.document_type))
    ).scalars().all()
    open_now = db.scalar(select(func.count()).select_from(Request).where(
        Request.status.not_in([*TERMINAL_STATUSES, S.draft])))

    completed = [r for r in closed if r.status == S.completed]
    turnaround = [_days_between(r.submitted_at, r.completed_at) for r in completed if r.submitted_at]
    on_time = [manila_date(r.completed_at) <= r.estimated_release_date for r in completed if r.estimated_release_date]

    docs: dict[str, dict] = {}

    def doc_row(r: Request) -> dict:
        return docs.setdefault(r.document_type.code, {
            "code": r.document_type.code, "name": r.document_type.name, "submitted": 0, "completed": 0,
            "revenue": Decimal("0"), "turnaround": [],
        })

    for r in submitted:
        doc_row(r)["submitted"] += 1
    for r in completed:
        row = doc_row(r)
        row["completed"] += 1
        if r.submitted_at:
            row["turnaround"].append(_days_between(r.submitted_at, r.completed_at))
    methods: dict[str, list] = defaultdict(lambda: [0, Decimal("0")])
    for p in payments:
        doc_row(p.request)["revenue"] += p.amount
        methods[p.method.value][0] += 1
        methods[p.method.value][1] += p.amount

    daily = {date_from + timedelta(days=i): [0, 0] for i in range((date_to - date_from).days + 1)}
    for r in submitted:
        daily[manila_date(r.submitted_at)][0] += 1
    for r in completed:
        daily[manila_date(r.completed_at)][1] += 1

    return ReportSummary(
        date_from=date_from,
        date_to=date_to,
        totals=Totals(
            submitted=len(submitted),
            completed=len(completed),
            rejected=sum(r.status == S.rejected for r in closed),
            cancelled=sum(r.status == S.cancelled for r in closed),
            open=open_now,
            revenue=sum((p.amount for p in payments), Decimal("0")),
            avg_turnaround_days=_avg(turnaround),
            on_time_rate=round(sum(on_time) / len(on_time), 3) if on_time else None,
        ),
        by_document=sorted(
            (DocumentRow(code=d["code"], name=d["name"], submitted=d["submitted"], completed=d["completed"],
                         revenue=d["revenue"], avg_turnaround_days=_avg(d["turnaround"])) for d in docs.values()),
            key=lambda d: (-d.submitted, d.name),
        ),
        by_method=sorted((MethodRow(method=m, count=c, amount=a) for m, (c, a) in methods.items()),
                         key=lambda m: -m.amount),
        daily=[DayRow(date=d, submitted=s, completed=c) for d, (s, c) in daily.items()],
    )


# ---------- CSV ----------

_FORMULA_START = ("=", "+", "-", "@", "\t", "\r")


def _cell(value) -> str:
    """Spreadsheet-safe text. Values typed by students could start with "=" and run as a formula in
    Excel, so those get a leading apostrophe (OWASP CSV injection guidance)."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.astimezone(MANILA).strftime("%Y-%m-%d %H:%M")
    if isinstance(value, Decimal):
        return f"{value:.2f}"
    text = str(value)
    return "'" + text if text.startswith(_FORMULA_START) else text


def csv_response(filename: str, header: list[str], rows) -> Response:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\r\n")
    writer.writerow(header)
    for row in rows:
        writer.writerow([_cell(v) for v in row])
    # UTF-8 BOM so Excel shows names like "Peñaflor" correctly.
    return Response(
        content="﻿" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "private, no-store"},
    )


def requests_rows(db: Session, date_from: date, date_to: date, statuses: list[RequestStatus]):
    start, end = bounds(date_from, date_to)
    q = (
        select(Request).where(Request.submitted_at >= start, Request.submitted_at < end)
        .options(
            selectinload(Request.student).selectinload(Student.program),
            selectinload(Request.document_type),
            selectinload(Request.payments),
            selectinload(Request.assigned_to),
        )
        .order_by(Request.submitted_at, Request.id)
    )
    if statuses:
        q = q.where(Request.status.in_(statuses))
    for r in db.execute(q).scalars():
        verified = next((p for p in r.payments if p.status == PaymentStatus.verified), None)
        yield [
            r.reference_no, r.submitted_at, r.status.value, r.document_type.code, r.document_type.name,
            r.student.student_no, r.student.full_name, r.student.program.code if r.student.program else None,
            r.copies, r.delivery_method.value, r.fee_total, verified.amount if verified else None,
            METHOD_LABELS[verified.method] if verified else None, r.estimated_release_date, r.completed_at,
            r.assigned_to.full_name if r.assigned_to else None,
        ]


REQUEST_HEADER = [
    "Reference no.", "Submitted", "Status", "Document code", "Document", "Student no.", "Student", "Program",
    "Copies", "Delivery", "Fee", "Amount paid", "Payment method", "Est. release", "Closed", "Assigned to",
]


def payments_rows(db: Session, date_from: date, date_to: date):
    start, end = bounds(date_from, date_to)
    q = (
        select(Payment).where(Payment.created_at >= start, Payment.created_at < end)
        .options(selectinload(Payment.request).selectinload(Request.student), selectinload(Payment.verified_by))
        .order_by(Payment.created_at, Payment.id)
    )
    for p in db.execute(q).scalars():
        yield [
            p.request.reference_no, p.request.student.student_no, p.request.student.full_name, METHOD_LABELS[p.method],
            p.payer_reference, p.amount, p.status.value, p.paid_at, p.created_at, p.verified_at,
            p.verified_by.display_name if p.verified_by else None, p.remarks,
        ]


PAYMENT_HEADER = [
    "Reference no.", "Student no.", "Student", "Method", "Receipt / transaction no.", "Amount", "Status", "Paid",
    "Recorded", "Checked", "Checked by", "Remarks",
]
