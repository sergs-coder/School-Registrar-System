from datetime import date, timedelta

from app.models import AuditLog, Notification
from tests.conftest import login, make_user
from tests.test_staff import move, staff_headers, submitted_request

API = "/api/v1"


def awaiting_payment(client, db, student_headers):
    ref = submitted_request(client, db, student_headers)
    staff, h = staff_headers(client, db)
    move(client, h, ref, "under_review")
    assert move(client, h, ref, "approve").json()["status"] == "awaiting_payment"
    return ref, staff, h


def pay(client, headers, ref, *, method="gcash", reference="GC-12345", paid_on=None, file=None):
    from app.seed.seed import sample_pdf

    return client.post(
        f"{API}/requests/{ref}/payments",
        headers=headers,
        data={"method": method, "payer_reference": reference, "paid_on": (paid_on or date.today()).isoformat()},
        files={"file": file or ("receipt.pdf", sample_pdf("receipt"), "application/pdf")},
    )


def test_student_uploads_proof_once(client, db, student_headers):
    ref, _, _ = awaiting_payment(client, db, student_headers)
    before = client.get(f"{API}/requests/{ref}", headers=student_headers).json()
    assert "pay" in before["allowed_actions"] and before["payments"] == []

    r = pay(client, student_headers, ref)
    assert r.status_code == 201, r.text
    detail = r.json()
    payment = detail["payments"][0]
    assert payment["status"] == "pending" and payment["method"] == "gcash" and payment["amount"] == "100.00"
    assert payment["proof"]["kind"] == "payment_proof"
    assert "pay" not in detail["allowed_actions"]
    assert detail["history"][-1]["remarks"].startswith("Proof of payment uploaded")

    again = pay(client, student_headers, ref)
    assert again.status_code == 409 and again.json()["error"]["code"] == "PAYMENT_PENDING"


def test_payment_validation(client, db, student_headers):
    ref = submitted_request(client, db, student_headers)
    r = pay(client, student_headers, ref)
    assert r.status_code == 409 and r.json()["error"]["code"] == "PAYMENT_NOT_DUE"

    ref, _, _ = awaiting_payment(client, db, student_headers)
    r = pay(client, student_headers, ref, paid_on=date.today() + timedelta(days=3))
    assert r.status_code == 422 and r.json()["error"]["details"][0]["field"] == "paid_on"
    r = pay(client, student_headers, ref, file=("receipt.pdf", b"GIF89a fake", "application/pdf"))
    assert r.status_code == 415
    r = pay(client, student_headers, ref, reference="   ")
    assert r.status_code == 422

    other = make_user(db)
    assert pay(client, login(client, other.email), ref).status_code == 404  # not their request


def test_staff_sees_pending_payment_and_verifies(client, db, student_headers):
    ref, staff, h = awaiting_payment(client, db, student_headers)
    pay(client, student_headers, ref)

    assert client.get(f"{API}/staff/dashboard", headers=h).json()["payments_to_verify"] == 1
    page = client.get(f"{API}/staff/requests", headers=h, params={"payment": "pending"}).json()
    assert page["total"] == 1 and page["items"][0]["payment_pending"] is True

    version = client.get(f"{API}/staff/requests/{ref}", headers=h).json()["version"]
    r = move(client, h, ref, "payment_verified", version=version)
    assert r.status_code == 200, r.text
    payment = r.json()["payments"][0]
    assert payment["status"] == "verified" and payment["verified_by_name"] == staff.staff.full_name
    assert payment["proof"]["review_status"] == "accepted"
    assert client.get(f"{API}/staff/requests", headers=h, params={"payment": "pending"}).json()["total"] == 0

    student_view = client.get(f"{API}/requests/{ref}", headers=student_headers).json()
    assert student_view["payments"][0]["verified_by_name"] is None  # staff names stay internal


def test_reject_payment_lets_student_retry(client, db, student, student_headers):
    ref, _, h = awaiting_payment(client, db, student_headers)
    payment_id = pay(client, student_headers, ref).json()["payments"][0]["id"]
    stale = client.get(f"{API}/staff/requests/{ref}", headers=h).json()["version"]

    r = client.post(f"{API}/staff/requests/{ref}/payments/{payment_id}/reject", headers=h, json={"remarks": "   "})
    assert r.status_code == 422
    r = client.post(f"{API}/staff/requests/{ref}/payments/{payment_id}/reject", headers=h,
                    json={"remarks": "Receipt is unreadable", "version": stale})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "awaiting_payment" and r.json()["payments"][0]["status"] == "rejected"
    assert r.json()["payments"][0]["proof"]["review_status"] == "rejected"

    # A colleague still looking at the old version can't verify a payment that was just rejected.
    r = move(client, h, ref, "payment_verified", version=stale)
    assert r.status_code == 409 and r.json()["error"]["code"] == "STALE_REQUEST"

    db.expire_all()
    note = db.query(Notification).filter_by(user_id=student.id, type="payment_rejected").one()
    assert "Receipt is unreadable" in note.body
    assert db.query(AuditLog).filter_by(action="payment_rejected", entity_id=ref).count() == 1

    detail = client.get(f"{API}/requests/{ref}", headers=student_headers).json()
    assert "pay" in detail["allowed_actions"] and "Receipt is unreadable" in detail["latest_remarks"]
    r = client.post(f"{API}/staff/requests/{ref}/payments/{payment_id}/reject", headers=h, json={"remarks": "Again"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "PAYMENT_NOT_PENDING"
    assert pay(client, student_headers, ref, method="cashier", reference="OR-998877").status_code == 201


def test_walk_in_payment_is_recorded_on_verify(client, db, student_headers):
    ref, _, h = awaiting_payment(client, db, student_headers)
    r = move(client, h, ref, "payment_verified")
    payment = r.json()["payments"][0]
    assert payment["method"] == "cashier" and payment["status"] == "verified" and payment["proof"] is None
