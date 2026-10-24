from datetime import timedelta

import pytest

from app.core.security import utcnow
from app.models import Holiday, Notification, Role, Setting
from app.services.business_days import manila_date
from tests.conftest import login, make_user
from tests.test_documents import to_processing
from tests.test_staff import move

API = "/api/v1"
ALL_HOURS = [f"{h:02d}:00" for h in range(7, 19)]


def today():
    return manila_date(utcnow())


@pytest.fixture()
def open_every_day(db):
    """Slots every day so tests don't depend on the weekday or time they run at."""
    def apply(capacity=5):
        row = db.get(Setting, "pickup_schedule") or Setting(key="pickup_schedule")
        row.value = {"slots": {str(d): ALL_HOURS for d in range(7)}, "capacity": capacity, "days_ahead": 7}
        db.add(row)
        db.commit()
    apply()
    return apply


def ready_request(client, db, headers):
    ref, h = to_processing(client, db, headers)
    assert move(client, h, ref, "ready_for_pickup").status_code == 200
    return ref, h


def slots(client, headers, ref):
    r = client.get(f"{API}/requests/{ref}/pickup-slots", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def book(client, headers, ref, day, time):
    return client.put(f"{API}/requests/{ref}/pickup-appointment", headers=headers, json={"date": day, "time": time})


def tomorrow_slot(options, index=0):
    day = next(d for d in options["days"] if d["date"] == (today() + timedelta(days=1)).isoformat())
    return day["date"], day["slots"][index]["time"]


def test_book_reschedule_and_cancel(client, db, student, student_headers, open_every_day):
    ref, staff_h = ready_request(client, db, student_headers)
    options = slots(client, student_headers, ref)
    assert options["appointment"] is None and options["days"]
    day, time = tomorrow_slot(options)

    r = book(client, student_headers, ref, day, time)
    assert r.status_code == 200, r.text
    detail = r.json()
    assert detail["pickup_appointment"]["date"] == day and detail["pickup_appointment"]["time"] == time
    assert "book_pickup" in detail["allowed_actions"]
    note = db.query(Notification).filter_by(user_id=student.id, type="pickup_booked").one()
    assert note.title.endswith("Pick-up booked") and detail["pickup_appointment"]["label"] in note.body

    staff_view = client.get(f"{API}/staff/pickups", headers=staff_h, params={"date": day}).json()
    assert [(p["reference_no"], p["time"]) for p in staff_view] == [(ref, time)]

    _, later = tomorrow_slot(options, index=1)
    r = book(client, student_headers, ref, day, later)
    assert r.status_code == 200 and r.json()["pickup_appointment"]["time"] == later
    assert db.query(Notification).filter_by(type="pickup_booked").count() == 2
    assert [p["time"] for p in client.get(f"{API}/staff/pickups", headers=staff_h, params={"date": day}).json()] == [later]

    r = client.delete(f"{API}/requests/{ref}/pickup-appointment", headers=student_headers)
    assert r.status_code == 200 and r.json()["pickup_appointment"] is None
    assert client.get(f"{API}/staff/pickups", headers=staff_h, params={"date": day}).json() == []


def test_full_slots_and_capacity(client, db, student_headers, open_every_day):
    open_every_day(capacity=1)
    ref, _ = ready_request(client, db, student_headers)
    day, time = tomorrow_slot(slots(client, student_headers, ref))
    assert book(client, student_headers, ref, day, time).status_code == 200

    other = make_user(db)
    other_h = login(client, other.email)
    other_ref, _ = ready_request(client, db, other_h)
    taken = next(s for d in slots(client, other_h, other_ref)["days"] if d["date"] == day
                 for s in d["slots"] if s["time"] == time)
    assert taken["left"] == 0
    r = book(client, other_h, other_ref, day, time)
    assert r.status_code == 409 and r.json()["error"]["code"] == "SLOT_FULL"

    # The student's own booking doesn't count against them when they look again.
    own = next(s for d in slots(client, student_headers, ref)["days"] if d["date"] == day
               for s in d["slots"] if s["time"] == time)
    assert own["left"] == 1


def test_only_open_times_and_ready_requests(client, db, student_headers, open_every_day):
    ref, h = to_processing(client, db, student_headers)
    assert slots(client, student_headers, ref)["days"] == []
    tomorrow = (today() + timedelta(days=1)).isoformat()
    r = book(client, student_headers, ref, tomorrow, "09:00")
    assert r.status_code == 409 and r.json()["error"]["code"] == "PICKUP_NOT_BOOKABLE"

    assert move(client, h, ref, "ready_for_pickup").status_code == 200
    for day, time in ((tomorrow, "06:00"), (tomorrow, "09:30"), ((today() + timedelta(days=30)).isoformat(), "09:00"),
                      ((today() - timedelta(days=1)).isoformat(), "09:00")):
        r = book(client, student_headers, ref, day, time)
        assert r.status_code == 422, (day, time, r.text)

    db.add(Holiday(date=today() + timedelta(days=1), name="Test holiday"))
    db.commit()
    assert tomorrow not in {d["date"] for d in slots(client, student_headers, ref)["days"]}
    assert book(client, student_headers, ref, tomorrow, "09:00").json()["error"]["code"] == "SLOT_UNAVAILABLE"


def test_staff_cannot_book_and_students_cannot_list(client, db, student_headers, open_every_day):
    ref, staff_h = ready_request(client, db, student_headers)
    day, time = tomorrow_slot(slots(client, student_headers, ref))
    assert book(client, staff_h, ref, day, time).status_code == 403
    assert client.get(f"{API}/staff/pickups", headers=student_headers).status_code == 403
    other_h = login(client, make_user(db).email)
    assert book(client, other_h, ref, day, time).status_code == 404


def test_admin_edits_pickup_schedule(client, db):
    admin = make_user(db, role=Role.admin)
    h = login(client, admin.email)
    current = client.get(f"{API}/admin/settings", headers=h).json()
    assert current["pickup_schedule"]["capacity"] == 5 and current["pickup_schedule"]["daily_limit"] == 15 and current["pickup_schedule"]["slots"]["6"] == []
    sched = {"slots": {"0": ["10:00", "09:00"]}, "capacity": 2, "days_ahead": 10}
    r = client.put(f"{API}/admin/settings", headers=h, json={**current, "pickup_schedule": sched})
    assert r.status_code == 200, r.text
    assert r.json()["pickup_schedule"]["slots"]["0"] == ["09:00", "10:00"]
    assert r.json()["pickup_schedule"]["slots"]["3"] == []
    bad = {**sched, "slots": {"0": ["09:30"]}}
    assert client.put(f"{API}/admin/settings", headers=h, json={**current, "pickup_schedule": bad}).status_code == 422


def test_daily_limit_fills_the_day(client, db, student_headers, open_every_day):
    """Once a day has `daily_limit` bookings across all its slots, every slot that day shows full."""
    row = db.get(Setting, "pickup_schedule")
    row.value = {**row.value, "daily_limit": 2}
    db.commit()
    ref, _ = ready_request(client, db, student_headers)
    options = slots(client, student_headers, ref)
    day, first = tomorrow_slot(options)
    assert next(d for d in options["days"] if d["date"] == day)["left"] == 2
    assert book(client, student_headers, ref, day, first).status_code == 200

    second_h = login(client, make_user(db).email)
    second_ref, _ = ready_request(client, db, second_h)
    _, other_time = tomorrow_slot(slots(client, second_h, second_ref), index=3)
    assert book(client, second_h, second_ref, day, other_time).status_code == 200

    third_h = login(client, make_user(db).email)
    third_ref, _ = ready_request(client, db, third_h)
    full = next(d for d in slots(client, third_h, third_ref)["days"] if d["date"] == day)
    assert full["left"] == 0 and all(s["left"] == 0 for s in full["slots"])
    r = book(client, third_h, third_ref, day, full["slots"][5]["time"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "DAY_FULL"
    # The next day is still open.
    next_day = (today() + timedelta(days=2)).isoformat()
    assert book(client, third_h, third_ref, next_day, "09:00").status_code == 200

    # Moving within the full day is fine for someone already booked on it; cancelling frees a seat.
    assert book(client, student_headers, ref, day, full["slots"][6]["time"]).status_code == 200
    assert client.delete(f"{API}/requests/{second_ref}/pickup-appointment", headers=second_h).status_code == 200
    assert next(d for d in slots(client, third_h, third_ref)["days"] if d["date"] == day)["left"] == 1
    assert book(client, third_h, third_ref, day, other_time).status_code == 200
