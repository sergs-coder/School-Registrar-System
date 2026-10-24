import pytest

from app.models import AuditLog
from app.services import notifications
from app.services.email_templates import MINT, YELLOW
from tests.conftest import doc_id
from tests.test_staff import move, staff_headers, submitted_request

API = "/api/v1"


@pytest.fixture()
def outbox(monkeypatch):
    """Captures every email the notification service sends: (to, subject, text, html). Reports them as
    not sent, so nothing tries to mark the notification in the app's real database."""
    sent = []
    monkeypatch.setattr(notifications, "send_email", lambda to, subject, text, html=None: sent.append((to, subject, text, html)) and False)
    return sent


def set_personal(client, headers, email):
    return client.put(f"{API}/me/personal-email", headers=headers, json={"email": email})


def confirm(client, link):
    return client.post(f"{API}/auth/verify-personal-email", json={"token": link.split("token=")[1]})


def test_personal_email_must_be_confirmed_before_use(client, db, student, student_headers, outbox):
    r = set_personal(client, student_headers, "Juan.Personal@Gmail.com")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["profile"]["personal_email"] == "juan.personal@gmail.com"
    assert body["profile"]["personal_email_verified"] is False
    link = body["verify_link"]  # development only

    ref = submitted_request(client, db, student_headers)
    assert [to for to, *_ in outbox] == [student.email]  # unconfirmed address gets nothing
    outbox.clear()

    assert confirm(client, link).status_code == 200
    assert confirm(client, link).status_code == 400  # one-time
    profile = client.get(f"{API}/me/profile", headers=student_headers).json()
    assert profile["personal_email_verified"] is True

    _, h = staff_headers(client, db)
    move(client, h, ref, "under_review")
    assert sorted(to for to, *_ in outbox) == sorted([student.email, "juan.personal@gmail.com"])
    db.expire_all()
    assert db.query(AuditLog).filter_by(action="personal_email_verified").count() == 1


def test_personal_email_validation_resend_and_remove(client, student, student_headers, outbox):
    r = set_personal(client, student_headers, student.email.upper())
    assert r.status_code == 422 and r.json()["error"]["details"][0]["field"] == "email"
    assert set_personal(client, student_headers, "not-an-email").status_code == 422
    assert client.post(f"{API}/me/personal-email/resend", headers=student_headers).status_code == 409

    first = set_personal(client, student_headers, "me@example.com").json()["verify_link"]
    second = client.post(f"{API}/me/personal-email/resend", headers=student_headers).json()["verify_link"]
    assert first != second
    assert confirm(client, first).status_code == 400  # superseded by the resend
    assert confirm(client, second).status_code == 200

    # Changing the address needs a fresh confirmation.
    out = set_personal(client, student_headers, "new@example.com").json()
    assert out["profile"]["personal_email_verified"] is False
    removed = set_personal(client, student_headers, None).json()["profile"]
    assert removed["personal_email"] is None and removed["personal_email_verified"] is False
    assert confirm(client, out["verify_link"]).status_code == 400  # link died with the address


def test_every_status_change_sends_a_tracking_email(client, db, student, student_headers, outbox):
    ref = submitted_request(client, db, student_headers)
    _, h = staff_headers(client, db)
    for to in ("under_review", "approve", "payment_verified", "processing", "ready_for_pickup", "completed"):
        assert move(client, h, ref, to).status_code == 200
    subjects = [subject for _, subject, *_ in outbox]
    assert len(subjects) == 7  # submitted + every staff move, including the formerly in-app-only ones
    assert subjects[2] == f"[TUA Registrar] {ref}: Approved"
    assert subjects[-1] == f"[TUA Registrar] {ref}: Released"

    _, _, text, html = outbox[2]  # approval email
    assert "Next: pay the fee" in text and "[>] Payment" in text and "[x] Review" in text
    assert "Track your request" in html and f"/requests/{ref}" in html
    # The current step is yellow when it's the student's turn (pay), light green while the Registrar works.
    assert YELLOW in html and MINT not in html
    _, _, _, processing_html = outbox[4]
    assert MINT in processing_html and YELLOW not in processing_html
    _, _, text, _ = outbox[-1]
    assert "[x] Released" in text and "has been released" in text


def test_free_document_approval_says_approved(client, db, student_headers, outbox):
    body = {"document_type_id": doc_id(db, "SHF"), "purpose": "Shift to another program",
            "form_data": {"new_program": "BSCS", "effective_term": "1st Semester", "reason": "Interest"}}
    ref = client.post(f"{API}/requests", json=body, headers=student_headers).json()["reference_no"]
    client.post(f"{API}/requests/{ref}/submit", headers=student_headers)
    _, h = staff_headers(client, db)
    move(client, h, ref, "under_review")
    move(client, h, ref, "approve")  # no fee: straight to processing
    _, subject, text, _ = outbox[-1]
    assert subject.endswith(": Approved") and "your request was approved" in text
    assert "Payment" not in text  # free documents have no payment step in the tracker


def test_remarks_are_escaped_in_html(client, db, student_headers, outbox):
    ref = submitted_request(client, db, student_headers)
    _, h = staff_headers(client, db)
    move(client, h, ref, "under_review")
    move(client, h, ref, "rejected", "<script>alert(1)</script> duplicate")
    _, subject, text, html = outbox[-1]
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert "[!] Review" in text  # tracker shows where it stopped
