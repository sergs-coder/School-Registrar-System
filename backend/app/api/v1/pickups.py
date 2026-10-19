"""Pick-up appointments: students book a time once their document is ready; staff see each day's list."""
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request as HttpRequest
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.v1.requests import _detail, _load
from app.core.deps import require_consent, require_staff, require_student
from app.core.errors import NotFound
from app.core.security import utcnow
from app.db.session import get_db
from app.models import PickupAppointment, Request, Role, Student, User
from app.schemas.requests import AppointmentIn, PickupDay, PickupOptions, PickupRow, RequestDetail, appointment_out
from app.services import pickups
from app.services.audit import audit
from app.services.business_days import manila_date
from app.services.notifications import dispatch_outbox, notify_student

router = APIRouter(tags=["pick-up appointments"])


@router.get("/requests/{ref}/pickup-slots", response_model=PickupOptions)
def pickup_slots(ref: str, user: User = Depends(require_consent), db: Session = Depends(get_db)):
    if user.role == Role.student and user.student is None:
        raise NotFound("Request not found.")
    req = _load(db, ref, user)
    days = pickups.open_days(db, utcnow(), exclude_request_id=req.id) if pickups.can_book(req) else []
    return PickupOptions(
        appointment=appointment_out(req.pickup_appointment),
        days=[PickupDay(date=d.date, slots=[{"time": s.time, "left": s.left} for s in d.slots]) for d in days],
    )


@router.put("/requests/{ref}/pickup-appointment", response_model=RequestDetail)
def book_pickup(ref: str, body: AppointmentIn, http: HttpRequest, tasks: BackgroundTasks,
                user: User = Depends(require_student), db: Session = Depends(get_db)):
    req = _load(db, ref, user)
    moved = req.pickup_appointment is not None
    appt = pickups.book(db, req, body.date, body.time, utcnow())
    when = pickups.label(appt)
    notify_student(db, req, "pickup_booked", "Pick-up rescheduled" if moved else "Pick-up booked",
                   f"Your pick-up time is {when}. You can change it on your request page.", email=True,
                   next_step="Bring a valid ID and your pick-up slip (or reference number) to the Registrar's Office.")
    audit(db, "pickup_booked", actor=user, entity_type="request", entity_id=ref, http=http,
          meta={"date": appt.date.isoformat(), "time": appt.time})
    db.commit()
    dispatch_outbox(db, tasks)
    return _detail(req, user)


@router.delete("/requests/{ref}/pickup-appointment", response_model=RequestDetail)
def cancel_pickup(ref: str, http: HttpRequest, user: User = Depends(require_student), db: Session = Depends(get_db)):
    req = _load(db, ref, user)
    pickups.cancel(db, req)
    audit(db, "pickup_cancelled", actor=user, entity_type="request", entity_id=ref, http=http)
    db.commit()
    return _detail(req, user)


@router.get("/staff/pickups", response_model=list[PickupRow])
def staff_pickups(day: date | None = Query(default=None, alias="date"), _: User = Depends(require_staff),
                  db: Session = Depends(get_db)):
    """Appointments on one day (default: today in Manila), earliest first."""
    rows = db.execute(
        select(PickupAppointment)
        .where(PickupAppointment.date == (day or manila_date(utcnow())))
        .options(
            selectinload(PickupAppointment.request).selectinload(Request.student).selectinload(Student.user),
            selectinload(PickupAppointment.request).selectinload(Request.document_type),
        )
        .order_by(PickupAppointment.time, PickupAppointment.id)
    ).scalars().all()
    return [
        PickupRow(time=a.time, reference_no=a.request.reference_no, student_name=a.request.student.full_name,
                  student_no=a.request.student.student_no, document_name=a.request.document_type.name,
                  copies=a.request.copies, status=a.request.status)
        for a in rows
    ]
