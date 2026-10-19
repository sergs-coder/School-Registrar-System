from datetime import timedelta

import pytest

from app.core.security import utcnow
from app.models import Notification, Request, Role
from app.services import notifications
from app.services.business_days import manila_date
from app.services.reminders import run_reminders
from tests.conftest import login, make_user
from tests.test_payments import awaiting_payment, pay
from tests.test_staff import move, staff_headers, submitted_request

API = "/api/v1"
DAY = timedelta(days=1)


@pytest.fixture()
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(notifications, "send_email",
                        lambda to, subject, text, html=None: sent.append((to, subject, text)) and False)
    return sent


def req(db, ref) -> Request:
    db.expire_all()
    return db.query(Request).filter_by(reference_no=ref).one()


def test_payment_reminders_timing_and_cap(client, db, student, student_headers, outbox):
    ref, _, _ = awaiting_payment(client, db, student_headers)
    outbox.clear()
    start = utcnow()

    assert run_reminders(db, start + DAY).action_reminders == 0  # not yet 2 days
    r = run_reminders(db, start + 2 * DAY + timedelta(minutes=1))
    assert r.action_reminders == 1 and r.emails_queued == 1
    to, subject, text = outbox[-1]
    assert to == student.email and subject.startswith("[TUA Registrar] Action needed:") and "payment is still due" in subject
    assert "ACTION NEEDED" in text and "Next: Pay the fee" in text

    assert run_reminders(db, start + 3 * DAY).action_reminders == 0  # repeats only every 2 days
    assert run_reminders(db, start + 4 * DAY + timedelta(minutes=2)).action_reminders == 1
    assert run_reminders(db, start + 6 * DAY + timedelta(minutes=3)).action_reminders == 1
    assert run_reminders(db, start + 30 * DAY).action_reminders == 0  # capped at 3
    assert req(db, ref).reminder_count == 3
    assert db.query(Notification).filter_by(type="reminder").count() == 3


def test_reminders_do_not_disturb_staff(client, db, student_headers, outbox):
    ref, _, staff_h = awaiting_payment(client, db, student_headers)
    before = req(db, ref)
    version, updated = before.version, before.updated_at
    run_reminders(db, utcnow() + 3 * DAY)
    after = req(db, ref)
    assert after.reminder_count == 1
    assert after.version == version and after.updated_at == updated  # no "someone else changed it" conflict
    assert move(client, staff_h, ref, "payment_verified", version=version).status_code == 200
    assert req(db, ref).reminder_count == 0  # a new step starts the clock over


def test_no_payment_reminder_once_receipt_uploaded(client, db, student_headers, outbox):
    ref, _, _ = awaiting_payment(client, db, student_headers)
    pay(client, student_headers, ref)
    assert run_reminders(db, utcnow() + 5 * DAY).action_reminders == 0


def test_correction_and_pickup_reminders_and_opt_out(client, db, student, student_headers, outbox):
    ref = submitted_request(client, db, student_headers)
    _, h = staff_headers(client, db)
    move(client, h, ref, "under_review")
    move(client, h, ref, "needs_correction", "Blurry ID")
    r = client.patch(f"{API}/me/profile", headers=student_headers, json={"reminder_emails": False})
    assert r.status_code == 200 and r.json()["reminder_emails"] is False
    outbox.clear()

    assert run_reminders(db, utcnow() + 3 * DAY).action_reminders == 1
    assert outbox == []  # opted out of reminder emails...
    note = db.query(Notification).filter_by(type="reminder").one()
    assert "still needs a correction" in note.title  # ...but the in-app reminder still appears

    client.patch(f"{API}/me/profile", headers=student_headers, json={"reminder_emails": True})
    client.post(f"{API}/requests/{ref}/resubmit", headers=student_headers, json={"remarks": "Fixed"})
    for to in ("under_review", "approve", "payment_verified", "processing", "ready_for_pickup"):
        assert move(client, h, ref, to).status_code == 200
    outbox.clear()
    assert run_reminders(db, utcnow() + 3 * DAY).action_reminders == 1
    assert "waiting for pick-up" in outbox[-1][1]


def test_running_late_notice_once(client, db, student_headers, outbox):
    ref = submitted_request(client, db, student_headers)
    r = req(db, ref)
    r.estimated_release_date = manila_date(utcnow()) - 3 * DAY  # Registrar is 3 days late
    db.commit()
    outbox.clear()
    first = run_reminders(db)
    assert first.late_notices == 1 and "Taking longer than expected" in outbox[-1][1]
    assert not outbox[-1][1].startswith("[TUA Registrar] Action needed")  # not the student's fault
    assert run_reminders(db).late_notices == 0  # only once per step


def test_two_days_late_is_not_yet_late(client, db, student_headers, outbox):
    ref = submitted_request(client, db, student_headers)
    r = req(db, ref)
    r.estimated_release_date = manila_date(utcnow()) - 2 * DAY
    db.commit()
    assert run_reminders(db).late_notices == 0  # "more than 2 days"


def test_admin_can_run_reminders_now(client, db, student_headers, outbox):
    awaiting_payment(client, db, student_headers)
    admin = make_user(db, role=Role.admin)
    h = login(client, admin.email)
    r = client.post(f"{API}/admin/reminders/run", headers=h)
    assert r.status_code == 200 and r.json() == {"action_reminders": 0, "late_notices": 0}
    assert client.post(f"{API}/admin/reminders/run", headers=student_headers).status_code == 403
