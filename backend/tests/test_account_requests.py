from datetime import date

import pytest

from app.api.v1 import account_requests, auth
from app.core import deps
from app.models import AccountRequest, Role, Standing, User
from app.seed.seed import sample_pdf
from tests.conftest import PASSWORD, login, make_user
from tests.test_staff import staff_headers

API = "/api/v1"
NEW_PASSWORD = "N3w-passw0rd!"


@pytest.fixture()
def mail(monkeypatch):
    sent = []
    capture = lambda to, subject, text, html=None: sent.append((to, subject, text)) or False  # noqa: E731
    monkeypatch.setattr(account_requests, "send_email", capture)
    monkeypatch.setattr(auth, "send_email", capture)
    deps.account_request_limiter.hits.clear()
    return sent


def submit(client, **overrides):
    form = {"student_no": "2015-00123", "first_name": "Maria", "last_name": "Santos", "birthdate": "1996-05-14",
            "email": "Maria.Santos@Gmail.com", "program": "BSIT", "last_year_attended": "2019",
            "standing": "graduated", **overrides}
    file = overrides.pop("file", ("id.pdf", sample_pdf("ID"), "application/pdf"))
    form.pop("file", None)
    return client.post(f"{API}/account-requests", data=form, files={"id_file": file})


def set_password(client, link):
    r = client.post(f"{API}/auth/reset-password", json={"token": link.split("token=")[1], "new_password": NEW_PASSWORD})
    assert r.status_code == 200, r.text


def test_new_alumnus_gets_an_account(client, db, mail):
    r = submit(client)
    assert r.status_code == 201, r.text
    assert "maria.santos@gmail.com" in r.json()["message"]

    _, h = staff_headers(client, db)
    pending = client.get(f"{API}/staff/account-requests", headers=h).json()
    assert len(pending) == 1 and pending[0]["record"] is None and not pending[0]["email_in_use"]
    rid = pending[0]["id"]
    id_file = client.get(f"{API}/staff/account-requests/{rid}/id-file", headers=h)
    assert id_file.status_code == 200 and id_file.headers["content-type"] == "application/pdf"

    r = client.post(f"{API}/staff/account-requests/{rid}/approve", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved" and r.json()["reviewed_by_name"]
    to, subject, text = mail[-1]
    assert to == "maria.santos@gmail.com" and "access is ready" in subject and "2015-00123" in text

    account = db.query(User).filter_by(student_no="2015-00123").one()
    assert account.role == Role.student and account.student.standing == Standing.graduated
    assert account.student.program.code == "BSIT" and account.student.birthdate == date(1996, 5, 14)
    set_password(client, r.json()["setup_link"])
    login(client, "2015-00123", NEW_PASSWORD)
    login(client, "maria.santos@gmail.com", NEW_PASSWORD)

    again = client.post(f"{API}/staff/account-requests/{rid}/approve", headers=h)
    assert again.status_code == 409 and again.json()["error"]["code"] == "ALREADY_REVIEWED"


def test_existing_student_gets_personal_email_access(client, db, mail):
    old = make_user(db, student_no="2012-00999", email="old.mailbox@tua.edu.ph")
    old.student.first_name, old.student.last_name, old.student.birthdate = "Jose", "Rizal", date(1994, 6, 19)
    db.commit()
    assert submit(client, student_no="2012-00999", first_name="Jose", last_name="Rizal", birthdate="1994-06-19",
                  email="jose.rizal@yahoo.com").status_code == 201

    _, h = staff_headers(client, db)
    req = client.get(f"{API}/staff/account-requests", headers=h).json()[0]
    assert req["record"]["name_matches"] and req["record"]["birthdate_matches"]
    assert req["record"]["login_email"] == "old.mailbox@tua.edu.ph"

    r = client.post(f"{API}/staff/account-requests/{req['id']}/approve", headers=h)
    assert r.status_code == 200, r.text
    db.refresh(old.student)
    assert old.student.personal_email == "jose.rizal@yahoo.com" and old.student.personal_email_verified
    assert db.query(User).filter_by(role=Role.student).count() == 1  # no duplicate account

    set_password(client, r.json()["setup_link"])
    login(client, "jose.rizal@yahoo.com", NEW_PASSWORD)

    # Forgot password works with the personal email too, and the link goes there.
    mail.clear()
    client.post(f"{API}/auth/forgot-password", json={"email": "Jose.Rizal@yahoo.com"})
    assert [m[0] for m in mail] == ["jose.rizal@yahoo.com"]


def test_email_in_use_and_reject(client, db, mail):
    make_user(db, email="taken@gmail.com")
    submit(client, email="taken@gmail.com")
    _, h = staff_headers(client, db)
    req = client.get(f"{API}/staff/account-requests", headers=h).json()[0]
    assert req["email_in_use"]
    r = client.post(f"{API}/staff/account-requests/{req['id']}/approve", headers=h)
    assert r.status_code == 409 and r.json()["error"]["code"] == "EMAIL_IN_USE"

    assert client.post(f"{API}/staff/account-requests/{req['id']}/reject", headers=h, json={"remarks": ""}).status_code == 422
    r = client.post(f"{API}/staff/account-requests/{req['id']}/reject", headers=h,
                    json={"remarks": "We couldn't find this student number in our records."})
    assert r.status_code == 200 and r.json()["status"] == "rejected"
    assert mail[-1][0] == "taken@gmail.com" and "couldn't find this student number" in mail[-1][2]
    assert client.get(f"{API}/staff/account-requests", headers=h).json() == []
    assert len(client.get(f"{API}/staff/account-requests", headers=h, params={"status": "rejected"}).json()) == 1


def test_form_validation_and_access(client, db, student_headers, mail):
    r = submit(client, last_year_attended=str(date.today().year + 1), birthdate="2020-01-01", standing="enrolled")
    assert r.status_code == 422
    assert {d["field"] for d in r.json()["error"]["details"]} == {"last_year_attended", "birthdate", "standing"}
    assert submit(client, file=("id.pdf", b"not a pdf", "application/pdf")).status_code == 415
    assert db.query(AccountRequest).count() == 0

    assert client.get(f"{API}/staff/account-requests", headers=student_headers).status_code == 403
    assert client.get(f"{API}/staff/account-requests").status_code == 401


def test_form_is_rate_limited(client, mail):
    codes = [submit(client).status_code for _ in range(6)]
    assert codes == [201] * 5 + [429]


def test_login_with_unverified_personal_email_fails(client, db):
    user = make_user(db)
    user.student.personal_email = "unverified@gmail.com"
    db.commit()
    r = client.post(f"{API}/auth/login", json={"identifier": "unverified@gmail.com", "password": PASSWORD})
    assert r.status_code == 401
