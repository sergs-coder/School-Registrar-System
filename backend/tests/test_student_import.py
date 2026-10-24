import re

import pytest

from app.api.v1 import admin as admin_api
from app.models import AuditLog, Role, Student, User
from tests.conftest import login, make_user

API = "/api/v1"
HEADER = "student_no,email,first_name,middle_name,last_name,program,year_level,birthdate,contact_no\n"


@pytest.fixture()
def sent(monkeypatch):
    out = []
    monkeypatch.setattr(admin_api, "send_email", lambda to, subject, text, html=None: out.append((to, subject, text)))
    return out


@pytest.fixture()
def admin_h(client, db):
    return login(client, make_user(db, role=Role.admin).email)


def upload(client, headers, text, confirm=False, encoding="utf-8"):
    return client.post(f"{API}/admin/students/import", headers=headers,
                       files={"file": ("enrollment.csv", text.encode(encoding), "text/csv")},
                       data={"confirm": "true" if confirm else "false"})


def test_preview_then_confirm_creates_accounts(client, db, admin_h, sent):
    csv = HEADER + (
        "2026-30001,Ana.Reyes@tua.edu.ph,Ana,Santos,Reyes,BSIT,1,2007-03-14,09171234567\n"
        "2026-30002,ben.cruz@tua.edu.ph,Benjamín,,Cruz,Bachelor of Science in Computer Science,,,\n"
    )
    preview = upload(client, admin_h, csv)
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert (body["confirmed"], body["to_create"], body["skipped"], body["errors"]) == (False, 2, 0, 0)
    assert db.query(Student).filter(Student.student_no.like("2026-%")).count() == 0 and sent == []

    r = upload(client, admin_h, csv, confirm=True)
    assert r.status_code == 200 and r.json()["to_create"] == 2
    ana = db.query(User).filter_by(student_no="2026-30001").one()
    assert ana.email == "ana.reyes@tua.edu.ph" and ana.role == Role.student
    assert (ana.student.middle_name, ana.student.program.code, ana.student.year_level, str(ana.student.birthdate)) \
        == ("Santos", "BSIT", 1, "2007-03-14")
    assert db.query(Student).filter_by(student_no="2026-30002").one().program.code == "BSCS"
    assert db.query(AuditLog).filter_by(action="students_imported").one().meta["created"] == 2

    # Each student gets a set-password link that works, then signs in with the student number.
    assert sorted(to for to, _, _ in sent) == ["ana.reyes@tua.edu.ph", "ben.cruz@tua.edu.ph"]
    to, subject, text = next(m for m in sent if m[0] == "ana.reyes@tua.edu.ph")
    assert subject == "Your TUA Student Request Portal account" and "2026-30001" in text
    token = re.search(r"token=([\w-]+)", text).group(1)
    assert client.post(f"{API}/auth/reset-password", json={"token": token, "new_password": "Welcome123"}).status_code == 200
    login(client, "2026-30001", "Welcome123")

    # Uploading the same list again changes nothing.
    again = upload(client, admin_h, csv, confirm=True).json()
    assert (again["to_create"], again["skipped"]) == (0, 2) and len(sent) == 2


def test_row_errors_are_reported_and_valid_rows_still_import(client, db, admin_h, sent):
    existing = make_user(db)
    csv = HEADER + (
        f"{existing.student_no},new@tua.edu.ph,Old,,Student,,,,\n"
        f"2026-40001,{existing.email},Taken,,Email,,,,\n"
        "2026-40002,good@tua.edu.ph,Good,,Row,BSIT,2,03/14/2006,\n"
        "2026-40003,not-an-email,Bad,,Email,,,,\n"
        "2026-40004,x@tua.edu.ph,,,NoFirst,ZZZ,9,2006-02-30,12345\n"
        "2026-40002,dup@tua.edu.ph,Dup,,Number,,,,\n"
        ",,,,,,,,\n"
    )
    body = upload(client, admin_h, csv).json()
    by_line = {r["line"]: r for r in body["rows"]}
    assert [by_line[n]["status"] for n in range(2, 8)] == ["skip", "skip", "create", "error", "error", "error"]
    assert 8 not in by_line  # blank lines are ignored
    assert len(by_line[6]["messages"]) == 5  # first name, program, year level, birth date, contact no.
    assert by_line[7]["messages"] == ["Same student number as line 4."]

    r = upload(client, admin_h, csv, confirm=True).json()
    assert (r["to_create"], r["skipped"], r["errors"]) == (1, 2, 3)
    assert [to for to, _, _ in sent] == ["good@tua.edu.ph"]
    assert db.query(User).filter_by(student_no="2026-40002").one().email == "good@tua.edu.ph"


def test_file_level_problems(client, db, admin_h):
    r = upload(client, admin_h, "email,first_name\nx@tua.edu.ph,X\n")
    assert r.status_code == 422 and r.json()["error"]["code"] == "MISSING_COLUMNS"
    assert upload(client, admin_h, "").json()["error"]["code"] == "EMPTY_FILE"

    # Excel-style headers and a Windows (cp1252) file still work.
    csv = "Student Number,Email Address,First Name,Last Name\n2026-50001,nino@tua.edu.ph,Niño,Peña\n"
    body = upload(client, admin_h, csv, encoding="cp1252").json()
    assert body["rows"][0]["name"] == "Niño Peña" and body["to_create"] == 1


def test_only_admins_can_import(client, db, student_headers):
    staff_h = login(client, make_user(db, role=Role.staff).email)
    for h in (staff_h, student_headers):
        assert upload(client, h, HEADER).status_code == 403
