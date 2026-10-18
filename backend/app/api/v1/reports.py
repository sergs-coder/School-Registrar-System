"""Admin reports, CSV exports and the audit log viewer."""
from datetime import date

from fastapi import APIRouter, Depends, Query, Request as HttpRequest
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import require_admin
from app.db.session import get_db
from app.models import AuditLog, RequestStatus, Staff, Student, User
from app.schemas.admin import AuditRow, ReportSummary
from app.schemas.common import Page
from app.services import reports
from app.services.audit import audit

router = APIRouter(prefix="/admin", tags=["reports"])


@router.get("/reports/summary", response_model=ReportSummary)
def report_summary(
    date_from: date | None = None,
    date_to: date | None = None,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return reports.summary(db, *reports.resolve_range(date_from, date_to))


@router.get("/reports/requests.csv")
def export_requests(
    http: HttpRequest,
    date_from: date | None = None,
    date_to: date | None = None,
    status_: list[RequestStatus] = Query(default=[], alias="status"),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    start, end = reports.resolve_range(date_from, date_to)
    rows = list(reports.requests_rows(db, start, end, status_))
    # Student data leaving the system is logged (RA 10173).
    audit(db, "report_exported", actor=user, entity_type="report", entity_id="requests", http=http,
          meta={"from": start.isoformat(), "to": end.isoformat(), "rows": len(rows)})
    db.commit()
    return reports.csv_response(f"requests_{start}_{end}.csv", reports.REQUEST_HEADER, rows)


@router.get("/reports/payments.csv")
def export_payments(
    http: HttpRequest,
    date_from: date | None = None,
    date_to: date | None = None,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    start, end = reports.resolve_range(date_from, date_to)
    rows = list(reports.payments_rows(db, start, end))
    audit(db, "report_exported", actor=user, entity_type="report", entity_id="payments", http=http,
          meta={"from": start.isoformat(), "to": end.isoformat(), "rows": len(rows)})
    db.commit()
    return reports.csv_response(f"payments_{start}_{end}.csv", reports.PAYMENT_HEADER, rows)


# ---------- audit logs ----------

def _audit_query(action: list[str], actor: str | None, entity: str | None, date_from: date | None,
                 date_to: date | None) -> Select:
    stmt = select(AuditLog).outerjoin(User, AuditLog.actor_id == User.id)
    if action:
        stmt = stmt.where(AuditLog.action.in_(action))
    if actor:
        like = f"%{actor.strip()}%"
        stmt = (stmt.outerjoin(Staff, Staff.user_id == User.id).outerjoin(Student, Student.user_id == User.id)
                .where(or_(User.email.ilike(like), User.student_no.ilike(like), Staff.last_name.ilike(like),
                           Staff.first_name.ilike(like), Student.last_name.ilike(like), Student.first_name.ilike(like))))
    if entity:
        stmt = stmt.where(AuditLog.entity_id.ilike(f"%{entity.strip()}%"))
    if date_from:
        stmt = stmt.where(AuditLog.created_at >= reports.bounds(date_from, date_from)[0])
    if date_to:
        stmt = stmt.where(AuditLog.created_at < reports.bounds(date_to, date_to)[1])
    return stmt


def _audit_row(a: AuditLog, users: dict[int, User]) -> AuditRow:
    u = users.get(a.actor_id) if a.actor_id else None
    return AuditRow(
        id=a.id, created_at=a.created_at, action=a.action, actor_id=a.actor_id,
        actor_name=u.display_name if u else None, actor_email=u.email if u else None, actor_role=u.role if u else None,
        entity_type=a.entity_type, entity_id=a.entity_id, ip=a.ip, user_agent=a.user_agent, meta=a.meta or {},
    )


def _actors(db: Session, logs: list[AuditLog]) -> dict[int, User]:
    ids = {a.actor_id for a in logs if a.actor_id}
    if not ids:
        return {}
    rows = db.execute(
        select(User).where(User.id.in_(ids)).options(selectinload(User.student), selectinload(User.staff))
    ).scalars()
    return {u.id: u for u in rows}


@router.get("/audit-logs", response_model=Page[AuditRow])
def list_audit_logs(
    action: list[str] = Query(default=[]),
    actor: str | None = Query(default=None, max_length=100),
    entity: str | None = Query(default=None, max_length=100),
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = _audit_query(action, actor, entity, date_from, date_to)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    logs = db.execute(
        stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).scalars().all()
    users = _actors(db, logs)
    return Page(items=[_audit_row(a, users) for a in logs], total=total, page=page, page_size=page_size)


@router.get("/audit-logs/actions", response_model=list[str])
def audit_actions(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.execute(select(AuditLog.action).distinct().order_by(AuditLog.action)).scalars().all()


@router.get("/audit-logs.csv")
def export_audit_logs(
    http: HttpRequest,
    action: list[str] = Query(default=[]),
    actor: str | None = Query(default=None, max_length=100),
    entity: str | None = Query(default=None, max_length=100),
    date_from: date | None = None,
    date_to: date | None = None,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    start, end = reports.resolve_range(date_from, date_to)  # exports are always bounded to a year
    logs = db.execute(
        _audit_query(action, actor, entity, start, end).order_by(AuditLog.created_at, AuditLog.id)
    ).scalars().all()
    users = _actors(db, logs)
    rows = [
        [r.created_at, r.action, r.actor_name, r.actor_email, r.actor_role.value if r.actor_role else None,
         r.entity_type, r.entity_id, r.ip, r.user_agent, r.meta]
        for r in (_audit_row(a, users) for a in logs)
    ]
    audit(db, "audit_log_exported", actor=user, entity_type="report", entity_id="audit_logs", http=http,
          meta={"from": start.isoformat(), "to": end.isoformat(), "rows": len(rows)})
    db.commit()
    header = ["Time", "Action", "Actor", "Actor email", "Role", "Entity type", "Entity", "IP", "User agent", "Details"]
    return reports.csv_response(f"audit_log_{start}_{end}.csv", header, rows)
